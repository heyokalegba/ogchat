import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ClaudeTool } from "@/lib/provider/claude";
import { workBranch } from "./github";
import { dataDir, settingsFile } from "./paths";

/**
 * Running code, for Claude: one tool, run_command, which runs a shell
 * command on this machine and hands back what it printed.
 *
 * It is off until switched on in settings, because it is the one thing in
 * ogchat that lets a model act on your computer. What keeps it in bounds:
 *
 *  - Each chat has a folder of its own under data/workspaces. Commands start
 *    there and are told it is their home directory.
 *  - On a Mac the command runs inside the system sandbox (sandbox-exec). It
 *    may write only inside that folder and the temporary folders, and may
 *    not read your home folder at all, apart from the places programming
 *    tools are installed. Your documents, SSH keys, browser data and
 *    ogchat's own settings are out of its reach. If the sandbox cannot be
 *    started the command is not run.
 *  - On other systems there is no sandbox: the command runs as you. The
 *    settings panel says which of the two you have.
 *  - The command is given a bare environment: no API key, no GitHub token.
 *  - It is stopped after a time limit, and with the reply if you stop that.
 *
 * With a repository tied to the project, the folder holds a copy of it,
 * brought up to date before every command: the chat's own branch once it
 * has one, otherwise the default branch. The copy is for running things
 * (tests, a build, a script). What a command changes in it is not sent to
 * GitHub; Claude saves a change with write_file as before.
 */

const DEFAULT_SECONDS = 120;
const MAX_SECONDS = 600;
/** As much output as Claude is handed: the start and the end of it. */
const HEAD_CHARS = 8_000;
const TAIL_CHARS = 22_000;
const GIT_TIMEOUT_MS = 120_000;

export type Sandbox = "macos" | "none";

export function sandboxKind(platform: string = process.platform): Sandbox {
  return platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec") ? "macos" : "none";
}

export interface Workspace {
  root: string;
  /** Where commands run, and where the repository's files are. */
  work: string;
  home: string;
  tmp: string;
  /** The repository copy's git data, kept where commands cannot write. */
  git: string;
}

export function workspaceFor(sessionId: string): Workspace {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) throw new Error("Not a session id.");
  const root = path.join(dataDir(), "workspaces", sessionId);
  return {
    root,
    work: path.join(root, "work"),
    home: path.join(root, "home"),
    tmp: path.join(root, "tmp"),
    git: path.join(root, "git"),
  };
}

function prepare(ws: Workspace): void {
  for (const dir of [ws.work, ws.home, ws.tmp]) fs.mkdirSync(dir, { recursive: true });
}

/** Throws away a chat's workspace. Safe to call when there is none. */
export function removeWorkspace(sessionId: string): void {
  try {
    fs.rmSync(workspaceFor(sessionId).root, { recursive: true, force: true });
  } catch {
    // nothing to remove, or not ours to: either way the chat is gone
  }
}

/** A path as the system knows it (on a Mac /tmp is really /private/tmp). */
function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Places under the home folder where programming tools live, which commands may read. */
const TOOL_HOMES = [
  ".nvm",
  ".volta",
  ".fnm",
  ".asdf",
  ".mise",
  ".pyenv",
  ".rbenv",
  ".rustup",
  ".cargo/bin",
  ".bun",
  ".deno",
  ".local/bin",
  ".local/share/fnm",
  ".local/share/mise",
  "Library/pnpm",
  "go/bin",
];

/**
 * The rules a command runs under on a Mac, in the sandbox's own language.
 * Later rules win over earlier ones.
 */
