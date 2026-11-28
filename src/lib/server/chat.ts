import type { ChatError, ChatMessage, ContextUse, Session, StreamEvent } from "@/lib/types";
import { ProviderError, type ProviderMessage } from "@/lib/provider/adapter";
import { MAX_FILES_PER_MESSAGE, MAX_REQUEST_BYTES } from "@/lib/limits";
import { buildProviderMessages, liveMessages, measureContext, tokensOf } from "./context";
import { FileRejected, ingestFile, saveFile, type IngestedFile } from "./files";
import { beginGeneration, endGeneration, type Generation } from "./generations";
import { BadRequest, readBody } from "./http";
import { githubTools, repoBriefing } from "./github";
import { commandBriefing, commandTool } from "./workspace";
import { environmentFor } from "./environments";
import { codeBriefing, codeFolder, githubEnv } from "./claudecode";
import { getProject } from "./projects";
import { ranOnFor, streamReply } from "./reply";
import { resolveSettings, settingsFor } from "./settings";
import {
  appendMessage,
  getCodeSession,
  getSession,
  setCodeSession,
  pruneSessionFiles,
  setSummary,
  toMeta,
  truncateFrom,
} from "./store";

/** Turn handling: validate the request, persist the user's side, then stream the reply. */

export const MAX_MESSAGE_CHARS = 400_000;
/** The longest a summary is waited for. Overridable for tests. */
const compressTimeoutMs = () => Number(process.env.OGCHAT_COMPRESS_TIMEOUT_MS) || 240_000;

/** How much of a reply's reasoning is kept with it. */
const MAX_THINKING_CHARS = 200_000;

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
  | {
      kind: "message";
      content: string;
      replaceFromMessageId?: string;
      uploads: IngestedFile[];
      /** Search the web for this message. */
      web: boolean;
      /** An earlier message to ask again as a new one, with the files it carried. */
      replayOf?: string;
    }
  | { kind: "regenerate" };

function messageInput(
  rawContent: unknown,
  replace: unknown,
  uploads: IngestedFile[],
  web: boolean,
  replay?: unknown,
): SendInput {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (content.length > MAX_MESSAGE_CHARS) {
    throw new ChatRequestError(413, "message_too_long", "Message is too long.");
  }
  if (replace !== undefined && replace !== null && typeof replace !== "string") {
    throw new ChatRequestError(400, "bad_request", "replaceFromMessageId must be a string.");
  }
  const replaceFromMessageId = typeof replace === "string" && replace ? replace : undefined;
  if (replay !== undefined && replay !== null && typeof replay !== "string") {
    throw new ChatRequestError(400, "bad_request", "replayOf must be a string.");
  }
  const replayOf = typeof replay === "string" && replay ? replay : undefined;
  // An edit may legitimately be empty when the original message carried files; that is
  // checked once the target message is known.
  if (!content && uploads.length === 0 && !replaceFromMessageId && !replayOf) {
    throw new ChatRequestError(400, "empty_message", "Message is empty.");
  }
  return { kind: "message", content, replaceFromMessageId, uploads, web, replayOf };
}

