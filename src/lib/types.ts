/** Types shared by the server routes and the browser client. */

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  /** Set on an assistant reply that was cut short (stopped, or interrupted by an error). */
  partial?: boolean;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Session extends SessionMeta {
  messages: ChatMessage[];
}

export type KeySource = "settings" | "env";

/** What the browser is allowed to know about the provider configuration. */
export interface PublicSettings {
  baseUrl: string;
  model: string;
  apiKey: {
    set: boolean;
    /** Masked form only, e.g. "••••••••a1b2". The raw key never leaves the server. */
    masked: string | null;
    source: KeySource | null;
  };
  defaults: { baseUrl: string; model: string };
}

export interface ChatError {
  code: string;
  message: string;
  status?: number;
}

/** One line of the NDJSON stream returned by POST /api/sessions/:id/messages. */
export type StreamEvent =
  | { type: "start"; session: SessionMeta; userMessage: ChatMessage | null }
  | { type: "delta"; text: string }
  | { type: "done"; session: SessionMeta; message: ChatMessage | null; stopped: boolean }
  | { type: "error"; session: SessionMeta; error: ChatError; message: ChatMessage | null };

export type SendBody = { content: string; replaceFromMessageId?: string } | { regenerate: true };

export interface SessionDetail {
  session: Session;
  /** True while the server is still producing a reply for this session. */
  generating: boolean;
  /** Text produced so far when `generating` is true. */
  partial: string;
}
