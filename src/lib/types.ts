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
  /** On a reply: which model wrote it, and how hard it was asked to think. */
  ranOn?: RanOn;
  /** On a reply: how long it took, thinking included, in milliseconds. */
  durationMs?: number;
}

/**
 * Which model a reply came from and at which thinking level, as sent and as
 * reported back. `model` is the one the provider says answered when it says
 * (Claude Code's "fable" alias comes back as the full id it chose, and a
 * declined request the API hands on comes back as the model that took it);
 * otherwise it is the one asked for.
 */
export interface RanOn {
  provider: ProviderChoice;
  /** What the chat was set to: a full id, or an alias such as "fable" or "default". */
  requested: string;
  /** What answered, as far as is known. */
  model: string;
  /** The thinking level sent with it; null when none was sent and the model chose. */
  effort: string | null;
  /** Which Claude account it ran on, by name. Only set when there is more than one to be on. */
  account?: string;
}

/** Whether a provider is one of the two ways to Claude, rather than any other model. */
export function isClaudeProvider(provider: ProviderChoice | null | undefined): boolean {
  return provider === "claude" || provider === "claudecode";
}

/**
 * How hard a reasoning model should think before it answers. "default"
 * sends nothing and leaves it to the provider. "xhigh" sits between high
 * and max; providers that do not take it are sent "high".
 */
export const REASONING_EFFORTS = ["default", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** The project this session belongs to, or null for a chat on its own. */
  projectId: string | null;
  /** The model this chat uses, or null to use whichever is chosen in settings. */
  model: SessionModel | null;
  /** How hard this chat's model thinks, or null to use the level in settings. */
  reasoning: ReasoningEffort | null;
  /** The GitHub repository this chat works on ("owner/name"), or null for its project's, if any. */
  repo: string | null;
  /** The branch its work starts from, or null for the repository's default branch. */
  branch: string | null;
  /** The environment its commands run in, or null for the default one. */
  environmentId: string | null;
}

/** Where a chat works: what the bar above the message box sets. */
export type SessionWork = Pick<SessionMeta, "repo" | "branch" | "environmentId">;

/** A named set-up for the folder Claude runs commands in. */
export interface Environment {
  id: string;
  name: string;
  /** Whether its commands may use the network. */
  network: "full" | "none";
  /** A shell script run once when a chat's workspace is first used. "" for none. */
  setup: string;
  /** Variables its commands are given. */
  vars: Record<string, string>;
}

/** A repository the GitHub token can reach. */
export interface RepoChoice {
  name: string;
  private: boolean;
  defaultBranch: string;
}

/** A model, and which of the two providers it is asked through. */
export interface SessionModel {
  provider: ProviderChoice;
  model: string;
}

/** A model a chat can be set to: what the picker under the message box lists. */
export interface ModelChoice extends SessionModel {
  label: string;
  /** Whether its provider has a key. */
  ready: boolean;
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

/** The id of the Claude account every install has. The others have ids of their own. */
export const MAIN_ACCOUNT = "main";

/**
 * A Claude account ogchat can be switched to. An account is a sign-in of
 * Claude Code's (a folder of its own on this computer), an API key, or both.
 * What an added account does not have of its own, it shares with the main one.
 */
export interface ClaudeAccount {
  id: string;
  name: string;
  /** Where Claude Code keeps this account's sign-in. "" for none of its own. */
  configDir: string;
  /** Its API key, masked as every key is. */
  key: { set: boolean; masked: string | null; source: KeySource | null };
  /** The workspace id sent with its key. "" for none. */
  workspace: string;
}

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
  active: { ready: boolean; model: string; provider: ProviderChoice };
  /** Every model a chat can be set to: Claude's, and the other provider's. */
  choices: ModelChoice[];
  /** Claude: the model, and the key (masked, as the other one is). */
  claude: {
    model: string;
    key: { set: boolean; masked: string | null; source: KeySource | null };
    /** The workspace id sent with each request, for a key not tied to one. "" for none. */
    workspace: string;
    /** The models the settings panel offers. Any other id can be typed. */
    models: { id: string; label: string }[];
    /** The account in use (the key and workspace above are its own), and every account: the main one first. */
    account: string;
    accounts: ClaudeAccount[];
  };
  /** The GitHub token Claude's repository tools use (masked). */
  github: { set: boolean; masked: string | null; source: KeySource | null };
  /**
   * Claude Code: the program on this computer, used with whichever account it
   * is signed in to in the terminal. Whether it was found, where its sign-in
   * is kept ("" for its usual place), and what it may do in a chat's folder:
   * "plan" (look only), "edit" (change files) or "run" (change files and run commands).
   */
  claudeCode: {
    found: boolean;
    path: string;
    configDir: string;
    permission: "plan" | "edit" | "run" | "auto";
    model: string;
  };
  /** Whether Claude may run commands here, and whether this system can fence them in. */
  runCode: { enabled: boolean; sandbox: "macos" | "none" };
}

export const PROVIDER_CHOICES = ["compatible", "claude", "claudecode"] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];

/** One line of a settings test: what was checked and what was found. */
export interface SettingsCheckStep {
  id: "settings" | "key" | "model" | "reply" | "github" | "code" | "claudecode";
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
  /** Which model is answering and at what thinking level: sent first, and again if the provider names another. */
  | { type: "model"; ranOn: RanOn }
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
  /** Which model is answering and at what thinking level, when `generating` is true. */
  ranOn: RanOn | null;
  /** When the reply in progress was started (ISO), when `generating` is true. */
  startedAt: string | null;
  /** How full the model's context window is with this session as it stands. */
  context: ContextUse;
}
