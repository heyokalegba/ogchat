import type { ChatError, ChatMessage, Session, StreamEvent } from "@/lib/types";
import { ProviderError, streamChat } from "@/lib/provider/adapter";
import { beginGeneration, endGeneration, type Generation } from "./generations";
import { resolveSettings } from "./settings";
import { appendMessage, getSession, toMeta, truncateFrom } from "./store";

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
  { kind: "message"; content: string; replaceFromMessageId?: string } | { kind: "regenerate" };

export function parseSendInput(body: Record<string, unknown>): SendInput {
  if (body.regenerate === true) return { kind: "regenerate" };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) throw new ChatRequestError(400, "empty_message", "Message is empty.");
  if (content.length > MAX_MESSAGE_CHARS) {
    throw new ChatRequestError(413, "message_too_long", "Message is too long.");
  }
  const replace = body.replaceFromMessageId;
  if (replace !== undefined && typeof replace !== "string") {
    throw new ChatRequestError(400, "bad_request", "replaceFromMessageId must be a string.");
  }
  return { kind: "message", content, replaceFromMessageId: replace };
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
      if (input.replaceFromMessageId) {
        const target = session.messages.find((m) => m.id === input.replaceFromMessageId);
        if (!target || target.role !== "user") {
          throw new ChatRequestError(400, "bad_message", "That message can no longer be edited.");
        }
        truncateFrom(sessionId, target.id);
      }
      const appended = appendMessage(sessionId, { role: "user", content: input.content });
      if (!appended) throw new ChatRequestError(404, "not_found", "Session not found.");
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
      messages: turn.session.messages.map(({ role, content }) => ({ role, content })),
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