export function parseSendInput(body: Record<string, unknown>): SendInput {
  if (body.regenerate === true) return { kind: "regenerate" };
  return messageInput(
    body.content,
    body.replaceFromMessageId,
    [],
    body.web === true,
    body.replayOf,
  );
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
    form.get("web") === "true",
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
      // Asking an earlier question again: the same words unless new ones were sent, and
      // the same files. The files are shared with the original, not copied.
      let content = input.content;
      if (input.replayOf) {
        const source = session.messages.find((m) => m.id === input.replayOf);
        if (!source || source.role !== "user") {
          throw new ChatRequestError(
            400,
            "bad_message",
            "That message is no longer there to ask again.",
          );
        }
        carried = source.attachments ?? [];
        content ||= source.content;
      }
      const attachments = [...carried, ...input.uploads.map((upload) => upload.attachment)];
      if (!content && attachments.length === 0) {
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
        content,
        attachments,
        web: input.web,
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

/** Added when a request that asked for web search is turned down. */
const WEB_HINT =
  " This message asked for web search. On abliteration.ai that has to be switched on for your account first (console: Account, then Web tools). Or turn the web button off and retry.";

/** Added when a request that carried images is turned down as malformed. */
const IMAGE_HINT =
  " This conversation includes an image, and some models only read text (abliterated-model-large-v2 is one). Delete the message with the image, or switch model in settings.";

function toChatError(err: unknown, sentImages = false, web = false): ChatError {
  if (err instanceof ProviderError) {
    const refused = err.status === 400 || err.status === 422;
    const hint =
      (sentImages && refused ? IMAGE_HINT : "") +
      (web && (refused || err.status === 403) ? WEB_HINT : "");
    return {
      code: err.code,
      message: `${err.message}${hint}`,
      ...(err.status ? { status: err.status } : {}),
    };
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
        // What it reasoned on the way, kept with the reply for anyone curious.
        thinking: generation.thinking.slice(0, MAX_THINKING_CHARS),
        ranOn: generation.ranOn,
        durationMs: Date.now() - generation.startedAt,
      })?.message ?? null
    );
  };

  let sentImages = false;
  // Whether the message being answered asked for web search. A retry asks again.
  const web = turn.session.messages.findLast((m) => m.role === "user")?.web === true;
  try {
    emit({ type: "start", session: toMeta(turn.session), userMessage: turn.userMessage });
    // The chat's own model if it has one, otherwise the one in settings.
    const settings = settingsFor(turn.session.model);
    const project = turn.session.projectId ? getProject(turn.session.projectId) : null;
    // With Claude, a project tied to a repository, and a GitHub token, Claude gets the repository.
    // The repository is the chat's own if it has picked one, otherwise its project's.
    const repo =
      settings.provider === "claude" && settings.githubToken
        ? (turn.session.repo ?? project?.repo)
        : undefined;
    const baseBranch = turn.session.repo ? turn.session.branch : null;
    const environment = environmentFor(turn.session.environmentId);
    // And, if that has been switched on, a way to run commands in a folder kept for the chat.
    const running = settings.provider === "claude" && settings.runCode;
    const given = [
      ...(repo ? githubTools({ token: settings.githubToken!, repo, sessionId, baseBranch }) : []),
      ...(running
        ? [
            commandTool({
              sessionId,
              repo: repo ? { name: repo, token: settings.githubToken!, baseBranch } : null,
              environment,
            }),
          ]
        : []),
    ];
    const tools = given.length ? given : undefined;
    const system = [
      settings.systemPrompt,
      repo ? repoBriefing(repo, sessionId, baseBranch) : "",
      running ? commandBriefing(repo ?? null, environment) : "",
    ]
      .filter((part) => part.trim())
      .join("\n\n");
    // Claude Code works differently: it is the program on this computer, in a folder of
    // the chat's (a clone of its repository, if it has one), with a session of its own
    // that is carried on from message to message.
    let code:
      | {
          cwd: string;
          resume: string | null;
          onSession: (id: string) => void;
          vars: Record<string, string>;
        }
      | undefined;
    let codeId: string | null = null;
    let codeHome = "";
    let codeSystem = "";
    if (settings.provider === "claudecode") {
      // A folder of your own comes first; then the chat's repository, or its project's.
      const codeDir = turn.session.folder ?? null;
      const codeRepo = codeDir ? null : (turn.session.repo ?? project?.repo ?? null);
      const cwd = await codeFolder({
        sessionId,
        folder: codeDir,
        repo: codeRepo,
        baseBranch,
        token: settings.githubToken,
        signal: generation.controller.signal,
      });
      const kept = getCodeSession(sessionId);
      const before = turn.session.messages.at(-2)?.id ?? null;
      const summaryAt = turn.session.summary?.at ?? null;
      // Claude Code keeps a session with the account it ran on, so it is only
      // carried on while the chat is still on that account.
      codeHome = settings.claudeCodeConfigDir?.trim() ?? "";
      const resume =
        kept &&
        kept.cwd === cwd &&
        kept.after === before &&
        kept.summaryAt === summaryAt &&
        (kept.home ?? "") === codeHome
          ? kept.id
          : null;
      codeId = resume;
      code = {
        cwd,
        resume,
        onSession: (id) => {
          codeId = id;
        },
        vars: { ...environment.vars, ...githubEnv(settings.githubToken) },
      };
      codeSystem = [
        settings.systemPrompt,
        codeBriefing({
          sessionId,
          folder: codeDir,
          repo: codeRepo,
          baseBranch,
          permission: settings.claudeCodePermission,
          environment,
          hasToken: Boolean(settings.githubToken),
        }),
      ]
        .filter((part) => part.trim())
        .join("\n\n");
    }
    const messages = buildProviderMessages(turn.session, code ? codeSystem : system, project);
    sentImages = messages.some(
      (m) => Array.isArray(m.content) && m.content.some((part) => part.type === "image_url"),
    );
    const reasoning = turn.session.reasoning ?? settings.reasoning;
    // Which model and thinking level this is going to, said before anything comes back.
    const ranOn = ranOnFor(settings, reasoning);
    generation.ranOn = ranOn;
    emit({ type: "model", ranOn });
    const stream = streamReply(settings, messages, {
      signal: generation.controller.signal,
      reasoning,
      webSearch: web,
      tools,
      code,
      onThinking: (text) => {
        generation.thinking += text;
        emit({ type: "thinking", text });
      },
      // An alias resolved, or a declined request handed to another model: say which.
      onModel: (id) => {
        if (generation.ranOn?.model === id) return;
        generation.ranOn = { ...ranOn, model: id };
        emit({ type: "model", ranOn: generation.ranOn });
      },
    });
    for await (const text of stream) {
      generation.partial += text;
      emit({ type: "delta", text });
    }
    const message = persist(false);
    // Remember which Claude Code session this reply belongs to, to carry on from it.
    if (code && codeId && message) {
      setCodeSession(sessionId, {
        id: codeId,
        after: message.id,
        cwd: code.cwd,
        summaryAt: turn.session.summary?.at ?? null,
        home: codeHome,
      });
    }
    emit({ type: "done", session: meta(), message, stopped: false });
  } catch (err) {
    try {
      const message = persist(true);
      if (generation.controller.signal.aborted) {
        emit({ type: "done", session: meta(), message, stopped: true });
      } else {
        if (!(err instanceof ProviderError)) console.error("[ogchat] reply failed:", err);
        // The hints about images and web search are about the default provider, not Claude.
        const hinted = settingsFor(turn.session.model).provider === "compatible";
        const error = toChatError(err, hinted && sentImages, hinted && web);
        emit({ type: "error", session: meta(), error, message });
      }
    } catch (inner) {
      console.error("[ogchat] could not record the failed reply:", inner);
    }
  } finally {
    endGeneration(sessionId, generation);
  }
}

