import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DELETE as deleteEnvironment,
  PATCH as patchEnvironment,
} from "@/app/api/environments/[id]/route";
import { GET as getEnvironments, POST as postEnvironment } from "@/app/api/environments/route";
import { GET as getBranches } from "@/app/api/github/branches/route";
import { GET as getRepos } from "@/app/api/github/repos/route";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { PUT as putSettings } from "@/app/api/settings/route";
import type { ClaudeTool } from "@/lib/provider/claude";
import { githubTools, parseBranch, workBranch } from "@/lib/server/github";
import {
  commandTool,
  runCommand,
  runSetup,
  sandboxProfile,
  workspaceFor,
} from "@/lib/server/workspace";
import type { Environment, Session } from "@/lib/types";
import { claudeStream, useTempDataDir } from "./helpers";

useTempDataDir();

const TOKEN = "github_pat_TEST0123456789SECRET";
const SESSION = "0a1b2c3d-1111-4222-8333-444455556666";
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
const env = (over: Partial<Environment> = {}): Environment => ({
  id: "11111111-2222-4333-8444-555555555555",
  name: "Tests",
  network: "full",
  setup: "",
  vars: {},
  ...over,
});

describe("environments", () => {
  const list = async () =>
    (
      (await (await getEnvironments(req("GET", "/api/environments"))).json()) as {
        environments: Environment[];
      }
    ).environments;

  it("start with the default alone, and are made, changed and deleted", async () => {
    expect(await list()).toEqual([
      { id: "default", name: "Default", network: "full", setup: "", vars: {} },
    ]);
    const made = (await (
      await postEnvironment(req("POST", "/api/environments", { name: "  Node  tests " }))
    ).json()) as { environment: Environment };
    expect(made.environment).toMatchObject({
      name: "Node tests",
      network: "full",
      setup: "",
      vars: {},
    });
    const id = made.environment.id;
    const changed = await patchEnvironment(
      req("PATCH", `/api/environments/${id}`, {
        network: "none",
        setup: "npm ci\r\nnpm run build\n",
        vars: { NODE_ENV: "test", API_URL: "http://localhost:4000" },
      }),
      ctx(id),
    );
    expect(((await changed.json()) as { environment: Environment }).environment).toEqual({
      id,
      name: "Node tests",
      network: "none",
      setup: "npm ci\nnpm run build",
      vars: { NODE_ENV: "test", API_URL: "http://localhost:4000" },
    });
    expect((await list()).map((e) => e.name)).toEqual(["Default", "Node tests"]);
    // Kept where only the owner can read it: a variable may be a key.
    const file = `${process.env.OGCHAT_DATA_DIR}/environments.json`;
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(
      (await deleteEnvironment(req("DELETE", `/api/environments/${id}`), ctx(id))).status,
    ).toBe(200);
    expect(
      (await deleteEnvironment(req("DELETE", `/api/environments/${id}`), ctx(id))).status,
    ).toBe(404);
    expect(await list()).toHaveLength(1);
  });

  it("refuse what is not an environment", async () => {
    const { environment } = (await (
      await postEnvironment(req("POST", "/api/environments", {}))
    ).json()) as {
      environment: Environment;
    };
    for (const bad of [
      { name: "" },
      { network: "some" },
      { vars: { "NOT A NAME": "x" } },
      { vars: { PATH: "/evil" } },
      { vars: { HOME: "/" } },
      { vars: { A: "two\nlines" } },
      { vars: ["A=1"] },
      { setup: 7 },
    ]) {
      const res = await patchEnvironment(
        req("PATCH", `/api/environments/${environment.id}`, bad),
        ctx(environment.id),
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(
      (
        await patchEnvironment(
          req("PATCH", "/api/environments/default", { name: "x" }),
          ctx("default"),
        )
      ).status,
    ).toBe(404);
  });
});

describe("an environment at work", () => {
  it("gives its variables to commands, without letting them take over the basics", async () => {
    const ws = workspaceFor(SESSION);
    const result = await runCommand(ws, 'echo "$GREETING from $HOME"', {
      vars: { GREETING: "hello", HOME: "/somewhere/else" },
    });
    expect(result.output.trim()).toBe(`hello from ${ws.home}`);
  });

  it("runs its setup script once, again if the script changes, and again if it failed", async () => {
    const ws = workspaceFor(SESSION);
    const first = env({ setup: 'echo "$WHO was here" >> setup.log', vars: { WHO: "setup" } });
    expect(await runSetup(ws, first)).toContain("was set up first");
    expect(await runSetup(ws, first)).toBe("");
    expect(
      await runSetup(ws, { ...first, setup: `${first.setup}\necho again >> setup.log` }),
    ).toContain("set up");
    expect((await runCommand(ws, "cat setup.log")).output).toBe(
      "setup was here\nsetup was here\nagain\n",
    );

    const broken = env({
      id: "22222222-2222-4333-8444-555555555555",
      setup: "echo no good; exit 4",
    });
    const failed = await runSetup(ws, broken);
    expect(failed).toContain("failed with exit code 4");
    expect(failed).toContain("no good");
    expect(await runSetup(ws, broken)).toContain("failed"); // not marked as done
  });

  it("is set up before the first command, and Claude is told", async () => {
    const tool = commandTool({
      sessionId: SESSION,
      environment: env({ setup: "echo ready > flag", vars: { MODE: "ci" } }),
    });
    expect(await tool.run({ command: 'cat flag; echo "$MODE"' })).toBe(
      '[the environment "Tests" was set up first: its setup script ran and finished]\nexit code 0\nready\nci',
    );
    expect(await tool.run({ command: "echo second" })).toBe("exit code 0\nsecond");
  });

  it("can be cut off from the network by the Mac sandbox", () => {
    const ws = {
      root: "/d/w/s",
      work: "/d/w/s/work",
      home: "/d/w/s/home",
      tmp: "/d/w/s/tmp",
      git: "/d/w/s/git",
    };
    const base = { ws, home: "/Users/me", secrets: [], readable: [] };
    expect(sandboxProfile({ ...base, network: false })).toContain("(deny network*)");
    expect(sandboxProfile({ ...base, network: true })).not.toContain("network");
    expect(sandboxProfile(base)).not.toContain("network");
  });
});

describe("where a chat works", () => {
  it("takes a branch name and nothing that could be anything else", () => {
    for (const good of ["main", "release/2.x", "feature/add-thing_1"])
      expect(parseBranch(good)).toBe(good);
    for (const bad of ["", "-rf", "a..b", "a b", "a/", "x.lock", "a//b", "~x", 5, null]) {
      expect(parseBranch(bad)).toBeNull();
    }
  });

  it("is kept with the chat: repository, branch and environment, each cleared with null", async () => {
    const { environment } = (await (
      await postEnvironment(req("POST", "/api/environments", { name: "E" }))
    ).json()) as { environment: Environment };
    const made = (await (
      await createSession(
        req("POST", "/api/sessions", {
          repo: "https://github.com/octo/widgets.git",
          branch: "develop",
          environmentId: environment.id,
        }),
      )
    ).json()) as { session: Session };
    expect(made.session).toMatchObject({
      repo: "octo/widgets",
      branch: "develop",
      environmentId: environment.id,
    });
    const id = made.session.id;
    const patch = async (body: unknown) => {
      const res = await patchSession(req("PATCH", `/api/sessions/${id}`, body), ctx(id));
      return { status: res.status, session: ((await res.json()) as { session: Session }).session };
    };
    // Another repository: the branch belonged to the old one, and goes.
    expect((await patch({ repo: "octo/gears" })).session).toMatchObject({
      repo: "octo/gears",
      branch: null,
    });
    expect((await patch({ branch: "next" })).session).toMatchObject({
      repo: "octo/gears",
      branch: "next",
    });
    expect((await patch({ environmentId: "default" })).session.environmentId).toBeNull();
    expect((await patch({ repo: null })).session).toMatchObject({ repo: null, branch: null });
    expect((await patch({ repo: "octo/gears" })).session.title).toBe(made.session.title);
    for (const bad of [{ repo: "not a repo" }, { branch: "a..b" }, { environmentId: "nope" }]) {
      expect((await patch(bad)).status).toBe(400);
    }
  });

  it("lists the repositories and branches the token reaches, and needs a token to", async () => {
    expect((await getRepos(req("GET", "/api/github/repos"))).status).toBe(400);
    await putSettings(req("PUT", "/api/settings", { githubToken: TOKEN }));
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        asked.push(url.pathname);
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
        if (url.pathname === "/user/repos") {
          return Response.json([
            { full_name: "octo/widgets", private: false, default_branch: "main" },
            { full_name: "octo/old", private: true, default_branch: "main", archived: true },
            { full_name: "octo/secret", private: true, default_branch: "trunk" },
          ]);
        }
        if (url.pathname.endsWith("/branches")) {
          return Response.json([{ name: "dev" }, { name: "trunk" }, { name: "ogchat/0a1b2c3d" }]);
        }
        return Response.json({ default_branch: "trunk" });
      }),
    );
    const repos = (await (await getRepos(req("GET", "/api/github/repos"))).json()) as {
      repos: unknown[];
    };
    expect(repos.repos).toEqual([
      { name: "octo/widgets", private: false, defaultBranch: "main" },
      { name: "octo/secret", private: true, defaultBranch: "trunk" },
    ]);
    const res = await getBranches(req("GET", "/api/github/branches?repo=octo/secret"));
    // The default first, and none of ogchat's own working branches.
    expect(await res.json()).toEqual({ branches: ["trunk", "dev"], defaultBranch: "trunk" });
    expect((await getBranches(req("GET", "/api/github/branches?repo=nope"))).status).toBe(400);
    expect(JSON.stringify(repos)).not.toContain("SECRET");
  });

  it("gives Claude the chat's own repository and branch, with no project needed", async () => {
    await putSettings(
      req("PUT", "/api/settings", {
        provider: "claude",
        claudeKey: "sk-ant-test-000000",
        githubToken: TOKEN,
      }),
    );
    const { session } = (await (
      await createSession(req("POST", "/api/sessions", { repo: "octo/widgets", branch: "develop" }))
    ).json()) as { session: Session };
    const github: URL[] = [];
    const claude: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.hostname === "api.anthropic.com") {
          claude.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return claude.length === 1
            ? claudeStream(
                [{ tool: "read_file", id: "t1", input: { path: "README.md" } }],
                "tool_use",
              )
            : claudeStream([{ text: "done" }]);
        }
        github.push(url);
        if (url.pathname.includes("/git/ref/"))
          return Response.json({ message: "Not Found" }, { status: 404 });
        return new Response("# Widgets");
      }),
    );
    await (
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "read it" }),
        ctx(session.id),
      )
    ).text();
    expect(String(claude[0]!.system)).toContain("octo/widgets");
    expect(String(claude[0]!.system)).toContain("works from the branch develop");
    expect((claude[0]!.tools as { name: string }[]).map((t) => t.name)).toContain("edit_file");
    // Read from the chosen branch, without asking what the default one is.
    const read = github.find((u) => u.pathname.endsWith("/contents/README.md"))!;
    expect(read.searchParams.get("ref")).toBe("develop");
    expect(github.some((u) => u.pathname === "/repos/octo/widgets")).toBe(false);
  });
});