export function sandboxProfile(options: {
  ws: Workspace;
  home: string;
  /** Files and folders never to be read, wherever they are. */
  secrets: string[];
  /** Further folders that may be read (where node itself lives, say). */
  readable: string[];
}): string {
  const q = (p: string) => {
    if (/["\\\n]/.test(p)) throw new Error("A path here cannot be written into the sandbox rules.");
    return `"${p}"`;
  };
  const { ws, home } = options;
  const mine = [ws.work, ws.home, ws.tmp].map(q);
  return [
    "(version 1)",
    "(allow default)",
    // Writing: nowhere, then the workspace and the usual temporary places.
    "(deny file-write*)",
    `(allow file-write* ${mine.map((p) => `(subpath ${p})`).join(" ")}`,
    '  (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/dev/fd")',
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/ttys[0-9]+$"))',
    // Reading: not the home folder, except where tools are installed.
    `(deny file-read* (subpath ${q(home)}))`,
    // Names and sizes only, so that a path through the home folder can be followed.
    `(allow file-read-metadata (subpath ${q(home)}))`,
    `(allow file-read* ${[...TOOL_HOMES.map((dir) => path.join(home, dir)), ...options.readable]
      .map((p) => `(subpath ${q(p)})`)
      .join(" ")})`,
    // ogchat's own keys and tokens, wherever its data folder is.
    ...options.secrets.flatMap((p) => [
      `(deny file-read* (subpath ${q(p)}))`,
      `(allow file-read-metadata (subpath ${q(p)}))`,
    ]),
    `(allow file-read* ${mine.map((p) => `(subpath ${p})`).join(" ")})`,
    // The repository copy's git data: readable, never writable.
    `(allow file-read* (subpath ${q(ws.git)}))`,
    "",
  ].join("\n");
}

function profileFor(ws: Workspace): string {
  const home = real(os.homedir());
  const node = real(path.dirname(path.dirname(process.execPath)));
  const data = real(dataDir());
  const realWs: Workspace = {
    root: real(ws.root),
    work: real(ws.work),
    home: real(ws.home),
    tmp: real(ws.tmp),
    git: path.join(real(ws.root), "git"),
  };
  return sandboxProfile({
    ws: realWs,
    home,
    // The whole data folder (settings, chats, other chats' workspaces) and the project's env files.
    secrets: [data, real(settingsFile()), path.join(real(process.cwd()), ".env.local")],
    // Where the node running ogchat lives, if that is under the home folder.
    readable: node.startsWith(`${home}/`) && node !== home ? [node] : [],
  });
}

/** The environment a command gets: enough to find tools, and nothing of yours. */
function commandEnv(ws: Workspace): Record<string, string> {
  const dirs = [
    path.dirname(process.execPath),
    ...(process.env.PATH ?? "").split(path.delimiter),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].filter(Boolean);
  return {
    PATH: [...new Set(dirs)].join(path.delimiter),
    HOME: ws.home,
    TMPDIR: ws.tmp,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "dumb",
    CI: "1",
    NO_COLOR: "1",
  };
}

export interface CommandResult {
  /** The exit code, or null if it was stopped. */
  code: number | null;
  output: string;
  /** Why it was stopped, if it was. */
  stopped: "timeout" | "cancelled" | null;
}

function clip(output: string): string {
  if (output.length <= HEAD_CHARS + TAIL_CHARS) return output;
  const cut = output.length - HEAD_CHARS - TAIL_CHARS;
  return `${output.slice(0, HEAD_CHARS)}\n\n[... ${cut} characters left out ...]\n\n${output.slice(-TAIL_CHARS)}`;
}

/** Runs one shell command in a chat's workspace, under the sandbox where there is one. */
export function runCommand(
  ws: Workspace,
  command: string,
  options: { seconds?: number; signal?: AbortSignal; sandbox?: Sandbox } = {},
): Promise<CommandResult> {
  prepare(ws);
  const sandbox = options.sandbox ?? sandboxKind();
  const seconds = Math.min(
    MAX_SECONDS,
    Math.max(1, Math.round(options.seconds ?? DEFAULT_SECONDS)),
  );
  const shell = ["/bin/bash", "-c", command];
  const [file, ...args] =
    sandbox === "macos" ? ["/usr/bin/sandbox-exec", "-p", profileFor(ws), ...shell] : shell;
  return new Promise((resolve) => {
    let output = "";
    let stopped: CommandResult["stopped"] = null;
    let done = false;
    const child = spawn(file!, args, {
      cwd: ws.work,
      env: commandEnv(ws) as unknown as NodeJS.ProcessEnv,
      detached: true, // a process group of its own, so that everything it started can be stopped
      stdio: ["ignore", "pipe", "pipe"],
    });
    const take = (chunk: Buffer) => {
      // Kept bounded while it runs: the start, and a rolling end.
      output += chunk.toString("utf8");
      if (output.length > (HEAD_CHARS + TAIL_CHARS) * 4) {
        output = `${output.slice(0, HEAD_CHARS)}\n[...]\n${output.slice(-TAIL_CHARS * 2)}`;
      }
    };
    const stop = (why: NonNullable<CommandResult["stopped"]>) => {
      if (done) return;
      stopped ??= why;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => stop("timeout"), seconds * 1000);
    const cancel = () => stop("cancelled");
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const finish = (code: number | null, extra = "") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      resolve({ code: stopped ? null : code, output: clip(output + extra), stopped });
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (error) =>
      finish(null, `\nThe command could not be started: ${error.message}`),
    );
    child.on("close", (code) => finish(code));
  });
}

// --------------------------------------------------------- the repository copy

function gitRemote(repo: string): string {
  const base = (process.env.OGCHAT_GITHUB_GIT_URL?.trim() || "https://github.com").replace(
    /\/+$/,
    "",
  );
  return `${base}/${repo}.git`;
}

/** Runs git for the copy. The token goes in by the environment, never on the command line or to disk. */
function git(ws: Workspace, token: string, args: string[], signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      [
        `--git-dir=${ws.git}`,
        `--work-tree=${ws.work}`,
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "credential.helper=",
        "-c",
        "advice.detachedHead=false",
        ...args,
      ],
      {
        cwd: ws.work,
        stdio: "ignore",
        signal,
        timeout: GIT_TIMEOUT_MS,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.extraheader",
          GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
        },
      },
    );
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Brings the workspace's copy of the repository up to date: the chat's own
 * branch if it exists, otherwise the default branch. Files the commands
 * made that are not part of the repository (installed packages, build
 * output) are left alone.
 */
