import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { GET as getSignIn } from "@/app/api/settings/sign-in/route";
import { POST as testSettings } from "@/app/api/settings/test/route";
import {
  codeBriefing,
  codeEnv,
  codeFolder,
  codePrompt,
  codeSignIn,
  findClaudeCode,
  streamClaudeCode,
  type CodeSetup,
} from "@/lib/server/claudecode";
import { workBranch } from "@/lib/server/github";
import { getSession, truncateFrom } from "@/lib/server/store";
import type { PublicSettings, Session, SessionMeta, StreamEvent } from "@/lib/types";
import { useTempDataDir } from "./helpers";

useTempDataDir();

const FAKE = path.resolve(__dirname, "fixtures/fake-claude.mjs");
const SESSION = "0a1b2c3d-1111-4222-8333-444455556666";
const setup = (over: Partial<CodeSetup> = {}): CodeSetup => ({
  path: FAKE,
  configDir: null,
  permission: "edit",
  ...over,
});

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-cc-"));
  made.push(dir);
  return dir;
}
/** Where the stand-in writes down how it was started. */
function logged() {
  const file = path.join(temp(), "runs.json");
  vi.stubEnv("FAKE_CLAUDE_LOG", file);
  return () =>
    (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []) as {
      args: string[];
      cwd: string;
      typed: string;
      env: Record<string, string>;
    }[];
}
async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const piece of stream) text += piece;
  return text;
}
const user = (content: string) => ({ role: "user" as const, content });

describe("finding Claude Code", () => {
  it("takes the path it is given, or finds none there", () => {
    expect(findClaudeCode(FAKE)).toBe(FAKE);
    expect(findClaudeCode("/nowhere/claude")).toBeNull();
    expect(findClaudeCode(__dirname)).toBeNull(); // a folder is not a program
  });
});

describe("how Claude Code is signed in", () => {
  it("is to a plan, to the Console, or not at all, and unknown when the program is not there", () => {
    expect(codeSignIn(setup(), 0)).toEqual({ state: "plan", email: "someone@example.com" });
    expect(codeSignIn(setup({ configDir: "/tmp/ogchat-console" }), 0)).toMatchObject({
      state: "api",
    });
    expect(codeSignIn(setup({ configDir: "/tmp/ogchat-signed-out" }), 0)).toEqual({
      state: "out",
      email: null,
    });
    expect(codeSignIn(setup({ path: "/nowhere/claude" }), 0)).toEqual({
      state: "unknown",
      email: null,
    });
  });
});

