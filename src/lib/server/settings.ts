import { isAccountColor, nextAccountColor } from "@/lib/accounts";
import {
  MAIN_ACCOUNT,
  REASONING_EFFORTS,
  PROVIDER_CHOICES,
  type ClaudeAccount,
  type KeySource,
  type ProviderChoice,
  type PublicSettings,
  type ReasoningEffort,
  type ModelChoice,
  type SessionModel,
} from "@/lib/types";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from "@/lib/provider/claude";
import { maskKey } from "@/lib/provider/redact";
import { canChooseFolder } from "./folders";
import { readJson, writeJsonAtomic } from "./fsjson";
import { settingsFile } from "./paths";
import { sandboxKind } from "./workspace";
import {
  CODE_MODELS,
  CODE_PERMISSIONS,
  findClaudeCode,
  type CodePermission,
  type CodeSetup,
} from "./claudecode";

/**
 * Provider settings. Resolution order, per field:
 *   1. the local settings file (<data>/settings.json, written by the settings panel)
 *   2. environment (.env.local): OGCHAT_API_BASE_URL, OGCHAT_API_KEY, OGCHAT_MODEL
 *   3. the defaults below
 *
 * The API key only ever leaves this module inside ResolvedSettings, which is
 * handed to the provider adapter. Everything bound for the browser goes
 * through publicSettings(), which carries the masked form only.
 */

export const DEFAULT_BASE_URL = "https://api.abliteration.ai/v1";
export const DEFAULT_MODEL = "abliterated-model-large-v2";
export const MAX_SYSTEM_PROMPT_CHARS = 20_000;
/** abliterated-model-large-v2 is listed with a context window of a million tokens. */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const CONTEXT_WINDOW_RANGE = { min: 1_000, max: 20_000_000 };

export interface ResolvedSettings {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  keySource: KeySource | null;
  reasoning: ReasoningEffort;
  systemPrompt: string;
  contextWindow: number;
  provider: ProviderChoice;
  claudeKey: string | null;
  claudeKeySource: KeySource | null;
  claudeModel: string;
  /** A workspace id, for a key that is not tied to one workspace. "" for none. */
  claudeWorkspace: string;
  githubToken: string | null;
  githubTokenSource: KeySource | null;
  /** Whether Claude may run commands on this machine. Off unless switched on. */
  runCode: boolean;
  /** Claude Code: where it is (null: found by itself), where its sign-in is kept, what it may do. */
  claudeCodePath: string | null;
  claudeCodeConfigDir: string | null;
  claudeCodePermission: CodePermission;
  claudeCodeModel: string;
  /**
   * The Claude account in use, by id. The key, workspace and sign-in folder
   * above are that account's: its own, or the main account's where it has none.
   */
  claudeAccount: string;
  /**
   * Whose account a reply is on, by name, for each way to Claude: the account
   * in use where it has a key (or a sign-in) of its own, otherwise the main
   * one. Null when there is only the one account, so there is nothing to tell apart.
   */
  claudeAccountOn: { claude: string | null; claudecode: string | null };
  /** The same, by id, and always: which account's key, and which one's sign-in, is the one used. */
  claudeAccountIdOn: { claude: string; claudecode: string };
}

/** A Claude account besides the main one. It has a sign-in folder, a key, or both. */
interface StoredAccount {
  id: string;
  name: string;
  configDir?: string;
  key?: string;
  workspace?: string;
  /** The colour its chats are marked with. Given one when it is first saved. */
  color?: string;
}

export const MAX_ACCOUNTS = 12;
const ACCOUNT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