export async function syncRepo(
  ws: Workspace,
  options: { token: string; repo: string; sessionId: string; signal?: AbortSignal },
): Promise<string> {
  prepare(ws);
  const { token, signal } = options;
  if (!fs.existsSync(path.join(ws.git, "HEAD"))) {
    fs.mkdirSync(ws.git, { recursive: true });
    if (!(await git(ws, token, ["init", "--quiet"], signal))) {
      throw new Error("git is needed to copy the repository, and it could not be run.");
    }
  }
  const remote = gitRemote(options.repo);
  const branch = workBranch(options.sessionId);
  let from = branch;
  if (
    !(await git(
      ws,
      token,
      ["fetch", "--quiet", "--depth", "1", remote, `refs/heads/${branch}`],
      signal,
    ))
  ) {
    from = "the default branch";
    if (!(await git(ws, token, ["fetch", "--quiet", "--depth", "1", remote, "HEAD"], signal))) {
      throw new Error(
        `The repository ${options.repo} could not be copied here. The GitHub token may not cover it.`,
      );
    }
  }
  if (
    !(await git(ws, token, ["checkout", "--quiet", "--force", "--detach", "FETCH_HEAD"], signal))
  ) {
    throw new Error("The copy of the repository could not be brought up to date.");
  }
  return from;
}

// -------------------------------------------------------------------- the tool

