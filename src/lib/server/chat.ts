import type { ChatError, ChatMessage, Session, StreamEvent } from "@/lib/types";
import { ProviderError, streamChat } from "@/lib/provider/adapter";
import { MAX_FILES_PER_MESSAGE, MAX_REQUEST_BYTES } from "@/lib/limits";
import { buildProviderMessages } from "./context";
import { FileRejected, ingestFile, saveFile, type IngestedFile } from "./files";
import { beginGeneration, endGeneration, type Generation } from "./generations";
import { BadRequest, readBody } from "./http";
import { resolveSettings } from "./settings";
import { appendMessage, getSession, pruneSessionFiles, toMeta, truncateFrom } from "./store";

/** Turn handling: validate the request, persist the user's side, then stream the reply. */

export const MAX_MESSAGE_CHARS = 400_000;

export class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type SendInput =
  | { kind: "message"; content: string; replaceFromMessageId?: string; uploads: IngestedFile[] }
  | { kind: "regenerate" };

function messageInput(rawContent: unknown, replace: unknown, uploads: IngestedFile[]): SendInput {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (content.length > MAX_MESSAGE_CHARS) {
    throw new ChatRequestError(413, "message_too_long", "Message is too long.");
  }
  if (replace !== undefined && replace !== null && typeof replace !== "string") {
    throw new ChatRequestError(400, "bad_request", "replaceFromMessageId must be a string.");
  }
  const replaceFromMessageId = typeof replace === "string" && replace ? replace : undefined;
  // An edit may legitimately be empty when the original message carried files; that is
  // checked once the target message is known.
  if (!content && uploads.length === 0 && !replaceFromMessageId) {
    throw new ChatRequestError(400, "empty_message", "Message is empty.");
  }
  return { kind: "message", content, replaceFromMessageId, uploads };
}

export function parseSendInput(body: Record<string, unknown>): SendInput {
  if (body.regenerate === true) return { kind: "regenerate" };
  return messageInput(body.content, body.replaceFromMessageId, []);
}

/**
 * Reads a send request: JSON, or multipart form data when files are attached
 * (fields `content`, `replaceFromMessageId`, and any number of `files`).
 * Files are inspected here, before anything is stored.
 */
export async function readSendInput(request: Request): Promise<SendInput> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    return parseSendInput(await readBody(request));
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) {
    throw new ChatRequestError(
      413,
      "request_too_large",
      "These files are too large to send together.",
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BadRequest("Could not read the uploaded files.");
  }
  const files = form.getAll("files").filter((entry): entry is File => typeof entry !== "string");
  if (files.length > MAX_FILES_PER_MESSAGE) {
    throw new ChatRequestError(
      400,
      "too_many_files",
      `Attach at most ${MAX_FILES_PER_MESSAGE} files per message.`,
    );
  }
  const uploads: IngestedFile[] = [];
  try {
    for (const file of files) {
      uploads.push(
        await ingestFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }),
      );
    }
  } catch (err) {
    if (err instanceof FileRejected) throw new ChatRequestError(err.status, err.code, err.message);
    throw err;
  }
  const replace = form.get("replaceFromMessageId");
  return messageInput(
    form.get("content"),
    typeof replace === "string" ? replace : undefined,
    uploads,
  );
}

export interface PreparedTurn {
  session: Session;
  userMessage: ChatMessage | null;
  generation: Generation;
}

/**
 * Applies the user's side of a turn and reserves the session for the reply.
 * Synchronous from start to finish, so two requests cannot interleave here.
 */