interface StoredSettings {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  reasoning?: ReasoningEffort;
  systemPrompt?: string;
  contextWindow?: number;
  provider?: ProviderChoice;
  claudeKey?: string;
  claudeModel?: string;
  claudeWorkspace?: string;
  githubToken?: string;
  runCode?: boolean;
  claudeCodePath?: string;
  claudeCodeConfigDir?: string;
  claudeCodePermission?: CodePermission;
  claudeCodeModel?: string;
  /** The main account's name, if it was given one other than "main". */
  claudeMainName?: string;
  /** The main account's colour, if it was given one. */
  claudeMainColor?: string;
  /** The other accounts, and the id of the one in use (absent: the main one). */
  claudeAccounts?: StoredAccount[];
  claudeAccount?: string;
}

export interface SettingsPatch {
  baseUrl?: unknown;
  model?: unknown;
  /** One of REASONING_EFFORTS. */
  reasoning?: unknown;
  /** Text sent as the system message of every conversation; "" for none. */
  systemPrompt?: unknown;
  /** The model's context window in tokens; null or 0 goes back to the default. */
  contextWindow?: unknown;
  /** A string replaces the saved key; null or "" removes it; undefined leaves it alone. */
  apiKey?: unknown;
  /** "compatible", "claude" or "claudecode". */
  provider?: unknown;
  /** The Claude key and the GitHub token: saved, removed and left alone as `apiKey` is. */
  claudeKey?: unknown;
  claudeModel?: unknown;
  /** A workspace id, or "" for none. */
  claudeWorkspace?: unknown;
  githubToken?: unknown;
  /** true or false. */
  runCode?: unknown;
  /** Claude Code: paths ("" for the usual ones), "plan" | "edit" | "run" | "auto", and a model alias. */
  claudeCodePath?: unknown;
  claudeCodeConfigDir?: unknown;
  claudeCodePermission?: unknown;
  claudeCodeModel?: unknown;
  /** The name the main Claude account goes by; "" or null for "main". */
  claudeMainName?: unknown;
  /** The main account's colour: one of ACCOUNT_COLORS by id; "" or null for the usual one. */
  claudeMainColor?: unknown;
  /**
   * Every Claude account besides the main one: { id, name, configDir, workspace, key, color }.
   * The list replaces the saved one. A `key` is saved, removed and left alone
   * as `apiKey` is, by the account's id.
   */
  claudeAccounts?: unknown;
  /** The id of the account to use: "main", or one of the others. */
  claudeAccount?: unknown;
}

export class SettingsValidationError extends Error {}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isProvider(value: unknown): value is ProviderChoice {
  return typeof value === "string" && (PROVIDER_CHOICES as readonly string[]).includes(value);
}

function isEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

function readStored(): StoredSettings {
  let raw: unknown;
  try {
    raw = readJson(settingsFile());
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  return {
    baseUrl: str(s.baseUrl),
    model: str(s.model),
    apiKey: str(s.apiKey),
    reasoning: isEffort(s.reasoning) && s.reasoning !== "default" ? s.reasoning : undefined,
    provider: isProvider(s.provider) && s.provider !== "compatible" ? s.provider : undefined,
    claudeKey: str(s.claudeKey),
    claudeModel: str(s.claudeModel),
    claudeWorkspace: str(s.claudeWorkspace),
    githubToken: str(s.githubToken),
    runCode: s.runCode === true ? true : undefined,
    claudeCodePath: str(s.claudeCodePath),
    claudeCodeConfigDir: str(s.claudeCodeConfigDir),
    claudeCodePermission: isPermission(s.claudeCodePermission) ? s.claudeCodePermission : undefined,
    claudeCodeModel: str(s.claudeCodeModel),
    claudeMainName: str(s.claudeMainName),
    claudeMainColor: isAccountColor(s.claudeMainColor) ? s.claudeMainColor : undefined,
    claudeAccounts: readAccounts(s.claudeAccounts),
    claudeAccount: str(s.claudeAccount),
    systemPrompt:
      typeof s.systemPrompt === "string" && s.systemPrompt.trim()
        ? s.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS)
        : undefined,
    contextWindow:
      typeof s.contextWindow === "number" &&
      s.contextWindow >= CONTEXT_WINDOW_RANGE.min &&
      s.contextWindow <= CONTEXT_WINDOW_RANGE.max
        ? Math.round(s.contextWindow)
        : undefined,
  };
}

