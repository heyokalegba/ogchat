import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { ProviderMessage } from "@/lib/provider/adapter";
import { ProviderAbortedError, ProviderError } from "@/lib/provider/errors";
import type { CodeSignIn, Environment } from "@/lib/types";
import { workBranch } from "./github";
import { workspaceFor } from "./workspace";

/**
 * Claude Code, as a provider.
 *
 * Instead of calling a model with a key, a chat set to Claude Code starts
 * the `claude` program that is installed on this computer, hands it the
 * message, and shows what it says and does. The program is the real Claude
 * Code: it reads and edits files in the chat's folder, runs commands if it
 * is allowed to, and uses whichever account it was signed in to in the
 * terminal (`claude auth login`). ogchat never sees that sign-in; it only
 * starts the program and reads its output.
 *
 * A chat keeps one Claude Code session and resumes it on each message, so
 * Claude Code has its own memory of the files it read. If the conversation
 * is changed behind its back (a message edited or deleted, the chat
 * compressed), a new session is started and told what was said so far.
 */

/**
 * What Claude Code may do in a chat: "plan" (look only), "edit" (change
 * files), "run" (change files and run shell commands), or "auto" (Claude
 * Code's own auto mode: it judges each action itself and goes ahead with
 * what it finds safe, across all of its tools). None of them ever stops to
 * ask; what a level does not cover is refused.
 */
export type CodePermission = "plan" | "edit" | "run" | "auto";
export const CODE_PERMISSIONS: readonly CodePermission[] = ["plan", "edit", "run", "auto"];

/** The models offered for a Claude Code chat: pinned ids, and its own aliases. */
export { CODE_MODELS } from "@/lib/models";

export interface CodeSetup {
  /** Where the program is, if it is not found by itself. */
  path: string | null;
  /** The folder its sign-in and sessions are kept in; null for its usual one (~/.claude). */
  configDir: string | null;
  permission: CodePermission;
}

