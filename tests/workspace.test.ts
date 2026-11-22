import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { DELETE as deleteSession } from "@/app/api/sessions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { workBranch } from "@/lib/server/github";
import {
  commandTool,
  runCommand,
  sandboxProfile,
  syncRepo,
  workspaceFor,
} from "@/lib/server/workspace";
import type { PublicSettings, Session } from "@/lib/types";
import { claudeStream, useTempDataDir } from "./helpers";

useTempDataDir();

const SESSION = "0a1b2c3d-1111-4222-8333-444455556666";
const TOKEN = "github_pat_TEST0123456789SECRET";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A real repository on disk, standing in for GitHub: <base>/octo/widgets.git. */
function remote(): { base: string; commit: (branch: string, file: string, text: string) => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-remote-"));
  made.push(base);
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
  git(tree, "remote", "add", "origin", bare);
  const commit = (branch: string, file: string, text: string) => {
    git(tree, "checkout", "--quiet", "-B", branch);
    fs.writeFileSync(path.join(tree, file), text);
    git(tree, "add", "-A");
    git(tree, "commit", "--quiet", "-m", `write ${file}`);
    git(tree, "push", "--quiet", "--force", "origin", branch);
  };
  commit("main", "hello.sh", "echo hello from main\n");
  vi.stubEnv("OGCHAT_GITHUB_GIT_URL", base);
  return { base, commit };
}

describe("running a command", () => {
  it("runs in the chat's own folder, with a bare environment and that folder as home", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-SECRET");
    vi.stubEnv("OGCHAT_GITHUB_TOKEN", TOKEN);
    const ws = workspaceFor(SESSION);
    const result = await runCommand(
      ws,
      'pwd; echo "home=$HOME"; env | sort; echo oops >&2; exit 3',
    );
    expect(result.code).toBe(3);
    expect(result.stopped).toBeNull();
    expect(result.output).toContain(fs.realpathSync(ws.work));
    expect(result.output).toContain(`home=${ws.home}`);
    expect(result.output).toContain("oops");
    expect(result.output).not.toContain("SECRET");
    expect(result.output).not.toMatch(/ANTHROPIC|OGCHAT_|GITHUB/);
  });

  it("keeps files between commands", async () => {
    const ws = workspaceFor(SESSION);
    await runCommand(ws, "echo kept > note.txt");
    expect((await runCommand(ws, "cat note.txt")).output.trim()).toBe("kept");
  });

  it("stops a command that runs too long, and everything it started", async () => {
    const ws = workspaceFor(SESSION);
    const began = Date.now();
    const result = await runCommand(ws, "(sleep 30; echo late > late.txt) & sleep 30", {
      seconds: 1,
    });
    expect(result.stopped).toBe("timeout");
    expect(result.code).toBeNull();
    expect(Date.now() - began).toBeLessThan(5000);
  });

  it("stops when the reply is stopped", async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 200);
    const result = await runCommand(workspaceFor(SESSION), "sleep 30", { signal: stop.signal });
    expect(result.stopped).toBe("cancelled");
  });

  it("hands back the start and the end of very long output, not all of it", async () => {
    const result = await runCommand(workspaceFor(SESSION), "seq 1 200000");
    expect(result.output.length).toBeLessThan(40_000);
    expect(result.output.startsWith("1\n2\n")).toBe(true);
    expect(result.output.trimEnd().endsWith("200000")).toBe(true);
    expect(result.output).toContain("left out");
  });

  it("will not make a workspace out of something that is not a session id", () => {
    expect(() => workspaceFor("../../etc")).toThrow();
    expect(() => workspaceFor("")).toThrow();
  });
});

describe("the Mac sandbox's rules", () => {
  const ws = {
    root: "/d/w/s",
    work: "/d/w/s/work",
    home: "/d/w/s/home",
    tmp: "/d/w/s/tmp",
    git: "/d/w/s/git",
  };
  const rules = sandboxProfile({
    ws,
    home: "/Users/me",
    secrets: ["/d"],
    readable: ["/Users/me/tools/node"],
  });

  it("allow writing in the workspace only, and not to its git data", () => {
    expect(rules).toContain("(deny file-write*)");
    const writes = rules.slice(
      rules.indexOf("(allow file-write*"),
      rules.indexOf("(deny file-read*"),
    );
    expect(writes).toContain('(subpath "/d/w/s/work")');
    expect(writes).not.toContain("/d/w/s/git");
    expect(writes).not.toContain("/Users");
  });

  it("shut the home folder and ogchat's data, then open the workspace again after", () => {
    const order = (text: string) => rules.indexOf(text);
    expect(order('(deny file-read* (subpath "/Users/me"))')).toBeGreaterThan(0);
    expect(order('(deny file-read* (subpath "/d"))')).toBeGreaterThan(order('"/Users/me/.nvm"'));
    // Later rules win: the workspace is let back in after its parent is shut.
    expect(rules.lastIndexOf('(subpath "/d/w/s/work")')).toBeGreaterThan(
      order('(deny file-read* (subpath "/d"))'),
    );
    expect(rules).toContain('(subpath "/Users/me/tools/node")');
    expect(rules).not.toContain('"/Users/me/.ssh"');
  });

  it("refuse a path that could break out of the rules", () => {
    expect(() => sandboxProfile({ ws, home: '/Users/"x', secrets: [], readable: [] })).toThrow();
  });
});

