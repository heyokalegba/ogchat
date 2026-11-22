/** Types shared by the server routes and the browser client. */

export type Role = "system" | "user" | "assistant";

/**
 * How an attached file reaches the model:
 *   "text"   its text is inlined into the prompt (text files, and PDFs after extraction)
 *   "image"  it is sent as an image part, for models that can see
 */
export type AttachmentKind = "text" | "image";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  /** Size of the uploaded file in bytes. */
  size: number;
  kind: AttachmentKind;
  /** The text was longer than the per-file limit and was cut. */
  truncated?: boolean;
  /** Browser only: a local preview URL while the upload is in flight. Never stored. */
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  /** Set on an assistant reply that was cut short (stopped, or interrupted by an error). */
  partial?: boolean;
  /** Files attached to a user message. */
  attachments?: Attachment[];
  /** Set on a user message that was sent with web search on, so a retry searches again. */
  web?: boolean;
  /**
   * On a reply: what the model reasoned before answering, when the provider
   * shared it. Shown on request; never sent back to the provider.
   */
  thinking?: string;
}

/**
 * How hard a reasoning model should think before it answers. "default"
 * sends nothing and leaves it to the provider.
 */
export const REASONING_EFFORTS = ["default", "low", "medium", "high", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** The project this session belongs to, or null for a chat on its own. */
  projectId: string | null;
}

/**
 * A project: a set of sessions that share standing context. Its instructions
 * and its files are sent ahead of every conversation in it.
 */
export interface Project {
  id: string;
  name: string;
  /** What the model should know or do in every chat of this project. */
  instructions: string;
  files: Attachment[];
  createdAt: string;
  updatedAt: string;
  /** How many sessions are filed under it. */
  sessionCount: number;
  /** A GitHub repository ("owner/name") Claude can read and change in this project's chats. */
  repo?: string;
}

/**
 * What stands in for the early part of a long conversation once it has been
 * compressed: the model's own summary of everything up to one message. The
 * messages themselves stay in the session to read; only the summary and what
 * came after it are sent to the provider.
 */
export interface SessionSummary {
  text: string;
  /** The last message the summary covers. */
  upTo: string;
  /** When it was made, as an ISO timestamp. */
  at: string;
}

export interface Session extends SessionMeta {
  messages: ChatMessage[];
  summary?: SessionSummary;
}

/**
 * How much of the model's context window a session takes up, in tokens. The
 * count is an estimate from the length of the text (providers count a little
 * differently); the limit is the context window from settings.
 */
export interface ContextUse {
  tokens: number;
  limit: number;
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
  reasoning: ReasoningEffort;
  /** Instructions sent ahead of every conversation. Empty for none. */
  systemPrompt: string;
  /** How many tokens the model can take in at once: what the context meter measures against. */
  contextWindow: number;
  /** Which of the two ways to a model is in use: any OpenAI-shaped provider, or Claude. */
  provider: ProviderChoice;
  /** The provider in use, in two words: whether it has a key, and which model it will ask. */
  active: { ready: boolean; model: string };
  /** Claude: the model, and the key (masked, as the other one is). */
  claude: {
    model: string;
    key: { set: boolean; masked: string | null; source: KeySource | null };
    /** The models the settings panel offers. Any other id can be typed. */
    models: { id: string; label: string }[];
  };
  /** The GitHub token Claude's repository tools use (masked). */
  github: { set: boolean; masked: string | null; source: KeySource | null };
  /** Whether Claude may run commands here, and whether this system can fence them in. */
  runCode: { enabled: boolean; sandbox: "macos" | "none" };
}

export const PROVIDER_CHOICES = ["compatible", "claude"] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];

/** One line of a settings test: what was checked and what was found. */
export interface SettingsCheckStep {
  id: "settings" | "key" | "model" | "reply" | "github" | "code";
  /** true: fine. false: this is what is wrong. null: could not tell, or worth a look. */
  ok: boolean | null;
  title: string;
  detail: string;
}

export interface SettingsCheck {
  ok: boolean;
  steps: SettingsCheckStep[];
}

export interface ChatError {
  code: string;
  message: string;
  status?: number;
}

/** One line of the NDJSON stream returned by POST /api/sessions/:id/messages. */
export type StreamEvent =
  | { type: "start"; session: SessionMeta; userMessage: ChatMessage | null }
  /** The model is reasoning before it answers. `text` is the next piece of that reasoning. */
  | { type: "thinking"; text?: string }
  | { type: "delta"; text: string }
  | { type: "done"; session: SessionMeta; message: ChatMessage | null; stopped: boolean }
  | { type: "error"; session: SessionMeta; error: ChatError; message: ChatMessage | null };

export type SendBody =
  | {
      content: string;
      replaceFromMessageId?: string;
      /** Browser only: files to upload with this message (sent as multipart form data). */
      files?: File[];
      /** Let the provider search the web for this message. */
      web?: boolean;
      /** Ask an earlier question again: the id of the message to repeat, files and all. */
      replayOf?: string;
    }
  | { regenerate: true };

export interface SessionDetail {
  session: Session;
  /** True while the server is still producing a reply for this session. */
  generating: boolean;
  /** Text produced so far when `generating` is true. */
  partial: string;
  /** Reasoning produced so far when `generating` is true. */
  thinking: string;
  /** How full the model's context window is with this session as it stands. */
  context: ContextUse;
}