function expand(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Where `claude` is: the path given, or the first of the usual places that has it. */
export function findClaudeCode(given?: string | null): string | null {
  const home = os.homedir();
  const candidates = given?.trim()
    ? [expand(given.trim())]
    : [
        ...(process.env.PATH ?? "").split(path.delimiter).map((dir) => path.join(dir, "claude")),
        path.join(home, ".local/bin/claude"),
        path.join(home, ".claude/local/claude"),
        // Installed with npm, beside the node that runs ogchat.
        path.join(path.dirname(process.execPath), "claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
      ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch {
      // not there, or not runnable: try the next
    }
  }
  return null;
}

/**
 * The environment the program runs in: yours, without anything that would
 * make it bill an API key instead of the account it is signed in to, and
 * without ogchat's own secrets.
 */
export function codeEnv(
  setup: CodeSetup,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(ANTHROPIC_|OGCHAT_|CLAUDE_CODE_|CLAUDECODE$)/.test(name)) continue;
    env[name] = value;
  }
  const home = os.homedir();
  const dirs = [
    ...(env.PATH ?? "").split(path.delimiter),
    path.dirname(process.execPath),
    path.join(home, ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(Boolean);
  Object.assign(env, extra);
  env.PATH = [...new Set(dirs)].join(path.delimiter);
  if (setup.configDir?.trim()) env.CLAUDE_CONFIG_DIR = expand(setup.configDir.trim());
  else delete env.CLAUDE_CONFIG_DIR;
  return env;
}

const SIGN_INS = new Map<string, { at: number; signIn: CodeSignIn }>();

/**
 * How Claude Code is signed in on an account: to a Claude plan, or to the
 * Anthropic Console (billed in API tokens). That is what decides what a
 * reply through it is paid for with. It is asked the program itself, and
 * the answer is kept for a minute, since it is asked on every reply.
 */
export function codeSignIn(setup: CodeSetup, maxAgeMs = 60_000): CodeSignIn {
  const unknown: CodeSignIn = { state: "unknown", email: null };
  const bin = findClaudeCode(setup.path);
  if (!bin) return unknown;
  const key = `${bin}\n${setup.configDir?.trim() ?? ""}`;
  const kept = SIGN_INS.get(key);
  if (kept && Date.now() - kept.at < maxAgeMs) return kept.signIn;
  let signIn = unknown;
  try {
    const run = spawnSync(/* turbopackIgnore: true */ bin, ["auth", "status", "--json"], {
      env: codeEnv(setup) as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 10_000,
    });
    const status = JSON.parse(run.stdout || "null") as Record<string, unknown> | null;
    // An older version without this command says nothing that can be read: leave it unknown.
    if (status && typeof status.loggedIn === "boolean") {
      signIn = {
        state: !status.loggedIn ? "out" : status.authMethod === "claude.ai" ? "plan" : "api",
        email:
          status.loggedIn && typeof status.email === "string" && status.email ? status.email : null,
      };
    }
  } catch {
    // it would not start, or said something else: unknown
  }
  SIGN_INS.set(key, { at: Date.now(), signIn });
  return signIn;
}

/** Whether Claude Code is installed and signed in: for the settings test. */
export function checkClaudeCode(setup: CodeSetup): { ok: boolean; detail: string } {
  const bin = findClaudeCode(setup.path);
  if (!bin) {
    return {
      ok: false,
      detail: setup.path
        ? `There is no program at ${setup.path}.`
        : "Claude Code was not found on this computer. Install it (see claude.com/claude-code), or give its path.",
    };
  }
  const run = (args: string[]) =>
    spawnSync(/* turbopackIgnore: true */ bin, args, {
      env: codeEnv(setup) as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 20_000,
    });
  const version = run(["--version"]).stdout?.trim().split("\n")[0] ?? "";
  const login = setup.configDir
    ? `CLAUDE_CONFIG_DIR=${setup.configDir} claude auth login`
    : "claude auth login";
  let status: Record<string, unknown> = {};
  try {
    status = JSON.parse(run(["auth", "status", "--json"]).stdout || "{}") as Record<
      string,
      unknown
    >;
  } catch {
    // an older version without this command: say what is known
    return { ok: true, detail: `Found ${version || bin}. Could not tell whether it is signed in.` };
  }
  if (status.loggedIn !== true) {
    return {
      ok: false,
      detail: `Found ${version}, but it is not signed in. In Terminal run: ${login}`,
    };
  }
  const who = [status.email, status.orgName]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");
  const paid =
    status.authMethod === "claude.ai"
      ? "Replies count against that plan's usage limits, not API tokens."
      : "It is signed in to the Anthropic Console, not a plan: replies are paid for in API tokens.";
  return { ok: true, detail: `${version}, signed in${who ? ` as ${who}` : ""}. ${paid}` };
}

// ------------------------------------------------------------- the chat's folder

function git(args: string[], cwd: string, env: Record<string, string>, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: env as unknown as NodeJS.ProcessEnv,
      stdio: "ignore",
      signal,
      timeout: 300_000,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** What lets git (and gh) act as the GitHub token for github.com, without writing it anywhere. */
export function githubEnv(token: string | null): Record<string, string> {
  if (!token) return {};
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    GH_TOKEN: token,
  };
}

/**
 * The folder a Claude Code chat works in. With a folder of your own it is
 * that folder, as it stands. With a repository it is a clone of it, on a
 * branch of the chat's own made from the branch it works from; it is cloned
 * once and then left alone, since from then on it is Claude Code's working
 * copy. With neither it is an empty folder kept for the chat.
 */
export async function codeFolder(options: {
  sessionId: string;
  /** A folder on this computer, chosen for the chat. It comes before a repository. */
  folder?: string | null;
  repo?: string | null;
  baseBranch?: string | null;
  token: string | null;
  signal?: AbortSignal;
}): Promise<string> {
  if (options.folder) {
    let there = false;
    try {
      there = fs.statSync(options.folder).isDirectory();
    } catch {
      // gone, or out of reach
    }
    if (!there) {
      throw new ProviderError(
        "provider_error",
        `The folder this chat works in, ${options.folder}, is not there any more. Pick another above the message box, or clear it.`,
      );
    }
    return options.folder;
  }
  const root = workspaceFor(options.sessionId).root;
  if (!options.repo) {
    const scratch = path.join(root, "code");
    fs.mkdirSync(scratch, { recursive: true });
    return scratch;
  }
  // One clone a repository, so that changing the chat's repository does not mix two.
  const dir = path.join(root, "repos", options.repo.replace("/", "__"));
  if (fs.existsSync(path.join(dir, ".git"))) return dir;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const base = (process.env.OGCHAT_GITHUB_GIT_URL?.trim() || "https://github.com").replace(
    /\/+$/,
    "",
  );
  const env = { ...(process.env as Record<string, string>), ...githubEnv(options.token) };
  const cloned = await git(
    [
      "clone",
      "--quiet",
      ...(options.baseBranch ? ["--branch", options.baseBranch] : []),
      `${base}/${options.repo}.git`,
      dir,
    ],
    path.dirname(dir),
    env,
    options.signal,
  );
  if (!cloned) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new ProviderError(
      "provider_error",
      `The repository ${options.repo}${options.baseBranch ? ` (branch ${options.baseBranch})` : ""} could not be cloned. Check the name, and that the GitHub token in settings, or git on this computer, can reach it.`,
    );
  }
  await git(["checkout", "--quiet", "-b", workBranch(options.sessionId)], dir, env, options.signal);
  return dir;
}

/** What Claude Code is told about where it is, on top of its own instructions. */
export function codeBriefing(options: {
  sessionId: string;
  folder?: string | null;
  repo?: string | null;
  baseBranch?: string | null;
  permission: CodePermission;
  environment?: Environment | null;
  hasToken: boolean;
}): string {
  const branch = workBranch(options.sessionId);
  const environment = options.environment;
  return [
    "You are running inside ogchat, a chat window on the user's own computer. What you write is shown to them as the reply.",
    options.folder
      ? `Your working directory is ${options.folder}, a folder of the user's own on this computer, which they chose for this chat. The files here are theirs and you are working on them in place: ogchat keeps no copy, and a change you make is made for good. Change only what the task calls for, and say which files you changed. If the folder is a git repository, leave its history alone: do not commit, push, or switch or make branches unless the user asks.`
      : options.repo
        ? `Your working directory is a clone of the GitHub repository ${options.repo}, on the branch ${branch}, which was made from ${options.baseBranch ?? "the default branch"} for this chat. Commit your work to ${branch} and nowhere else; do not push to or change any other branch. Push with "git push -u origin ${branch}" only when the user asks you to push or to open a pull request${options.hasToken ? ' (git is already signed in to GitHub; "gh pr create" works if gh is installed)' : ""}. Merging is theirs to do.`
        : "Your working directory is a scratch folder kept for this chat.",
    options.permission === "plan"
      ? "You are in plan mode here: you can read and search, but not change files or run commands. Say what you would do."
      : options.permission === "edit"
        ? "You can read and edit files here, but shell commands are not permitted in this chat. If something needs running (tests, an install, git), say which command and the user can switch that on in ogchat's settings."
        : "",
    environment?.setup && (options.permission === "run" || options.permission === "auto")
      ? `This chat's environment ("${environment.name}") has a setup script. If the project's dependencies are not installed yet, run it first:\n${environment.setup}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// --------------------------------------------------------------------- a turn

export interface CodeTurn {
  setup: CodeSetup;
  /** The conversation as the other providers take it: a system message first, if any. */
  messages: ProviderMessage[];
  /** An alias ("opus") or a full model id; "default" or nothing leaves it to Claude Code. */
  model?: string | null;
  effort?: string | null;
  cwd: string;
  /** The Claude Code session to carry on with; without one a new session is started. */
  resume?: string | null;
  /** Called with the session's id as soon as it is known. */
  onSession?: (id: string) => void;
  /** Called with the full id of the model it is using, once it says (an alias resolved). */
  onModel?: (id: string) => void;
  /** Variables for the program and what it runs: the GitHub sign-in, the environment's own. */
  vars?: Record<string, string>;
  /** One answer and no memory of it: for a summary. */
  oneOff?: boolean;
  signal?: AbortSignal;
  onThinking?: (text: string) => void;
}

const textOf = (content: ProviderMessage["content"]): string =>
  typeof content === "string"
    ? content
    : content
        .map((part) =>
          part.type === "text" ? part.text : "[an image was attached; it cannot be shown here]",
        )
        .join("\n");

/** What is typed to Claude Code: the new message alone when resuming, otherwise the whole conversation. */
export function codePrompt(messages: ProviderMessage[], resuming: boolean): string {
  const turns = messages.filter((m) => m.role !== "system");
  const last = turns.at(-1);
  if (!last) return "";
  const earlier = turns.slice(0, -1);
  if (resuming || earlier.length === 0) return textOf(last.content);
  return [
    "This conversation was already under way. What was said so far:",
    "",
    ...earlier.map((m) => `<${m.role}>\n${textOf(m.content)}\n</${m.role}>`),
    "",
    "The user's new message, which is the one to answer:",
    "",
    textOf(last.content),
  ].join("\n");
}

/** A few words on what a tool call is doing, for the thoughts under a reply. */
function describeTool(name: string, input: Record<string, unknown>): string {
  const short = (value: unknown) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 140);
  switch (name) {
    case "Bash":
      return `running: ${short(input.command)}`;
    case "Read":
      return `reading ${short(input.file_path)}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `editing ${short(input.file_path ?? input.notebook_path)}`;
    case "Write":
      return `writing ${short(input.file_path)}`;
    case "Grep":
      return `searching for ${short(input.pattern)}`;
    case "Glob":
      return `finding ${short(input.pattern)}`;
    case "WebFetch":
      return `fetching ${short(input.url)}`;
    case "WebSearch":
      return `searching the web for ${short(input.query)}`;
    case "Task":
    case "Agent":
      return `handing off: ${short(input.description)}`;
    default:
      return `using ${name}`;
  }
}

function explain(text: string, setup: CodeSetup): ProviderError {
  const login = setup.configDir
    ? `CLAUDE_CONFIG_DIR=${setup.configDir} claude auth login`
    : "claude auth login";
  if (/\/login|not logged in|invalid api key|authentication|oauth token/i.test(text)) {
    return new ProviderError(
      "invalid_key",
      `Claude Code is not signed in. In Terminal run: ${login}`,
    );
  }
  if (/usage limit|rate limit|limit reached|overloaded/i.test(text)) {
    return new ProviderError(
      "rate_limited",
      `Claude Code says the account's limit has been reached: ${text.slice(0, 300)}`,
    );
  }
  return new ProviderError("provider_error", `Claude Code stopped: ${text.slice(0, 400)}`);
}

/**
 * One turn with Claude Code. Yields the reply as text; what it thinks and
 * what it does go to `onThinking`.
 */
export async function* streamClaudeCode(turn: CodeTurn): AsyncGenerator<string, void, void> {
  const bin = findClaudeCode(turn.setup.path);
  if (!bin) {
    throw new ProviderError(
      "not_configured",
      "Claude Code is not installed on this computer, or is not where settings say. Install it, then sign in with: claude auth login",
    );
  }
  const system = turn.messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .join("\n\n")
    .trim();
  const permission = turn.oneOff ? "plan" : turn.setup.permission;
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode",
    permission === "plan" ? "plan" : permission === "auto" ? "auto" : "acceptEdits",
    ...(permission === "run" ? ["--allowedTools", "Bash"] : []),
    ...(turn.model && turn.model !== "default" ? ["--model", turn.model] : []),
    ...(turn.effort ? ["--effort", turn.effort] : []),
    ...(turn.resume ? ["--resume", turn.resume] : []),
    ...(turn.oneOff ? ["--no-session-persistence"] : []),
    ...(system ? ["--append-system-prompt", system] : []),
  ];
  fs.mkdirSync(turn.cwd, { recursive: true });
  const child = spawn(/* turbopackIgnore: true */ bin, args, {
    cwd: /* turbopackIgnore: true */ turn.cwd,
    env: codeEnv(turn.setup, turn.vars) as unknown as NodeJS.ProcessEnv,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const start: { error: Error | null } = { error: null };
  child.on("error", (error) => {
    start.error = error;
  });
  const stop = () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  };
  turn.signal?.addEventListener("abort", stop, { once: true });
  if (turn.signal?.aborted) stop();
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4000);
  });
  const closed = new Promise<number | null>((resolve) => child.on("close", resolve));
  child.stdin.on("error", () => {});
  child.stdin.end(codePrompt(turn.messages, Boolean(turn.resume)));

  let wrote = false; // any reply text so far
  let fresh = true; // the next text starts a new message
  let streamed = false; // this message's text came in pieces
  type Result = { is_error?: boolean; result?: unknown; subtype?: string };
  const outcome: { result: Result | null } = { result: null };
  const say = function* (text: string): Generator<string> {
    if (!text) return;
    if (fresh && wrote) yield "\n\n";
    fresh = false;
    wrote = true;
    yield text;
  };

  try {
    for await (const line of readline.createInterface({ input: child.stdout })) {
      if (!line.trim()) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // not an event: a stray line of output
      }
      if (typeof event.session_id === "string" && event.type === "system") {
        turn.onSession?.(event.session_id);
      }
      // What a helper it started says is its own business; only the main thread is the reply.
      if (event.parent_tool_use_id) continue;
      // The model it settled on: named when it starts, and on each message it writes.
      const named =
        event.type === "system"
          ? event.model
          : event.type === "assistant"
            ? (event.message as { model?: unknown } | undefined)?.model
            : undefined;
      if (typeof named === "string" && /^claude-/.test(named)) turn.onModel?.(named);
      if (event.type === "stream_event") {
        const inner = event.event as { type?: string; delta?: Record<string, unknown> } | undefined;
        if (inner?.type === "message_start") {
          fresh = true;
          streamed = false;
        } else if (inner?.type === "content_block_delta") {
          if (inner.delta?.type === "text_delta") {
            streamed = true;
            yield* say(String(inner.delta.text ?? ""));
          } else if (inner.delta?.type === "thinking_delta") {
            turn.onThinking?.(String(inner.delta.thinking ?? ""));
          }
        }
      } else if (event.type === "assistant") {
        const content = (event.message as { content?: unknown } | undefined)?.content;
        for (const block of Array.isArray(content) ? (content as Record<string, unknown>[]) : []) {
          if (block.type === "tool_use") {
            turn.onThinking?.(
              `\n[${describeTool(String(block.name), (block.input ?? {}) as Record<string, unknown>)}]\n`,
            );
          } else if (block.type === "text" && !streamed) {
            // A version that does not send the text in pieces: take it whole.
            yield* say(String(block.text ?? ""));
          }
        }
        fresh = true;
        streamed = false;
      } else if (event.type === "result") {
        outcome.result = event as Result;
      }
    }
    const code = await closed;
    if (turn.signal?.aborted) throw new ProviderAbortedError();
    if (start.error) {
      throw new ProviderError(
        "provider_error",
        `Claude Code could not be started: ${start.error.message}`,
      );
    }
    const result = outcome.result;
    if (result?.is_error) {
      throw explain(String(result.result ?? result.subtype ?? "it reported an error"), turn.setup);
    }
    if (!result && code !== 0) {
      throw explain(stderr.trim() || `it exited with code ${code}`, turn.setup);
    }
    // Nothing came in pieces or whole, but there is a final answer: use that.
    if (!wrote && typeof result?.result === "string") yield* say(result.result);
  } finally {
    turn.signal?.removeEventListener("abort", stop);
    if (child.exitCode === null) stop();
  }
}