describe("the copy of the repository", () => {
  it("is the default branch until the chat has a branch, then that branch", async () => {
    const { commit } = remote();
    const ws = workspaceFor(SESSION);
    const options = { token: TOKEN, repo: "octo/widgets", sessionId: SESSION };
    expect(await syncRepo(ws, options)).toBe("the default branch");
    expect((await runCommand(ws, "bash hello.sh")).output.trim()).toBe("hello from main");
    // Something a command made, which is not part of the repository, survives a refresh.
    await runCommand(ws, "mkdir -p node_modules && echo x > node_modules/kept");
    commit(workBranch(SESSION), "hello.sh", "echo hello from the branch\n");
    expect(await syncRepo(ws, options)).toBe(workBranch(SESSION));
    expect((await runCommand(ws, "bash hello.sh; cat node_modules/kept")).output).toBe(
      "hello from the branch\nx\n",
    );
  });

  it("keeps the token off disk and out of reach of commands", async () => {
    remote();
    const ws = workspaceFor(SESSION);
    await syncRepo(ws, { token: TOKEN, repo: "octo/widgets", sessionId: SESSION });
    const found = spawnSync("grep", ["-rl", "--binary-files=text", "SECRET", ws.root], {
      encoding: "utf8",
    });
    expect(found.status).toBe(1); // grep's way of saying: nowhere
    expect(found.stdout).toBe("");
  });

  it("says so plainly when the repository cannot be had", async () => {
    remote();
    await expect(
      syncRepo(workspaceFor(SESSION), { token: TOKEN, repo: "octo/missing", sessionId: SESSION }),
    ).rejects.toThrow(/could not be copied/);
  });
});

describe("run_command, as Claude is given it", () => {
  it("checks its input, says what it is doing, and reports how the command ended", async () => {
    const tool = commandTool({ sessionId: SESSION });
    expect(tool.check({ command: "ls" })).toBeNull();
    expect(tool.check({ command: "" })).toMatch(/command/);
    expect(tool.check({ command: "ls", timeout_seconds: "soon" })).toMatch(/timeout/);
    expect(tool.check(null)).not.toBeNull();
    expect(tool.describe({ command: "npm   test" })).toBe("running: npm test");
    expect(await tool.run({ command: "echo hi; exit 2" })).toBe("exit code 2\nhi");
    expect(await tool.run({ command: "true" })).toBe("exit code 0\n(no output)");
    expect(await tool.run({ command: "sleep 9", timeout_seconds: 1 })).toMatch(
      /past its time limit/,
    );
  });

  it("refreshes the copy first when the chat has a repository", async () => {
    remote();
    const tool = commandTool({ sessionId: SESSION, repo: { name: "octo/widgets", token: TOKEN } });
    expect(tool.definition.description).toContain("octo/widgets");
    expect(await tool.run({ command: "bash hello.sh" })).toBe(
      "[the copy is at the default branch]\nexit code 0\nhello from main",
    );
  });
});

describe("running code, through the app", () => {
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

  it("is off until switched on, and is then one more tool Claude has", async () => {
    await putSettings(
      req("PUT", "/api/settings", { provider: "claude", claudeKey: "sk-ant-test-000000" }),
    );
    const before = (await (await getSettings(req("GET", "/api/settings"))).json()) as {
      settings: PublicSettings;
    };
    expect(before.settings.runCode.enabled).toBe(false);
    expect((await putSettings(req("PUT", "/api/settings", { runCode: "yes" }))).status).toBe(400);
    await putSettings(req("PUT", "/api/settings", { runCode: true }));

    const { session } = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return bodies.length === 1
          ? claudeStream(
              [{ tool: "run_command", id: "t1", input: { command: "echo $((6*7))" } }],
              "tool_use",
            )
          : claudeStream([{ text: "It is 42." }]);
      }),
    );
    const res = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "what is 6 times 7?" }),
      ctx(session.id),
    );
    expect(await res.text()).toContain("[running: echo $((6*7))]");
    expect((bodies[0]!.tools as { name: string }[]).map((t) => t.name)).toEqual(["run_command"]);
    expect(String(bodies[0]!.system)).toContain("run_command");
    const back = (bodies[1]!.messages as { content: { content?: string }[] }[]).at(-1)!.content[0]!;
    expect(back.content).toBe("exit code 0\n42");

    // The chat's folder goes when the chat does.
    const root = workspaceFor(session.id).root;
    expect(fs.existsSync(root)).toBe(true);
    await deleteSession(req("DELETE", `/api/sessions/${session.id}`), ctx(session.id));
    expect(fs.existsSync(root)).toBe(false);
  });
});