describe("edit_file", () => {
  const BRANCH = workBranch(SESSION);
  function github(text: string) {
    const files: Record<string, string> = { "src/app.ts": text };
    const puts: Record<string, unknown>[] = [];
    let branched = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        const path = url.pathname;
        if (path.includes("/git/ref/heads/main")) return Response.json({ object: { sha: "m1" } });
        if (path.includes("/git/ref/")) {
          return branched
            ? Response.json({ object: { sha: "b" } })
            : Response.json({}, { status: 404 });
        }
        if (path.endsWith("/git/refs")) {
          branched = true;
          return Response.json({}, { status: 201 });
        }
        const file = decodeURIComponent(path.split("/contents/")[1] ?? "");
        if (method === "PUT") {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          puts.push(body);
          files[file] = Buffer.from(String(body.content), "base64").toString("utf8");
          return Response.json({}, { status: 201 });
        }
        if (!(file in files)) return Response.json({ message: "Not Found" }, { status: 404 });
        return new Headers(init?.headers).get("accept")?.includes("raw")
          ? new Response(files[file])
          : Response.json({ type: "file", sha: "s1" });
      }),
    );
    return { files, puts };
  }
  const edit = (input: Record<string, unknown>) =>
    (
      githubTools({
        token: TOKEN,
        repo: "octo/widgets",
        sessionId: SESSION,
        baseBranch: "main",
      }).find((t) => t.definition.name === "edit_file") as ClaudeTool
    ).run(input);

  it("replaces one piece of a file and commits the result to the chat's branch", async () => {
    const { files, puts } = github("const a = 1;\nconst b = 2;\nexport { a, b };\n");
    expect(
      await edit({
        path: "src/app.ts",
        old_text: "const b = 2;",
        new_text: "const b = $1 + 40;",
        message: "Change b",
      }),
    ).toBe(`Edited src/app.ts on branch ${BRANCH}.`);
    // The new text is put in as it is: a "$1" in it is not a pattern.
    expect(files["src/app.ts"]).toBe("const a = 1;\nconst b = $1 + 40;\nexport { a, b };\n");
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ branch: BRANCH, sha: "s1", message: "Change b" });
  });

  it("changes nothing when the text is missing or is there more than once, and says which", async () => {
    const { puts } = github("x = 1\nx = 1\n");
    expect(
      await edit({ path: "src/app.ts", old_text: "y = 2", new_text: "", message: "m" }),
    ).toMatch(/not in the file/);
    expect(
      await edit({ path: "src/app.ts", old_text: "x = 1", new_text: "x = 2", message: "m" }),
    ).toMatch(/appears 2 times/);
    expect(await edit({ path: "nope.ts", old_text: "x", new_text: "y", message: "m" })).toMatch(
      /no file/,
    );
    await expect(
      edit({ path: "../x", old_text: "x", new_text: "y", message: "m" }),
    ).rejects.toThrow(/not a path/);
    expect(puts).toHaveLength(0);
  });
});