function readAccounts(value: unknown): StoredAccount[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: StoredAccount[] = [];
  for (const one of value) {
    if (!one || typeof one !== "object") continue;
    const a = one as Record<string, unknown>;
    const id = str(a.id);
    const name = str(a.name);
    if (!id || !name || !ACCOUNT_ID.test(id) || id === MAIN_ACCOUNT) continue;
    if (list.some((kept) => kept.id === id)) continue;
    list.push({
      id,
      name,
      configDir: str(a.configDir),
      key: str(a.key),
      workspace: str(a.workspace),
      color: isAccountColor(a.color) ? a.color : undefined,
    });
  }
  return list.length ? list : undefined;
}

function writeStored(stored: StoredSettings): void {
  // Owner-only: this file can hold the API key.
  writeJsonAtomic(settingsFile(), stored, 0o600);
}

export function normalizeBaseUrl(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new SettingsValidationError("API base URL is required.");
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SettingsValidationError("API base URL must be a full URL, like https://host/v1.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SettingsValidationError("API base URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new SettingsValidationError("API base URL must not contain credentials.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

export function resolveSettings(): ResolvedSettings {
  return resolveFrom(readStored());
}

function resolveFrom(stored: StoredSettings): ResolvedSettings {
  const envKey = env("OGCHAT_API_KEY");
  // The Claude account in use. What it has none of its own, it shares with the main one.
  const account = stored.claudeAccounts?.find((one) => one.id === stored.claudeAccount) ?? null;
  const several = Boolean(stored.claudeAccounts?.length);
  const mainName = stored.claudeMainName ?? MAIN_ACCOUNT;
  return {
    baseUrl: stored.baseUrl ?? env("OGCHAT_API_BASE_URL") ?? DEFAULT_BASE_URL,
    model: stored.model ?? env("OGCHAT_MODEL") ?? DEFAULT_MODEL,
    apiKey: stored.apiKey ?? envKey,
    keySource: stored.apiKey ? "settings" : envKey ? "env" : null,
    reasoning: stored.reasoning ?? "default",
    systemPrompt: stored.systemPrompt ?? "",
    contextWindow: stored.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    provider: stored.provider ?? "compatible",
    claudeKey: account?.key ?? stored.claudeKey ?? env("ANTHROPIC_API_KEY"),
    claudeKeySource:
      account?.key || stored.claudeKey ? "settings" : env("ANTHROPIC_API_KEY") ? "env" : null,
    claudeModel: stored.claudeModel ?? DEFAULT_CLAUDE_MODEL,
    // A workspace id goes with a key: an account with its own key has its own, or none.
    claudeWorkspace: account?.key
      ? (account.workspace ?? "")
      : (stored.claudeWorkspace ?? env("ANTHROPIC_WORKSPACE_ID") ?? ""),
    githubToken: stored.githubToken ?? env("OGCHAT_GITHUB_TOKEN"),
    githubTokenSource: stored.githubToken ? "settings" : env("OGCHAT_GITHUB_TOKEN") ? "env" : null,
    runCode: stored.runCode === true,
    claudeCodePath: stored.claudeCodePath ?? null,
    claudeCodeConfigDir: account?.configDir ?? stored.claudeCodeConfigDir ?? null,
    claudeCodePermission: stored.claudeCodePermission ?? "edit",
    claudeCodeModel: stored.claudeCodeModel ?? "default",
    claudeAccount: account?.id ?? MAIN_ACCOUNT,
    claudeAccountOn: {
      claude: several ? (account?.key ? account.name : mainName) : null,
      claudecode: several ? (account?.configDir ? account.name : mainName) : null,
    },
    claudeAccountIdOn: {
      claude: account?.key ? account.id : MAIN_ACCOUNT,
      claudecode: account?.configDir ? account.id : MAIN_ACCOUNT,
    },
  };
}

/**
 * Each account's colour, the main one's first. One that was never given a
 * colour takes the first that no other account has, so no two look alike
 * until there are more accounts than colours.
 */
function accountColors(stored: StoredSettings): string[] {
  const given = [stored.claudeMainColor, ...(stored.claudeAccounts ?? []).map((one) => one.color)];
  const taken: (string | undefined)[] = [...given];
  return given.map((color, i) => {
    if (color) return color;
    const next = nextAccountColor(taken);
    taken[i] = next;
    return next;
  });
}

/** Every Claude account as the browser may see it: the main one first, keys masked. */
function accountList(stored: StoredSettings): ClaudeAccount[] {
  const mainKey = stored.claudeKey ?? env("ANTHROPIC_API_KEY");
  const shown = (key: string | null | undefined, source: KeySource): ClaudeAccount["key"] => ({
    set: Boolean(key),
    masked: key ? maskKey(key) : null,
    source: key ? source : null,
  });
  const colors = accountColors(stored);
  return [
    {
      id: MAIN_ACCOUNT,
      name: stored.claudeMainName ?? MAIN_ACCOUNT,
      color: colors[0]!,
      configDir: stored.claudeCodeConfigDir ?? "",
      key: shown(mainKey, stored.claudeKey ? "settings" : "env"),
      workspace: stored.claudeWorkspace ?? env("ANTHROPIC_WORKSPACE_ID") ?? "",
    },
    ...(stored.claudeAccounts ?? []).map((one, i) => ({
      id: one.id,
      name: one.name,
      color: colors[i + 1]!,
      configDir: one.configDir ?? "",
      key: shown(one.key, "settings"),
      workspace: one.workspace ?? "",
    })),
  ];
}

/** Claude Code as these settings have it: where it is, where it is signed in, what it may do. */
export function codeSetup(s: ResolvedSettings): CodeSetup {
  return {
    path: s.claudeCodePath,
    configDir: s.claudeCodeConfigDir,
    permission: s.claudeCodePermission,
  };
}

/** The key and the model the chosen provider uses: what a turn is sent with. */
export function activeModel(s: ResolvedSettings): { key: string | null; model: string } {
  // Claude Code has no key of ogchat's: it is ready if the program is there.
  if (s.provider === "claudecode") {
    return { key: findClaudeCode(s.claudeCodePath), model: s.claudeCodeModel };
  }
  return s.provider === "claude"
    ? { key: s.claudeKey, model: s.claudeModel }
    : { key: s.apiKey, model: s.model };
}

/** Every model a chat can be set to. */
function modelChoices(s: ResolvedSettings): ModelChoice[] {
  const claude: { id: string; label: string }[] = CLAUDE_MODELS.map((m) => ({ ...m }));
  // A Claude model typed by hand in settings is offered too.
  if (!claude.some((m) => m.id === s.claudeModel)) {
    claude.push({ id: s.claudeModel, label: s.claudeModel });
  }
  return [
    ...claude.map((m) => ({
      provider: "claude" as const,
      model: m.id,
      label: m.label,
      ready: Boolean(s.claudeKey),
    })),
    { provider: "compatible" as const, model: s.model, label: s.model, ready: Boolean(s.apiKey) },
    ...CODE_MODELS.map((m) => ({
      provider: "claudecode" as const,
      model: m.id,
      label: m.label,
      ready: Boolean(findClaudeCode(s.claudeCodePath)),
    })),
  ];
}

/** A chat's own model, as sent by the browser: checked, or null if it is not one. */
export function cleanSessionModel(input: unknown): SessionModel | null {
  if (!input || typeof input !== "object") return null;
  const given = input as Record<string, unknown>;
  const model = str(given.model);
  if (!isProvider(given.provider) || !model || model.length > 200) return null;
  return { provider: given.provider, model };
}

/** The settings a chat's turn is sent with: the saved ones, with the chat's own model if it has one. */
export function settingsFor(model: SessionModel | null | undefined): ResolvedSettings {
  const s = resolveSettings();
  if (!model) return s;
  if (model.provider === "claudecode") {
    return { ...s, provider: "claudecode", claudeCodeModel: model.model };
  }
  return model.provider === "claude"
    ? { ...s, provider: "claude", claudeModel: model.model }
    : { ...s, provider: "compatible", model: model.model };
}

export function publicSettings(): PublicSettings {
  const stored = readStored();
  const s = resolveFrom(stored);
  return {
    baseUrl: s.baseUrl,
    model: s.model,
    apiKey: {
      set: Boolean(s.apiKey),
      masked: s.apiKey ? maskKey(s.apiKey) : null,
      source: s.keySource,
    },
    defaults: { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
    reasoning: s.reasoning,
    systemPrompt: s.systemPrompt,
    contextWindow: s.contextWindow,
    provider: s.provider,
    active: {
      ready: Boolean(activeModel(s).key),
      model: activeModel(s).model,
      provider: s.provider,
    },
    choices: modelChoices(s),
    claude: {
      model: s.claudeModel,
      workspace: s.claudeWorkspace,
      key: {
        set: Boolean(s.claudeKey),
        masked: s.claudeKey ? maskKey(s.claudeKey) : null,
        source: s.claudeKeySource,
      },
      models: CLAUDE_MODELS.map((model) => ({ ...model })),
      account: s.claudeAccount,
      accounts: accountList(stored),
    },
    github: {
      set: Boolean(s.githubToken),
      masked: s.githubToken ? maskKey(s.githubToken) : null,
      source: s.githubTokenSource,
    },
    runCode: { enabled: s.runCode, sandbox: sandboxKind() },
    claudeCode: {
      found: Boolean(findClaudeCode(s.claudeCodePath)),
      path: s.claudeCodePath ?? "",
      configDir: s.claudeCodeConfigDir ?? "",
      permission: s.claudeCodePermission,
      model: s.claudeCodeModel,
      folderDialog: canChooseFolder(),
    },
  };
}

/** An account's colour as it was sent: one of the colours, or null for "the usual one". */
function cleanColor(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (!isAccountColor(input)) {
    throw new SettingsValidationError("That is not one of the colours an account can have.");
  }
  return input;
}

/** A key as typed: null when there is none, an error when it cannot be a key. */
function cleanKey(input: unknown): string | null {
  if (input === null || input === "") return null;
  if (typeof input !== "string") throw new SettingsValidationError("API key must be text.");
  const key = input.trim();
  if (!key) return null;
  if (/\s/.test(key) || /[^\x21-\x7e]/.test(key)) {
    throw new SettingsValidationError("That does not look like an API key. Paste the key only.");
  }
  if (key.length > 1000) throw new SettingsValidationError("API key is too long.");
  return key;
}

/** A workspace id as typed: "" for none, an error if it cannot be one. */
function cleanWorkspace(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input !== "string") throw new SettingsValidationError("Workspace id must be text.");
  const id = input.trim();
  if (id && !/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
    throw new SettingsValidationError(
      "That does not look like a workspace id. It starts with wrkspc_ and has no spaces.",
    );
  }
  return id;
}

function isPermission(value: unknown): value is CodePermission {
  return (CODE_PERMISSIONS as readonly unknown[]).includes(value);
}

/** A file or folder path as typed: null for none, an error if it cannot be one. */
function cleanPath(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string") throw new SettingsValidationError("A path must be text.");
  const value = input.trim();
  if (!value) return null;
  if (value.length > 500 || /[\0\n\r]/.test(value) || !/^(~|\/)/.test(value)) {
    throw new SettingsValidationError("Give a full path, starting with / or ~.");
  }
  return value;
}

function cleanModel(input: unknown): string {
  const model = str(input);
  if (!model) throw new SettingsValidationError("Model id is required.");
  if (model.length > 200) throw new SettingsValidationError("Model id is too long.");
  return model;
}

/** An account's name as typed: one line, not empty, not long. */
function cleanName(input: unknown): string {
  if (typeof input !== "string") {
    throw new SettingsValidationError("An account name must be text.");
  }
  const name = input.replace(/\s+/g, " ").trim();
  if (!name) throw new SettingsValidationError("Give every Claude account a name.");
  if (name.length > 40) {
    throw new SettingsValidationError("An account name can be 40 characters at most.");
  }
  return name;
}

/** The main account's own fields in a patch, put into `stored`. */
function applyMainAccount(stored: StoredSettings, patch: SettingsPatch): void {
  if (patch.claudeKey !== undefined) {
    const key = cleanKey(patch.claudeKey);
    if (key) stored.claudeKey = key;
    else delete stored.claudeKey;
  }
  if (patch.claudeWorkspace !== undefined) {
    const workspace = cleanWorkspace(patch.claudeWorkspace);
    if (workspace) stored.claudeWorkspace = workspace;
    else delete stored.claudeWorkspace;
  }
  if (patch.claudeCodeConfigDir !== undefined) {
    const value = cleanPath(patch.claudeCodeConfigDir);
    if (value) stored.claudeCodeConfigDir = value;
    else delete stored.claudeCodeConfigDir;
  }
  if (patch.claudeMainName !== undefined) {
    const name =
      patch.claudeMainName === null || patch.claudeMainName === ""
        ? MAIN_ACCOUNT
        : cleanName(patch.claudeMainName);
    if (name === MAIN_ACCOUNT) delete stored.claudeMainName;
    else stored.claudeMainName = name;
  }
  if (patch.claudeMainColor !== undefined) {
    const color = cleanColor(patch.claudeMainColor);
    if (color) stored.claudeMainColor = color;
    else delete stored.claudeMainColor;
  }
}

/** The other accounts in a patch, and which account is in use, put into `stored`. */
function applyAccounts(stored: StoredSettings, patch: SettingsPatch): void {
  if (patch.claudeAccounts !== undefined) {
    if (!Array.isArray(patch.claudeAccounts)) {
      throw new SettingsValidationError("Claude accounts must be a list.");
    }
    if (patch.claudeAccounts.length > MAX_ACCOUNTS) {
      throw new SettingsValidationError(`There can be ${MAX_ACCOUNTS} added accounts at most.`);
    }
    const before = stored.claudeAccounts ?? [];
    const next: StoredAccount[] = [];
    for (const one of patch.claudeAccounts as unknown[]) {
      if (!one || typeof one !== "object") {
        throw new SettingsValidationError("Each Claude account must be an object.");
      }
      const given = one as Record<string, unknown>;
      const id = typeof given.id === "string" ? given.id : "";
      if (!ACCOUNT_ID.test(id) || id === MAIN_ACCOUNT) {
        throw new SettingsValidationError(
          'An account id is lower-case letters, digits and dashes, and is not "main".',
        );
      }
      if (next.some((kept) => kept.id === id)) {
        throw new SettingsValidationError("Two Claude accounts have the same id.");
      }
      const name = cleanName(given.name);
      const configDir = cleanPath(given.configDir) ?? undefined;
      // A key not mentioned is the one already saved for this account.
      const key =
        given.key === undefined
          ? before.find((kept) => kept.id === id)?.key
          : (cleanKey(given.key) ?? undefined);
      const workspace = cleanWorkspace(given.workspace) || undefined;
      // A colour not mentioned is the one it has; a new account is given one below.
      const color =
        given.color === undefined
          ? before.find((kept) => kept.id === id)?.color
          : (cleanColor(given.color) ?? undefined);
      if (!configDir && !key) {
        throw new SettingsValidationError(
          `The account "${name}" needs a sign-in folder for Claude Code, an API key, or both.`,
        );
      }
      next.push({ id, name, configDir, key, workspace, color });
    }
    if (next.length) stored.claudeAccounts = next;
    else delete stored.claudeAccounts;
  }
  // Once there is more than one account, each keeps the colour it has, so that
  // taking one off the list does not repaint the chats of the others.
  if (stored.claudeAccounts?.length) {
    const colors = accountColors(stored);
    stored.claudeMainColor = colors[0];
    stored.claudeAccounts = stored.claudeAccounts.map((one, i) => ({
      ...one,
      color: colors[i + 1],
    }));
  }

  const names = [stored.claudeMainName ?? MAIN_ACCOUNT].concat(
    (stored.claudeAccounts ?? []).map((one) => one.name),
  );
  const twice = names.find(
    (name, i) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) !== i,
  );
  if (twice) {
    throw new SettingsValidationError(`Two Claude accounts are called "${twice}".`);
  }

  if (patch.claudeAccount !== undefined) {
    const id = patch.claudeAccount;
    if (id === MAIN_ACCOUNT || id === null || id === "") delete stored.claudeAccount;
    else if (typeof id === "string" && stored.claudeAccounts?.some((one) => one.id === id)) {
      stored.claudeAccount = id;
    } else throw new SettingsValidationError("There is no such Claude account.");
  }
  // The account in use was taken off the list: back to the main one.
  if (!stored.claudeAccounts?.some((one) => one.id === stored.claudeAccount)) {
    delete stored.claudeAccount;
  }
}

/**
 * The settings a request would use if `patch` were saved, without saving it.
 * Lets the settings panel test what is typed before committing to it.
 */
export function previewSettings(patch: SettingsPatch): ResolvedSettings {
  // The accounts as the patch would leave them. A key marked for removal is still the one tried.
  const stored = readStored();
  applyMainAccount(stored, { ...patch, claudeKey: patch.claudeKey || undefined });
  applyAccounts(stored, patch);
  const current = resolveFrom(stored);
  const typedKey = patch.apiKey === undefined ? null : cleanKey(patch.apiKey);
  return {
    ...current,
    baseUrl: patch.baseUrl === undefined ? current.baseUrl : normalizeBaseUrl(patch.baseUrl),
    model: patch.model === undefined ? current.model : cleanModel(patch.model),
    apiKey: typedKey ?? current.apiKey,
    keySource: typedKey ? "settings" : current.keySource,
    provider: isProvider(patch.provider) ? patch.provider : current.provider,
    claudeModel:
      patch.claudeModel === undefined ? current.claudeModel : cleanModel(patch.claudeModel),
    githubToken:
      (patch.githubToken === undefined ? null : cleanKey(patch.githubToken)) ?? current.githubToken,
    runCode: typeof patch.runCode === "boolean" ? patch.runCode : current.runCode,
    claudeCodePath:
      patch.claudeCodePath === undefined ? current.claudeCodePath : cleanPath(patch.claudeCodePath),
    claudeCodePermission: isPermission(patch.claudeCodePermission)
      ? patch.claudeCodePermission
      : current.claudeCodePermission,
    claudeCodeModel:
      patch.claudeCodeModel === undefined
        ? current.claudeCodeModel
        : cleanModel(patch.claudeCodeModel),
  };
}

export function updateSettings(patch: SettingsPatch): PublicSettings {
  const stored = readStored();

  if (patch.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(patch.baseUrl);
    // A value equal to what env/defaults already give is not an override.
    const fallback = env("OGCHAT_API_BASE_URL") ?? DEFAULT_BASE_URL;
    if (baseUrl === fallback.replace(/\/+$/, "")) delete stored.baseUrl;
    else stored.baseUrl = baseUrl;
  }

  if (patch.model !== undefined) {
    const model = cleanModel(patch.model);
    const fallback = env("OGCHAT_MODEL") ?? DEFAULT_MODEL;
    if (model === fallback) delete stored.model;
    else stored.model = model;
  }

  if (patch.apiKey !== undefined) {
    const key = cleanKey(patch.apiKey);
    if (key) stored.apiKey = key;
    else delete stored.apiKey;
  }

  if (patch.reasoning !== undefined) {
    if (!isEffort(patch.reasoning)) {
      throw new SettingsValidationError(
        `Reasoning must be one of: ${REASONING_EFFORTS.join(", ")}.`,
      );
    }
    if (patch.reasoning === "default") delete stored.reasoning;
    else stored.reasoning = patch.reasoning;
  }

  if (patch.systemPrompt !== undefined) {
    if (typeof patch.systemPrompt !== "string") {
      throw new SettingsValidationError("System prompt must be text.");
    }
    if (patch.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
      throw new SettingsValidationError(
        `System prompt is too long (the limit is ${MAX_SYSTEM_PROMPT_CHARS.toLocaleString("en-US")} characters).`,
      );
    }
    if (patch.systemPrompt.trim()) stored.systemPrompt = patch.systemPrompt.trim();
    else delete stored.systemPrompt;
  }

  if (patch.contextWindow !== undefined) {
    const { min, max } = CONTEXT_WINDOW_RANGE;
    const asked = patch.contextWindow === null ? 0 : Number(patch.contextWindow);
    if (!Number.isFinite(asked) || (asked !== 0 && (asked < min || asked > max))) {
      throw new SettingsValidationError(
        `Context window must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")} tokens.`,
      );
    }
    if (asked === 0 || Math.round(asked) === DEFAULT_CONTEXT_WINDOW) delete stored.contextWindow;
    else stored.contextWindow = Math.round(asked);
  }

  if (patch.provider !== undefined) {
    if (!isProvider(patch.provider)) {
      throw new SettingsValidationError(`Provider must be one of: ${PROVIDER_CHOICES.join(", ")}.`);
    }
    if (patch.provider === "compatible") delete stored.provider;
    else stored.provider = patch.provider;
  }
  applyMainAccount(stored, patch);
  applyAccounts(stored, patch);
  if (patch.claudeModel !== undefined) {
    const model = cleanModel(patch.claudeModel);
    if (model === DEFAULT_CLAUDE_MODEL) delete stored.claudeModel;
    else stored.claudeModel = model;
  }
  if (patch.githubToken !== undefined) {
    const token = cleanKey(patch.githubToken);
    if (token) stored.githubToken = token;
    else delete stored.githubToken;
  }
  if (patch.claudeCodePath !== undefined) {
    const value = cleanPath(patch.claudeCodePath);
    if (value) stored.claudeCodePath = value;
    else delete stored.claudeCodePath;
  }
  if (patch.claudeCodePermission !== undefined) {
    if (!isPermission(patch.claudeCodePermission)) {
      throw new SettingsValidationError(
        `What Claude Code may do must be one of: ${CODE_PERMISSIONS.join(", ")}.`,
      );
    }
    if (patch.claudeCodePermission === "edit") delete stored.claudeCodePermission;
    else stored.claudeCodePermission = patch.claudeCodePermission;
  }
  if (patch.claudeCodeModel !== undefined) {
    const model = cleanModel(patch.claudeCodeModel);
    if (model === "default") delete stored.claudeCodeModel;
    else stored.claudeCodeModel = model;
  }
  if (patch.runCode !== undefined) {
    if (typeof patch.runCode !== "boolean") {
      throw new SettingsValidationError("Running code is either on or off.");
    }
    if (patch.runCode) stored.runCode = true;
    else delete stored.runCode;
  }

  writeStored(stored);
  return publicSettings();
}