/** How full the context window is with a session as it stands. */
export function contextOf(session: Session): ContextUse {
  const settings = resolveSettings();
  const project = session.projectId ? getProject(session.projectId) : null;
  return measureContext(session, settings.systemPrompt, project, settings.contextWindow);
}

/** What the model is asked to do when a conversation is compressed. */
const COMPRESS_REQUEST = `Stop here. Do not reply to the conversation: summarise it.

Write a summary of everything above that can stand in for it, so the conversation can carry on from the summary alone with the original messages gone. Write it as notes for yourself, not as a message to the user. Keep:

- what the user is trying to do, and why
- every decision, conclusion and agreed plan, with the reasons that matter
- the user's instructions and preferences about how to work or how to answer
- names, numbers, dates, file names, identifiers and exact wording wherever they matter
- code, commands and configuration that are still in play, verbatim
- the contents of attached files as far as they were used or will be needed
- what is unfinished, what was about to happen next, and questions still open

Leave out pleasantries and anything settled and no longer relevant. Be as long as the conversation needs, and no longer. Output only the summary.`;

/** The share of the context window a request to compress may fill, leaving room to answer. */
const COMPRESS_ROOM = 0.85;

/**
 * Compresses a session: asks the model for a summary of the conversation so
 * far and records it, so that from now on the summary is sent in place of
 * the messages it covers. The messages stay in the session to read.
 *
 * A conversation already too long for the window loses its oldest messages
 * from the request (not from the session), so that there is always a way
 * back from a full window.
 */