export function prepareTurn(sessionId: string, input: SendInput): PreparedTurn {
  const existing = getSession(sessionId);
  if (!existing) throw new ChatRequestError(404, "not_found", "Session not found.");

  const generation = beginGeneration(sessionId);
  if (!generation) {
    throw new ChatRequestError(409, "busy", "This session is already generating a reply.");
  }

  try {
    let session = existing;
    let userMessage: ChatMessage | null = null;

    if (input.kind === "regenerate") {
      const last = session.messages.at(-1);
      if (last?.role === "assistant") {
        session = truncateFrom(sessionId, last.id) ?? session;
      }
      if (session.messages.at(-1)?.role !== "user") {
        throw new ChatRequestError(400, "nothing_to_retry", "There is no message to reply to.");
      }
    } else {
      // Editing a message keeps the files that were attached to it.
      let carried = [] as NonNullable<ChatMessage["attachments"]>;
      let target: ChatMessage | undefined;
      if (input.replaceFromMessageId) {
        target = session.messages.find((m) => m.id === input.replaceFromMessageId);
        if (!target || target.role !== "user") {
          throw new ChatRequestError(400, "bad_message", "That message can no longer be edited.");
        }
        carried = target.attachments ?? [];
      }
      const attachments = [...carried, ...input.uploads.map((upload) => upload.attachment)];
      if (!input.content && attachments.length === 0) {
        throw new ChatRequestError(400, "empty_message", "Message is empty.");
      }
      if (attachments.length > MAX_FILES_PER_MESSAGE) {
        throw new ChatRequestError(
          400,
          "too_many_files",
          `Attach at most ${MAX_FILES_PER_MESSAGE} files per message.`,
        );
      }
      if (target) truncateFrom(sessionId, target.id);
      for (const upload of input.uploads) saveFile(sessionId, upload.attachment.id, upload.data);
      const appended = appendMessage(sessionId, {
        role: "user",
        content: input.content,
        attachments,
      });
      if (!appended) throw new ChatRequestError(404, "not_found", "Session not found.");
      pruneSessionFiles(sessionId);
      session = appended.session;
      userMessage = appended.message;
    }
    return { session, userMessage, generation };
  } catch (err) {
    endGeneration(sessionId, generation);
    throw err;
  }
}

function toChatError(err: unknown): ChatError {
  if (err instanceof ProviderError) {
    return { code: err.code, message: err.message, ...(err.status ? { status: err.status } : {}) };
  }
  return { code: "internal", message: "Something went wrong while generating the reply." };
}

/**
 * Streams the reply for a prepared turn, reporting progress to `listener`.
 * Never throws. It keeps going if nobody is listening any more, so a reply
 * that was in flight when the browser tab closed is still saved.
 */
export async function runTurn(
  sessionId: string,
  turn: PreparedTurn,
  listener: (event: StreamEvent) => void,
): Promise<void> {
  const { generation } = turn;
  const emit = (event: StreamEvent) => {
    try {
      listener(event);
    } catch {
      // A listener that went away must not affect the turn.
    }
  };
  const meta = () => toMeta(getSession(sessionId) ?? turn.session);

  /** Saves whatever text arrived. `partial` marks a reply that did not finish. */
  const persist = (partial: boolean): ChatMessage | null => {
    if (!generation.partial.trim()) return null;
    return (
      appendMessage(sessionId, {
        role: "assistant",
        content: generation.partial,
        partial,
      })?.message ?? null
    );
  };

  try {
    emit({ type: "start", session: toMeta(turn.session), userMessage: turn.userMessage });
    const settings = resolveSettings();
    const stream = streamChat({
      config: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
      messages: buildProviderMessages(turn.session),
      signal: generation.controller.signal,
    });
    for await (const text of stream) {
      generation.partial += text;
      emit({ type: "delta", text });
    }
    const message = persist(false);
    emit({ type: "done", session: meta(), message, stopped: false });
  } catch (err) {
    try {
      const message = persist(true);
      if (generation.controller.signal.aborted) {
        emit({ type: "done", session: meta(), message, stopped: true });
      } else {
        if (!(err instanceof ProviderError)) console.error("[ogchat] reply failed:", err);
        emit({ type: "error", session: meta(), error: toChatError(err), message });
      }
    } catch (inner) {
      console.error("[ogchat] could not record the failed reply:", inner);
    }
  } finally {
    endGeneration(sessionId, generation);
  }
}