/** The run_command tool for one chat. With `repo`, the workspace holds a copy of that repository. */
export function commandTool(options: {
  sessionId: string;
  repo?: { name: string; token: string } | null;
}): ClaudeTool {
  const ws = workspaceFor(options.sessionId);
  const repo = options.repo ?? null;
  return {
    definition: {
      name: "run_command",
      description: repo
        ? `Run a shell command (bash) on the user's computer, in a copy of the repository ${repo.name}, and get back what it printed and its exit code. Use it to run tests, a build, a linter or a script. The copy is refreshed from GitHub before each command, so it has whatever write_file has saved. Changes a command makes to files are NOT saved to GitHub: use write_file for that. Installed packages and build output stay between commands.`
        : "Run a shell command (bash) on the user's computer, in a scratch folder kept for this chat, and get back what it printed and its exit code. Use it to run code, check a result or try something out. Files stay in the folder between commands.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command line, as typed into bash." },
          timeout_seconds: {
            type: "integer",
            description: `Stop it after this long. Default ${DEFAULT_SECONDS}, at most ${MAX_SECONDS}.`,
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
    check(input) {
      if (!input || typeof input !== "object") return "The input must be an object.";
      const given = input as Record<string, unknown>;
      if (typeof given.command !== "string" || !given.command.trim()) {
        return '"command" is missing or is not text.';
      }
      if (given.command.length > 20_000) return "That command is too long.";
      if (given.timeout_seconds !== undefined && typeof given.timeout_seconds !== "number") {
        return '"timeout_seconds" must be a number.';
      }
      return null;
    },
    describe: (input) => `running: ${String(input.command).replace(/\s+/g, " ").slice(0, 120)}`,
    async run(input, signal) {
      let note = "";
      if (repo) {
        const from = await syncRepo(ws, {
          token: repo.token,
          repo: repo.name,
          sessionId: options.sessionId,
          signal,
        });
        note = `[the copy is at ${from}]\n`;
      }
      const result = await runCommand(ws, String(input.command), {
        seconds: typeof input.timeout_seconds === "number" ? input.timeout_seconds : undefined,
        signal,
      });
      const how =
        result.stopped === "timeout"
          ? "stopped: it ran past its time limit"
          : result.stopped === "cancelled"
            ? "stopped"
            : `exit code ${result.code}`;
      return `${note}${how}\n${result.output.trim() || "(no output)"}`;
    },
  };
}

export function commandBriefing(repo: string | null): string {
  return [
    "You can run shell commands on the user's computer with run_command. They run in a folder kept for this chat, with no access to the user's own files.",
    repo
      ? `That folder holds a copy of ${repo}. Use it to check your work: after changing code with write_file, run the project's tests or build if it has them, and say what the result was. Editing files with a command does not save them; only write_file does.`
      : "Use it when running something settles a question better than reasoning about it.",
    "Report what a command actually printed. If it failed, say so and show the relevant part.",
  ].join("\n");
}

/**
 * Whether running code works here and is contained: for the settings test.
 * Runs three harmless commands and looks at what the sandbox let them do.
 */
export async function checkRunning(): Promise<{ ok: boolean | null; detail: string }> {
  const ws = workspaceFor("settings-check");
  const sandbox = sandboxKind();
  try {
    const hello = await runCommand(ws, "echo ok > here.txt && cat here.txt", { seconds: 20 });
    if (hello.code !== 0 || !hello.output.includes("ok")) {
      return {
        ok: false,
        detail: `A test command did not run${hello.output.trim() ? `: ${hello.output.trim().slice(0, 300)}` : "."}`,
      };
    }
    if (sandbox === "none") {
      return {
        ok: null,
        detail:
          "Commands run, but this system has no sandbox for them: they run as you, with your access.",
      };
    }
    const outside = path.join(real(dataDir()), `.sandbox-check-${process.pid}`);
    const wrote = await runCommand(ws, `echo no > '${outside}'`, { seconds: 20 });
    const leaked = fs.existsSync(outside);
    if (leaked) fs.rmSync(outside, { force: true });
    const read = await runCommand(ws, `cat '${real(settingsFile())}' > /dev/null`, { seconds: 20 });
    const readable = fs.existsSync(settingsFile()) && read.code === 0;
    if (leaked || wrote.code === 0 || readable) {
      return {
        ok: false,
        detail:
          "The sandbox is not holding: a test command reached outside its folder. Leave this switched off.",
      };
    }
    return {
      ok: true,
      detail:
        "Commands run inside the Mac sandbox: they can write only in the chat's own folder, and cannot read your files or ogchat's keys.",
    };
  } finally {
    removeWorkspace("settings-check");
  }
}