export async function compressSession(sessionId: string, signal?: AbortSignal): Promise<Session> {
  const session = getSession(sessionId);
  if (!session) throw new ChatRequestError(404, "not_found", "Session not found.");
  const live = liveMessages(session);
  const last = live.at(-1);
  if (!last || live.length < 2) {
    throw new ChatRequestError(
      400,
      "nothing_to_compress",
      "There is not enough conversation here to compress yet.",
    );
  }
  const generation = beginGeneration(sessionId);
  if (!generation) {
    throw new ChatRequestError(409, "busy", "This session is busy. Try again when it is done.");
  }
  const onAbort = () => generation.controller.abort();
  signal?.addEventListener("abort", onAbort);
  // A summary that has not come in this long is not coming: give up rather than wait for ever.
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    generation.controller.abort();
  }, compressTimeoutMs());
  try {
    const settings = settingsFor(session.model);
    const project = session.projectId ? getProject(session.projectId) : null;
    const all = buildProviderMessages(session, settings.systemPrompt, project);
    const lead = all.filter((m) => m.role === "system");
    const rest = all.filter((m) => m.role !== "system");
    const ask: ProviderMessage = { role: "user", content: COMPRESS_REQUEST };
    // Newest first, as many as fit; what does not fit is left out of the request.
    let room =
      settings.contextWindow * COMPRESS_ROOM -
      [...lead, ask].reduce((sum, m) => sum + tokensOf(m), 0);
    const kept: ProviderMessage[] = [];
    for (const message of rest.toReversed()) {
      room -= tokensOf(message);
      if (room < 0 && kept.length > 0) break;
      kept.unshift(message);
    }
    if (kept.length < rest.length) {
      kept.unshift({
        role: "user",
        content:
          "[The earliest messages of this conversation are not shown: it had grown too long.]",
      });
    }

    let text = "";
    const stream = streamReply(settings, [...lead, ...kept, ask], {
      signal: generation.controller.signal,
      // A summary wants care more than cleverness. Claude is asked to keep its thinking
      // short, which is most of the wait on a long conversation; the other provider's
      // own default is left alone.
      reasoning: settings.provider === "claude" ? "low" : undefined,
    });
    for await (const piece of stream) text += piece;
    if (!text.trim()) {
      throw new ChatRequestError(502, "empty_summary", "The model sent back an empty summary.");
    }
    // The conversation may have been edited while the summary was being written.
    const now = getSession(sessionId);
    if (!now?.messages.some((m) => m.id === last.id)) {
      throw new ChatRequestError(
        409,
        "changed",
        "The conversation changed while it was compressed.",
      );
    }
    return setSummary(sessionId, { text: text.trim(), upTo: last.id }) ?? now;
  } catch (err) {
    if (err instanceof ChatRequestError) throw err;
    if (late) {
      throw new ChatRequestError(
        504,
        "compress_timeout",
        "The summary took too long and was given up on. Nothing was changed. Try again, or set this chat to a quicker model first.",
      );
    }
    if (err instanceof ProviderError) {
      const { message } = toChatError(err);
      throw new ChatRequestError(err.code === "aborted" ? 499 : 502, err.code, message);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    endGeneration(sessionId, generation);
  }
}

/** Takes a session's summary away again, so the whole conversation is sent as before. */
export function expandSession(sessionId: string): Session {
  const session = setSummary(sessionId, null);
  if (!session) throw new ChatRequestError(404, "not_found", "Session not found.");
  return session;
}