describe("what Claude Code is started with", () => {
  it("is your environment, without an API key that would be billed instead of the account", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-SECRET");
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://elsewhere");
    vi.stubEnv("OGCHAT_GITHUB_TOKEN", "SECRET");
    vi.stubEnv("CLAUDE_CODE_SOMETHING", "1");
    vi.stubEnv("KEEP_ME", "yes");
    const env = codeEnv(setup({ configDir: "~/.claude-work" }), { EXTRA: "1" });
    expect(
      Object.keys(env).filter((name) => /^(ANTHROPIC_|OGCHAT_|CLAUDE_CODE_)/.test(name)),
    ).toEqual([]);
    expect(env).toMatchObject({ KEEP_ME: "yes", EXTRA: "1" });
    expect(env.CLAUDE_CONFIG_DIR).toBe(path.join(os.homedir(), ".claude-work"));
    expect(codeEnv(setup()).CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("is typed the new message alone when carrying on, and the whole conversation otherwise", () => {
    const messages = [
      { role: "system" as const, content: "Be brief." },
      user("first"),
      { role: "assistant" as const, content: "reply" },
      user("second"),
    ];
    expect(codePrompt(messages, true)).toBe("second");
    const whole = codePrompt(messages, false);
    expect(whole).toContain("<user>\nfirst\n</user>");
    expect(whole).toContain("<assistant>\nreply\n</assistant>");
    expect(whole.endsWith("second")).toBe(true);
    expect(whole).not.toContain("Be brief."); // the instructions go in by another door
    expect(codePrompt([user("only")], false)).toBe("only");
  });

  it("is told where it is and what it may do", () => {
    const told = codeBriefing({
      sessionId: SESSION,
      repo: "octo/widgets",
      baseBranch: "develop",
      permission: "edit",
      hasToken: true,
    });
    expect(told).toContain(`on the branch ${workBranch(SESSION)}, which was made from develop`);
    expect(told).toContain("shell commands are not permitted");
    expect(codeBriefing({ sessionId: SESSION, permission: "plan", hasToken: false })).toContain(
      "plan mode",
    );
    // In a folder of your own it is told the files are yours, and to leave git alone.
    const yours = codeBriefing({
      sessionId: SESSION,
      folder: "/Users/someone/site",
      repo: "octo/widgets",
      permission: "run",
      hasToken: true,
    });
    expect(yours).toContain("Your working directory is /Users/someone/site");
    expect(yours).toContain("in place");
    expect(yours).toContain("do not commit, push");
    expect(yours).not.toContain("octo/widgets");
  });
});

describe("a turn with Claude Code", () => {
  it("yields the reply, hands over its thinking and what it did, and leaves helpers' chatter out", async () => {
    const runs = logged();
    const thought: string[] = [];
    let session = "";
    const cwd = temp();
    const text = await collect(
      streamClaudeCode({
        setup: setup(),
        messages: [{ role: "system", content: "Be brief." }, user("hello")],
        model: "opus",
        effort: "high",
        cwd,
        onSession: (id) => (session = id),
        onThinking: (t) => thought.push(t),
      }),
    );
    expect(text).toBe("Looking at it.\n\nDone (new).");
    expect(thought.join("")).toBe("let me look\n[reading README.md]\n\n[running: npm test]\n");
    expect(session).toBe("sess-5");
    const [run] = runs();
    expect(run!.typed).toBe("hello");
    expect(fs.realpathSync(run!.cwd)).toBe(fs.realpathSync(cwd));
    const flag = (name: string) => run!.args[run!.args.indexOf(name) + 1];
    expect(run!.args).toEqual(
      expect.arrayContaining(["--print", "--verbose", "--include-partial-messages"]),
    );
    expect(flag("--output-format")).toBe("stream-json");
    expect(flag("--permission-mode")).toBe("acceptEdits");
    expect(flag("--model")).toBe("opus");
    expect(flag("--effort")).toBe("high");
    expect(flag("--append-system-prompt")).toBe("Be brief.");
    expect(run!.args).not.toContain("--resume");
    expect(run!.args).not.toContain("--allowedTools");
    expect(run!.args.join(" ")).not.toContain("skip-permissions");
  });

  it("is given Fable 5.2 by its full id, and says which model an alias came to", async () => {
    const runs = logged();
    const base = { setup: setup(), messages: [user("hi")], cwd: temp() };
    const pinned: string[] = [];
    await collect(
      streamClaudeCode({
        ...base,
        model: "claude-fable-5-2",
        effort: "xhigh",
        onModel: (id) => pinned.push(id),
      }),
    );
    const alias: string[] = [];
    await collect(streamClaudeCode({ ...base, model: "fable", onModel: (id) => alias.push(id) }));
    const [one] = runs();
    expect(one!.args.join(" ")).toContain("--model claude-fable-5-2");
    expect(one!.args.join(" ")).toContain("--effort xhigh");
    expect(pinned[0]).toBe("claude-fable-5-2");
    // The fake, like an older Claude Code, takes "fable" to be Fable 5.1.
    expect(alias[0]).toBe("claude-fable-5-1");
  });

  it("carries a session on, and is given no more than its permission allows", async () => {
    const runs = logged();
    const base = {
      messages: [user("a"), { role: "assistant" as const, content: "b" }, user("c")],
      cwd: temp(),
    };
    expect(
      await collect(
        streamClaudeCode({ ...base, setup: setup({ permission: "run" }), resume: "sess-1" }),
      ),
    ).toContain("Done (resumed).");
    await collect(
      streamClaudeCode({ ...base, setup: setup({ permission: "plan" }), model: "default" }),
    );
    await collect(streamClaudeCode({ ...base, setup: setup({ permission: "auto" }) }));
    await collect(streamClaudeCode({ ...base, setup: setup({ permission: "run" }), oneOff: true }));
    const [resumed, plan, auto, oneOff] = runs();
    expect(auto!.args.join(" ")).toContain("--permission-mode auto");
    expect(auto!.args.join(" ")).not.toContain("skip-permissions");
    expect(resumed!.typed).toBe("c");
    expect(resumed!.args.join(" ")).toContain("--resume sess-1");
    expect(resumed!.args.join(" ")).toContain("--permission-mode acceptEdits --allowedTools Bash");
    expect(plan!.args.join(" ")).toContain("--permission-mode plan");
    expect(plan!.args).not.toContain("--model");
    expect(plan!.typed).toContain("<user>\na\n</user>");
    // A summary changes nothing and leaves no session behind.
    expect(oneOff!.args.join(" ")).toContain("--permission-mode plan");
    expect(oneOff!.args).toContain("--no-session-persistence");
  });

  it("takes whole messages from a version that does not send them in pieces", async () => {
    vi.stubEnv("FAKE_CLAUDE_MODE", "whole");
    expect(
      await collect(streamClaudeCode({ setup: setup(), messages: [user("x")], cwd: temp() })),
    ).toBe("Whole answer.");
  });

  it("says what to do when it is not signed in, not installed, or falls over", async () => {
    const turn = (content: string, over: Partial<CodeSetup> = {}) =>
      collect(streamClaudeCode({ setup: setup(over), messages: [user(content)], cwd: temp() }));
    await expect(turn("/signedout")).rejects.toThrow(/not signed in.*claude auth login/);
    await expect(turn("/signedout", { configDir: "~/.claude-work" })).rejects.toThrow(
      /CLAUDE_CONFIG_DIR=~\/\.claude-work claude auth login/,
    );
    await expect(turn("/crash")).rejects.toThrow(/something broke badly/);
    await expect(turn("x", { path: "/nowhere/claude" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("stops when the reply is stopped", async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 300);
    const began = Date.now();
    await expect(
      collect(
        streamClaudeCode({
          setup: setup(),
          messages: [user("/hang")],
          cwd: temp(),
          signal: stop.signal,
        }),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(Date.now() - began).toBeLessThan(5000);
  });
});

describe("the folder a Claude Code chat works in", () => {
  function remote(): string {
    const base = temp();
    const bare = path.join(base, "octo", "widgets.git");
    const tree = path.join(base, "tree");
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
        cwd,
        stdio: "pipe",
      });
    fs.mkdirSync(bare, { recursive: true });
    git(bare, "init", "--quiet", "--bare", "--initial-branch=main");
    fs.mkdirSync(tree);
    git(tree, "init", "--quiet", "--initial-branch=main");
    fs.writeFileSync(path.join(tree, "README.md"), "main\n");
    git(tree, "add", "-A");
    git(tree, "commit", "--quiet", "-m", "one");
    git(tree, "push", "--quiet", bare, "main");
    git(tree, "checkout", "--quiet", "-b", "develop");
    fs.writeFileSync(path.join(tree, "README.md"), "develop\n");
    git(tree, "commit", "--quiet", "-am", "two");
    git(tree, "push", "--quiet", bare, "develop");
    vi.stubEnv("OGCHAT_GITHUB_GIT_URL", base);
    return base;
  }
  const branchOf = (dir: string) =>
    execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

  it("is a real clone on a branch of the chat's own, made once and then left alone", async () => {
    remote();
    const dir = await codeFolder({
      sessionId: SESSION,
      repo: "octo/widgets",
      baseBranch: "develop",
      token: "TOKEN-SECRET",
    });
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toBe("develop\n");
    expect(branchOf(dir)).toBe(workBranch(SESSION));
    // Its work is not thrown away by the next message.
    fs.writeFileSync(path.join(dir, "README.md"), "edited by claude code\n");
    expect(
      await codeFolder({
        sessionId: SESSION,
        repo: "octo/widgets",
        baseBranch: "develop",
        token: null,
      }),
    ).toBe(dir);
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toBe("edited by claude code\n");
    // The token went in by the environment, and is not written into the clone.
    expect(fs.readFileSync(path.join(dir, ".git/config"), "utf8")).not.toContain("SECRET");
  });

  it("is a scratch folder when the chat has no repository, and says so when a clone fails", async () => {
    remote();
    const scratch = await codeFolder({ sessionId: SESSION, token: null });
    expect(fs.statSync(scratch).isDirectory()).toBe(true);
    await expect(
      codeFolder({ sessionId: SESSION, repo: "octo/missing", token: null }),
    ).rejects.toThrow(/could not be cloned/);
  });

  it("is a folder of your own when the chat has one, as it stands, and says so when it has gone", async () => {
    const mine = temp();
    fs.writeFileSync(path.join(mine, "notes.txt"), "mine");
    // It comes before a repository, and nothing is cloned into it or made beside it.
    expect(
      await codeFolder({ sessionId: SESSION, folder: mine, repo: "octo/missing", token: null }),
    ).toBe(mine);
    expect(fs.readdirSync(mine)).toEqual(["notes.txt"]);
    fs.rmSync(mine, { recursive: true });
    await expect(codeFolder({ sessionId: SESSION, folder: mine, token: null })).rejects.toThrow(
      /is not there any more/,
    );
    expect(fs.existsSync(mine)).toBe(false);
  });
});

describe("Claude Code, through the app", () => {
  const req = (method: string, url: string, body?: unknown) =>
    new Request(`http://localhost:3000${url}`, {
      method,
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const send = async (id: string, content: string) =>
    (
      await (
        await sendMessage(req("POST", `/api/sessions/${id}/messages`, { content }), ctx(id))
      ).text()
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StreamEvent);

  it("is a provider of its own in settings, ready when the program is there, and tested without a model call", async () => {
    await putSettings(
      req("PUT", "/api/settings", {
        provider: "claudecode",
        claudeCodePath: FAKE,
        claudeCodePermission: "run",
      }),
    );
    const { settings } = (await (await getSettings(req("GET", "/api/settings"))).json()) as {
      settings: PublicSettings;
    };
    expect(settings).toMatchObject({
      provider: "claudecode",
      active: { ready: true, model: "default", provider: "claudecode" },
      claudeCode: { found: true, path: FAKE, configDir: "", permission: "run", model: "default" },
    });
    expect(settings.choices).toContainEqual({
      provider: "claudecode",
      model: "opus",
      label: "Claude Code · Opus (its newest)",
      ready: true,
    });
    const check = async (body: unknown) =>
      (
        (await (await testSettings(req("POST", "/api/settings/test", body))).json()) as {
          check: { ok: boolean; steps: { id: string; detail: string }[] };
        }
      ).check;
    const ok = await check({ provider: "claudecode" });
    expect(ok.ok).toBe(true);
    expect(ok.steps[0]!.detail).toBe(
      "9.9.9 (Claude Code), signed in as someone@example.com. Replies count against that plan's usage limits, not API tokens.",
    );
    const tokens = await check({ provider: "claudecode", claudeCodeConfigDir: "~/console" });
    expect(tokens.ok).toBe(true);
    expect(tokens.steps[0]!.detail).toContain("replies are paid for in API tokens");
    const out = await check({ provider: "claudecode", claudeCodeConfigDir: "~/signed-out" });
    expect(out.ok).toBe(false);
    expect(out.steps[0]!.detail).toContain("CLAUDE_CONFIG_DIR=~/signed-out claude auth login");
    expect((await check({ provider: "claudecode", claudeCodePath: "/nowhere/claude" })).ok).toBe(
      false,
    );
    for (const bad of [
      { claudeCodePermission: "anything" },
      { claudeCodePath: "relative/claude" },
    ]) {
      expect((await putSettings(req("PUT", "/api/settings", bad))).status).toBe(400);
    }
  });

  it("answers in a chat, carries its own session on, and starts afresh if the chat was changed", async () => {
    const runs = logged();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-SECRET");
    await putSettings(
      req("PUT", "/api/settings", { apiKey: "sk-other-000000", claudeCodePath: FAKE }),
    );
    // Settings stay on the other provider: this one chat is on Claude Code.
    const { session } = (await (
      await createSession(
        req("POST", "/api/sessions", {
          model: { provider: "claudecode", model: "sonnet" },
          reasoning: "max",
        }),
      )
    ).json()) as { session: Session };

    const first = await send(session.id, "hello");
    expect(first.at(-1)).toMatchObject({ type: "done", stopped: false });
    expect(
      (first.at(-1) as { message: { content: string; thinking: string } }).message,
    ).toMatchObject({
      content: "Looking at it.\n\nDone (new).",
      thinking: expect.stringContaining("[reading README.md]"),
      // The alias it was set to, and the model Claude Code said that meant.
      ranOn: {
        provider: "claudecode",
        requested: "sonnet",
        model: "claude-sonnet-5-5",
        effort: "max",
        // It is signed in to a plan, so the reply counted against that and not API tokens.
        paidBy: "plan",
      },
    });
    await send(session.id, "and again");
    const [one, two] = runs();
    expect(one!.args.join(" ")).toContain("--model sonnet");
    expect(one!.args.join(" ")).toContain("--effort max");
    expect(one!.args.join(" ")).toContain("You are running inside ogchat");
    expect(one!.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(two!.args.join(" ")).toContain("--resume sess-5");
    expect(two!.typed).toBe("and again");
    expect(two!.cwd).toBe(one!.cwd);
    expect(two!.cwd).toContain(session.id);

    // The last reply is taken back: Claude Code's memory no longer matches the chat.
    const last = getSession(session.id)!.messages.at(-1)!;
    expect(last.role).toBe("assistant");
    truncateFrom(session.id, last.id);
    await send(session.id, "third");
    const three = runs()[2]!;
    expect(three.args).not.toContain("--resume");
    expect(three.typed).toContain("<user>\nhello\n</user>");
    expect(three.typed.endsWith("third")).toBe(true);
  });

  it("tells the page how the account in use is signed in, and so what a chat on it is paid for with", async () => {
    const asked = async () =>
      ((await (await getSignIn(req("GET", "/api/settings/sign-in"))).json()) as { signIn: unknown })
        .signIn;
    await putSettings(
      req("PUT", "/api/settings", {
        provider: "claudecode",
        claudeCodePath: FAKE,
        claudeAccounts: [{ id: "a-console", name: "tokens", configDir: "/tmp/ogchat-console" }],
      }),
    );
    expect(await asked()).toEqual({ state: "plan", email: "someone@example.com" });
    await putSettings(req("PUT", "/api/settings", { claudeAccount: "a-console" }));
    expect(await asked()).toMatchObject({ state: "api" });
    // And a reply on that account is recorded as paid for in API tokens.
    const { session } = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    const done = (await send(session.id, "hello")).at(-1) as {
      message: { ranOn: { paidBy?: string } };
    };
    expect(done.message.ranOn.paidBy).toBe("api");
  });

  it("runs on the account that is switched to, and does not carry one account's session to another", async () => {
    const runs = logged();
    const home = path.join(temp(), "work-home");
    await putSettings(
      req("PUT", "/api/settings", {
        provider: "claudecode",
        claudeCodePath: FAKE,
        claudeAccounts: [{ id: "a-work", name: "work", configDir: home }],
      }),
    );
    const { session } = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    const said = async (content: string) =>
      (
        (await send(session.id, content)).at(-1) as {
          message: { ranOn: { account?: string } };
        }
      ).message.ranOn.account;
    /** The account the chat is marked with in the list: the one its last reply ran on. */
    const marked = async () =>
      (
        (await (await listSessions(req("GET", "/api/sessions"))).json()) as {
          sessions: SessionMeta[];
        }
      ).sessions.find((one) => one.id === session.id)!.account;

    expect(await marked()).toBeNull();
    expect(await said("hello")).toBe("main");
    expect(await said("again")).toBe("main");
    expect(await marked()).toEqual({ id: "main", name: "main" });
    await putSettings(req("PUT", "/api/settings", { claudeAccount: "a-work" }));
    expect(await said("now from work")).toBe("work");
    expect(await said("and once more")).toBe("work");
    // By id, which a new name for the account does not change.
    expect(await marked()).toEqual({ id: "a-work", name: "work" });
    expect(getSession(session.id)!.messages.at(-1)!.ranOn).toMatchObject({ accountId: "a-work" });

    const [one, two, three, four] = runs();
    expect(one!.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(two!.args.join(" ")).toContain("--resume sess-5");
    // Another account cannot resume the first one's session: the chat is retold to it.
    expect(three!.env.CLAUDE_CONFIG_DIR).toBe(home);
    expect(three!.args).not.toContain("--resume");
    expect(three!.typed).toContain("<user>\nhello\n</user>");
    expect(three!.typed.endsWith("now from work")).toBe(true);
    // From then on it carries on with its own.
    expect(four!.env.CLAUDE_CONFIG_DIR).toBe(home);
    expect(four!.args.join(" ")).toMatch(/--resume sess-\d+/);
  });

  it("works in a folder of your own when the chat is given one, and edits there in place", async () => {
    const runs = logged();
    const mine = temp();
    fs.writeFileSync(path.join(mine, "notes.txt"), "mine");
    await putSettings(
      req("PUT", "/api/settings", { provider: "claudecode", claudeCodePath: FAKE }),
    );
    const { session } = (await (
      await createSession(req("POST", "/api/sessions", { folder: mine, repo: "octo/widgets" }))
    ).json()) as { session: Session };
    // The folder, not the repository: a chat works in one or on the other.
    expect(session).toMatchObject({ folder: mine, repo: null, branch: null });

    await send(session.id, "what is in here?");
    await send(session.id, "and again");
    const [one, two] = runs();
    expect(fs.realpathSync(one!.cwd)).toBe(fs.realpathSync(mine));
    expect(one!.args.join(" ")).toContain(`Your working directory is ${mine}`);
    // The same folder: its session is carried on.
    expect(two!.args.join(" ")).toMatch(/--resume sess-\d+/);
    // Nothing of ogchat's is put in it, and nothing is kept for the chat in its place.
    expect(fs.readdirSync(mine)).toEqual(["notes.txt"]);

    // Cleared, it is back in a folder kept for the chat, and starts afresh there.
    await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { folder: null }),
      ctx(session.id),
    );
    await send(session.id, "third");
    const three = runs()[2]!;
    expect(three.cwd).toContain(session.id);
    expect(three.args).not.toContain("--resume");

    // A folder that has gone is said plainly, in the chat.
    const gone = temp();
    await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { folder: gone }),
      ctx(session.id),
    );
    fs.rmSync(gone, { recursive: true });
    const failed = (await send(session.id, "fourth")).find((e) => e.type === "error");
    expect(failed).toMatchObject({
      error: { message: expect.stringContaining("is not there any more") },
    });
  });

  it("shows a plain message in the chat when Claude Code is not signed in", async () => {
    await putSettings(
      req("PUT", "/api/settings", { provider: "claudecode", claudeCodePath: FAKE }),
    );
    const { session } = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    const events = await send(session.id, "/signedout");
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: { message: expect.stringContaining("claude auth login") },
    });
  });
});
