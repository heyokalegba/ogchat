import { describe, expect, it, vi } from "vitest";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { GET as getSession, PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { POST as testSettings } from "@/app/api/settings/test/route";
import { ProviderError } from "@/lib/provider/errors";
import { streamClaude, toClaudeMessages, type ClaudeTool } from "@/lib/provider/claude";
import { githubTools, parseRepo, repoPath, workBranch } from "@/lib/server/github";
import type { Project, PublicSettings, Session, SessionDetail, StreamEvent } from "@/lib/types";
import { claudeStream, useTempDataDir, type ClaudeBlock } from "./helpers";

useTempDataDir();

const KEY = "sk-ant-test-0123456789abcdef-SECRET";
const TOKEN = "github_pat_TEST0123456789SECRET";
const SESSION = "0a1b2c3d-1111-4222-8333-444455556666";

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

/** Stands in for the network: every request goes to `respond`, and is kept. */
function stubNet(respond: (call: Call, n: number) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const text = request ? await request.clone().text() : String(init?.body ?? "");
      const call: Call = {
        url: new URL(request ? request.url : String(input)),
        method: request?.method ?? init?.method ?? "GET",
        headers: new Headers(request?.headers ?? (init?.headers as HeadersInit | undefined)),
        body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
      };
      calls.push(call);
      return respond(call, calls.length);
    }),
  );
  return calls;
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const piece of stream) text += piece;
  return text;
}

const fake = (name: string, run = vi.fn(async () => "done")): ClaudeTool & { run: typeof run } => ({
  definition: {
    name,
    description: "a tool",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  check: (input) =>
    input && typeof (input as { path?: unknown }).path === "string" ? null : '"path" is missing.',
  describe: (input) => `using ${String(input.path)}`,
  run,
});

describe("the conversation, in Claude's shape", () => {
  it("takes the system text out, turns images into image blocks, and joins turns by the same speaker", () => {
    const { system, turns } = toClaudeMessages([
      { role: "system", content: "Be brief." },
      { role: "user", content: "one" },
      { role: "user", content: "two" },
      { role: "assistant", content: "reply" },
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
    ]);
    expect(system).toBe("Be brief.");
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[0]!.content).toEqual([
      { type: "text", text: "one" },
      { type: "text", text: "two" },
    ]);
    expect(turns[2]!.content).toEqual([
      { type: "text", text: "look" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
  });
});

describe("a reply from Claude", () => {
  const messages = [
    { role: "system" as const, content: "Be brief." },
    { role: "user" as const, content: "hello" },
  ];

  it("streams the text, hands the thinking over, and asks the API the right way", async () => {
    const calls = stubNet(() =>
      claudeStream([{ thinking: "hmm" }, { text: "Hel" }, { text: "lo" }]),
    );
    const thought: string[] = [];
    const text = await collect(
      streamClaude({
        apiKey: KEY,
        model: "claude-opus-5-5",
        messages,
        onThinking: (t) => thought.push(t),
      }),
    );
    expect(text).toBe("Hello");
    expect(thought.join("")).toBe("hmm");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url.origin + call.url.pathname).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(call.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(call.body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      system: "Be brief.",
      thinking: { type: "adaptive", display: "summarized" },
      cache_control: { type: "ephemeral" },
      fallbacks: "default",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(call.body).not.toHaveProperty("tools");
    expect(call.body).not.toHaveProperty("output_config");
    expect(call.body).not.toHaveProperty("temperature");
  });

  it("passes on how hard to think, and the web search when it is wanted", async () => {
    const calls = stubNet(() => claudeStream([{ text: "ok" }]));
    await collect(
      streamClaude({
        apiKey: KEY,
        model: "claude-sonnet-5-5",
        messages,
        effort: "max",
        webSearch: true,
      }),
    );
    expect(calls[0]!.body).toMatchObject({
      output_config: { effort: "max" },
      tools: [{ type: "web_search_20260209", name: "web_search" }],
    });
  });

  it("sends Fable 5.2 with xhigh as it is, and says which model answered", async () => {
    const calls = stubNet(() => claudeStream([{ text: "ok" }], "end_turn", "claude-fable-5-2"));
    const seen: string[] = [];
    await collect(
      streamClaude({
        apiKey: KEY,
        model: "claude-fable-5-2",
        messages,
        effort: "xhigh",
        onModel: (id) => seen.push(id),
      }),
    );
    expect(calls[0]!.body).toMatchObject({
      model: "claude-fable-5-2",
      output_config: { effort: "xhigh" },
      // Fable 5.2 may decline on policy grounds; the API may hand it on.
      fallbacks: "default",
    });
    expect(seen).toEqual(["claude-fable-5-2"]);
  });

  it("leaves thinking, effort and the fallback off for a model that takes none of them", async () => {
    const calls = stubNet(() => claudeStream([{ text: "ok" }]));
    await collect(
      streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages, effort: "high" }),
    );
    expect(calls[0]!.body).not.toHaveProperty("thinking");
    expect(calls[0]!.body).not.toHaveProperty("output_config");
    expect(calls[0]!.body).not.toHaveProperty("fallbacks");
  });

  it("goes without the fallback if the API will not take it, rather than failing", async () => {
    const calls = stubNet((_, n) =>
      n === 1
        ? Response.json(
            { type: "error", error: { type: "invalid_request_error", message: "fallbacks: nope" } },
            { status: 400 },
          )
        : claudeStream([{ text: "fine" }]),
    );
    expect(await collect(streamClaude({ apiKey: KEY, model: "claude-opus-5-5", messages }))).toBe(
      "fine",
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).not.toHaveProperty("fallbacks");
  });

  it("says what is wrong in plain words, and never repeats the key", async () => {
    const failing = async (status: number, message: string) => {
      stubNet(() =>
        Response.json(
          { type: "error", error: { type: "x", message: `${message} ${KEY}` } },
          { status },
        ),
      );
      try {
        await collect(streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages }));
      } catch (error) {
        return error as ProviderError;
      }
      throw new Error("did not fail");
    };
    const auth = await failing(401, "invalid x-api-key");
    expect(auth).toBeInstanceOf(ProviderError);
    expect(auth.code).toBe("invalid_key");
    const credit = await failing(
      400,
      "Your credit balance is too low to access the Anthropic API.",
    );
    expect(credit.code).toBe("no_credits");
    const gone = await failing(404, "model: nope");
    expect(gone.message).toMatch(/does not know that model/);
    const bad = await failing(400, "messages: something else");
    for (const error of [auth, credit, gone, bad]) expect(error.message).not.toContain("SECRET");
  });

  it("names the workspace when given one, and explains when Anthropic asks for one", async () => {
    const calls = stubNet(() => claudeStream([{ text: "ok" }]));
    await collect(
      streamClaude({
        apiKey: KEY,
        model: "claude-haiku-4-5",
        messages,
        workspace: " wrkspc_01abc ",
      }),
    );
    expect(calls[0]!.headers.get("anthropic-workspace-id")).toBe("wrkspc_01abc");
    await collect(streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages }));
    expect(calls[1]!.headers.has("anthropic-workspace-id")).toBe(false);
    stubNet(() =>
      Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.",
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      collect(streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages })),
    ).rejects.toThrow(/fill in Workspace id/);
  });

  it("will not start without a key", async () => {
    const calls = stubNet(() => claudeStream([{ text: "x" }]));
    await expect(
      collect(streamClaude({ apiKey: null, model: "claude-opus-5-5", messages })),
    ).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(calls).toHaveLength(0);
  });

  it("reports a refusal instead of an empty reply", async () => {
    stubNet(() => claudeStream([], "refusal"));
    await expect(
      collect(streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages })),
    ).rejects.toThrow(/declined/);
  });
});

describe("Claude using a tool", () => {
  const messages = [{ role: "user" as const, content: "what is in the readme?" }];

  it("runs what is asked for, sends back what it returned, and carries on to the answer", async () => {
    const tool = fake(
      "read_file",
      vi.fn(async () => "# Title"),
    );
    const steps: ClaudeBlock[][] = [
      [{ text: "Looking." }, { tool: "read_file", id: "toolu_1", input: { path: "README.md" } }],
      [{ text: "It has a title." }],
    ];
    const calls = stubNet((_, n) => claudeStream(steps[n - 1]!, n === 1 ? "tool_use" : "end_turn"));
    const seen: string[] = [];
    const text = await collect(
      streamClaude({
        apiKey: KEY,
        model: "claude-haiku-4-5",
        messages,
        tools: [tool],
        onThinking: (t) => seen.push(t),
      }),
    );
    expect(text).toBe("Looking.\n\nIt has a title.");
    expect(tool.run).toHaveBeenCalledTimes(1);
    expect((tool.run.mock.calls[0] as unknown[])[0]).toEqual({ path: "README.md" });
    expect(seen.join("")).toContain("[using README.md]");
    // The tool is described to Claude, with its input streamed as it is written.
    expect(calls[0]!.body!.tools).toEqual([
      expect.objectContaining({ name: "read_file", eager_input_streaming: true }),
    ]);
    // The second request carries Claude's own turn back unchanged, then the result.
    const sent = calls[1]!.body!.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent[1]!.content).toEqual([
      expect.objectContaining({ type: "text", text: "Looking." }),
      expect.objectContaining({
        type: "tool_use",
        id: "toolu_1",
        name: "read_file",
        input: { path: "README.md" },
      }),
    ]);
    expect(sent[2]!.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "# Title" },
    ]);
  });

  it("does not run a tool on input that is not what the tool takes, and says so to Claude", async () => {
    const tool = fake("read_file");
    const calls = stubNet((_, n) =>
      n === 1
        ? claudeStream([{ tool: "read_file", id: "toolu_1", input: { file: 3 } }], "tool_use")
        : claudeStream([{ text: "sorry" }]),
    );
    await collect(
      streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages, tools: [tool] }),
    );
    expect(tool.run).not.toHaveBeenCalled();
    const sent = calls[1]!.body!.messages as { content: Record<string, unknown>[] }[];
    expect(sent[2]!.content[0]).toMatchObject({ type: "tool_result", is_error: true });
  });

  it("tells Claude when a tool fails, and when it asks for one that does not exist", async () => {
    const tool = fake(
      "read_file",
      vi.fn(async () => Promise.reject(new Error("GitHub said no"))),
    );
    const calls = stubNet((_, n) =>
      n === 1
        ? claudeStream(
            [
              { tool: "read_file", id: "a", input: { path: "x" } },
              { tool: "launch_rocket", id: "b", input: { path: "x" } },
            ],
            "tool_use",
          )
        : claudeStream([{ text: "ok" }]),
    );
    await collect(
      streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages, tools: [tool] }),
    );
    const results = (calls[1]!.body!.messages as { content: Record<string, unknown>[] }[])[2]!
      .content;
    // Both answers go back together, in one message.
    expect(results).toEqual([
      { type: "tool_result", tool_use_id: "a", is_error: true, content: "GitHub said no" },
      expect.objectContaining({ tool_use_id: "b", is_error: true }),
    ]);
  });

  it("never runs a tool call that was cut off part-way", async () => {
    const tool = fake("write_file");
    stubNet(() =>
      claudeStream([{ tool: "write_file", id: "a", input: { path: "x" } }], "max_tokens"),
    );
    await expect(
      collect(streamClaude({ apiKey: KEY, model: "claude-haiku-4-5", messages, tools: [tool] })),
    ).rejects.toThrow(/ran out of room/);
    expect(tool.run).not.toHaveBeenCalled();
  });
});

describe("naming a repository and a path", () => {
  it("takes owner/name or a GitHub address, and nothing else", () => {
    expect(parseRepo("octo/widgets")).toBe("octo/widgets");
    expect(parseRepo(" https://github.com/octo/widgets.git ")).toBe("octo/widgets");
    expect(parseRepo("git@github.com:octo/widgets.git")).toBe("octo/widgets");
    expect(parseRepo("https://github.com/octo/widgets/")).toBe("octo/widgets");
    for (const bad of [
      "widgets",
      "octo/",
      "a/b/c",
      "https://evil.example/octo/widgets",
      "",
      7,
      null,
    ]) {
      expect(parseRepo(bad)).toBeNull();
    }
  });

  it("keeps paths inside the repository", () => {
    expect(repoPath("src/app page.ts")).toBe("src/app%20page.ts");
    expect(repoPath("./README.md")).toBe("README.md");
    expect(repoPath("", true)).toBe("");
    for (const bad of [
      "../secrets",
      "a/../../b",
      "/etc/passwd",
      ".git/config",
      "a\\b",
      "a//b",
      "",
      5,
    ]) {
      expect(() => repoPath(bad)).toThrow();
    }
  });
});

describe("the repository tools", () => {
  const REPO = "octo/widgets";
  const BRANCH = workBranch(SESSION);
  const tools = () => githubTools({ token: TOKEN, repo: REPO, sessionId: SESSION });
  const use = (list: ClaudeTool[], name: string, input: Record<string, unknown>) =>
    list.find((t) => t.definition.name === name)!.run(input);

  /** A small GitHub: one repository, whose work branch does not exist until it is made. */
  function github(files: Record<string, string> = { "README.md": "# Widgets" }) {
    let branched = false;
    let pulls = 0;
    const calls = stubNet((call) => {
      const path = call.url.pathname;
      const json = (body: unknown, status = 200) => Response.json(body, { status });
      if (call.url.origin !== "https://api.github.com") return json({ message: "wrong host" }, 500);
      if (path === `/repos/${REPO}`) return json({ default_branch: "main", full_name: REPO });
      if (path === `/repos/${REPO}/git/ref/heads/${BRANCH}`) {
        return branched ? json({ object: { sha: "b1" } }) : json({ message: "Not Found" }, 404);
      }
      if (path === `/repos/${REPO}/git/ref/heads/main`) return json({ object: { sha: "m1" } });
      if (path === `/repos/${REPO}/git/refs` && call.method === "POST") {
        branched = true;
        return json({ ref: call.body!.ref }, 201);
      }
      if (path.startsWith(`/repos/${REPO}/contents/`) || path === `/repos/${REPO}/contents`) {
        const file = decodeURIComponent(path.slice(`/repos/${REPO}/contents/`.length));
        if (call.method === "PUT") {
          files[file] = Buffer.from(String(call.body!.content), "base64").toString("utf8");
          return json({ content: { path: file } }, 201);
        }
        if (call.method === "DELETE") {
          delete files[file];
          return json({});
        }
        if (file === "") {
          return json(
            Object.keys(files).map((name) => ({ name, type: "file", size: files[name]!.length })),
          );
        }
        if (!(file in files)) return json({ message: "Not Found" }, 404);
        if (call.headers.get("accept")?.includes("raw")) return new Response(files[file]);
        return json({ type: "file", sha: `sha-${file}`, path: file });
      }
      if (path === "/search/code") return json({ total_count: 1, items: [{ path: "README.md" }] });
      if (path === `/repos/${REPO}/pulls` && call.method === "POST") {
        if (pulls++ > 0) return json({ message: "A pull request already exists" }, 422);
        return json({ number: 7, html_url: `https://github.com/${REPO}/pull/7` }, 201);
      }
      if (path === `/repos/${REPO}/pulls`) {
        return json([{ number: 7, html_url: `https://github.com/${REPO}/pull/7` }]);
      }
      return json({ message: `unexpected ${call.method} ${path}` }, 500);
    });
    return { calls, files };
  }

  it("lists, reads and searches, with the token sent to GitHub and to nobody else", async () => {
    const { calls } = github();
    const list = tools();
    expect(await use(list, "list_files", { path: "" })).toContain("README.md");
    expect(await use(list, "read_file", { path: "README.md" })).toBe("# Widgets");
    expect(await use(list, "read_file", { path: "nope.md" })).toMatch(/no file/);
    expect(await use(list, "search_code", { query: "widgets repo:someone/else" })).toContain(
      "README.md",
    );
    for (const call of calls) {
      expect(call.url.origin).toBe("https://api.github.com");
      expect(call.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    }
    // Nothing was read from anywhere but the default branch, and the search stays in this repository.
    const search = calls.find((c) => c.url.pathname === "/search/code")!;
    expect(search.url.searchParams.get("q")).toBe(`widgets repo:${REPO}`);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("writes to a branch of the chat's own, made from the default branch, and never to it", async () => {
    const { calls, files } = github();
    const list = tools();
    expect(
      await use(list, "write_file", {
        path: "src/new.ts",
        content: "export {};\n",
        message: "Add new",
      }),
    ).toBe(`Created src/new.ts on branch ${BRANCH}.`);
    expect(
      await use(list, "write_file", { path: "README.md", content: "# New", message: "Edit\nmore" }),
    ).toBe(`Updated README.md on branch ${BRANCH}.`);
    expect(files["src/new.ts"]).toBe("export {};\n");
    const made = calls.filter((c) => c.url.pathname.endsWith("/git/refs"));
    expect(made).toHaveLength(1); // the branch is made once
    expect(made[0]!.body).toEqual({ ref: `refs/heads/${BRANCH}`, sha: "m1" });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    for (const put of puts) expect(put.body!.branch).toBe(BRANCH);
    expect(puts[0]!.body).not.toHaveProperty("sha"); // a new file
    expect(puts[1]!.body).toMatchObject({ sha: "sha-README.md", message: "Edit" }); // a replacement
    // Once the branch exists, reading comes from it, so Claude sees what it wrote.
    await use(list, "read_file", { path: "README.md" });
    expect(calls.at(-1)!.url.searchParams.get("ref")).toBe(BRANCH);
  });

  it("deletes on that branch only, and refuses paths outside the repository", async () => {
    const { calls } = github();
    const list = tools();
    expect(await use(list, "delete_file", { path: "README.md", message: "Remove" })).toMatch(
      /Deleted/,
    );
    expect(calls.find((c) => c.method === "DELETE")!.body).toMatchObject({ branch: BRANCH });
    const before = calls.length;
    await expect(
      use(list, "write_file", { path: "../x", content: "", message: "m" }),
    ).rejects.toThrow(/not a path/);
    await expect(use(list, "read_file", { path: ".git/config" })).rejects.toThrow(/not a path/);
    expect(calls.length).toBe(before); // nothing was asked of GitHub
  });

  it("opens a pull request from the branch, and points at the one there is if asked again", async () => {
    const { calls } = github();
    const list = tools();
    expect(await use(list, "open_pull_request", { title: "T", body: "B" })).toMatch(
      /Nothing has been written/,
    );
    await use(list, "write_file", { path: "a.txt", content: "a", message: "Add a" });
    expect(await use(list, "open_pull_request", { title: "T", body: "B" })).toContain(
      `/${REPO}/pull/7`,
    );
    const opened = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/pulls"))!;
    expect(opened.body).toEqual({ title: "T", body: "B", head: BRANCH, base: "main" });
    expect(await use(list, "open_pull_request", { title: "T", body: "B" })).toMatch(
      /already an open pull request/,
    );
  });

  it("checks what Claude sends before using it", () => {
    const write = tools().find((t) => t.definition.name === "write_file")!;
    expect(write.check({ path: "a", content: "b", message: "c" })).toBeNull();
    expect(write.check({ path: "a", content: "b" })).toMatch(/message/);
    expect(write.check({ path: 1, content: "b", message: "c" })).toMatch(/path/);
    expect(write.check("nope")).not.toBeNull();
  });

  it("explains a refusal from GitHub without repeating the token", async () => {
    stubNet(() => Response.json({ message: `Bad credentials ${TOKEN}` }, { status: 401 }));
    await expect(use(tools(), "list_files", { path: "" })).rejects.toThrow(
      /did not accept the token/,
    );
    await expect(use(tools(), "list_files", { path: "" })).rejects.not.toThrow(/SECRET/);
  });
});

describe("Claude and a repository, through the app", () => {
  const req = (method: string, path: string, body?: unknown) =>
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  async function events(res: Response): Promise<StreamEvent[]> {
    return (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StreamEvent);
  }

  it("keeps the Claude key and the GitHub token masked, and says which model is in use", async () => {
    await putSettings(
      req("PUT", "/api/settings", { provider: "claude", claudeKey: KEY, githubToken: TOKEN }),
    );
    const res = await getSettings(req("GET", "/api/settings"));
    const text = await res.text();
    expect(text).not.toContain("SECRET");
    const { settings } = JSON.parse(text) as { settings: PublicSettings };
    expect(settings).toMatchObject({
      provider: "claude",
      active: { ready: true, model: "claude-opus-5-5" },
      claude: { model: "claude-opus-5-5", key: { set: true, source: "settings" } },
      github: { set: true, source: "settings" },
    });
    expect(settings.claude.workspace).toBe("");
    expect(
      (await putSettings(req("PUT", "/api/settings", { claudeWorkspace: "has spaces" }))).status,
    ).toBe(400);
    await putSettings(req("PUT", "/api/settings", { claudeWorkspace: "wrkspc_01abc" }));
    await putSettings(
      req("PUT", "/api/settings", { claudeModel: "claude-sonnet-5-5", githubToken: null }),
    );
    const after = (await (await getSettings(req("GET", "/api/settings"))).json()) as {
      settings: PublicSettings;
    };
    expect(after.settings.active.model).toBe("claude-sonnet-5-5");
    expect(after.settings.github.set).toBe(false);
    expect(after.settings.claude.workspace).toBe("wrkspc_01abc");
    expect((await putSettings(req("PUT", "/api/settings", { provider: "nonsense" }))).status).toBe(
      400,
    );
  });

  it("records on each reply which model wrote it and at what thinking level", async () => {
    await putSettings(req("PUT", "/api/settings", { provider: "claude", claudeKey: KEY }));
    const { session } = (await (
      await createSession(
        req("POST", "/api/sessions", {
          model: { provider: "claude", model: "claude-fable-5-2" },
          reasoning: "xhigh",
        }),
      )
    ).json()) as { session: Session };
    expect(session.reasoning).toBe("xhigh");
    // Fable 5.2 declines and the API hands the request to Opus 5.5.
    stubNet(() => claudeStream([{ text: "answered" }], "end_turn", "claude-opus-5-5"));
    const sent = await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "hi" }),
        ctx(session.id),
      ),
    );
    const said = sent.filter((e) => e.type === "model").map((e) => e.ranOn);
    const asked = {
      provider: "claude",
      requested: "claude-fable-5-2",
      effort: "xhigh",
      // The API is paid for in API tokens, and each reply keeps that on record.
      paidBy: "api",
      // And which account's key it was, even while there is only the one.
      accountId: "main",
    };
    expect(said).toEqual([
      { ...asked, model: "claude-fable-5-2" },
      { ...asked, model: "claude-opus-5-5" },
    ]);
    const detail = (await (
      await getSession(req("GET", `/api/sessions/${session.id}`), ctx(session.id))
    ).json()) as SessionDetail;
    expect(detail.session.messages.at(-1)?.ranOn).toEqual({ ...asked, model: "claude-opus-5-5" });
  });

  it("tests Claude by asking about the model, which costs nothing", async () => {
    const calls = stubNet((call) =>
      call.url.hostname === "api.anthropic.com"
        ? Response.json({
            id: "claude-opus-5-5",
            display_name: "Claude Opus 5.5",
            type: "model",
            created_at: "",
          })
        : Response.json({ login: "octo" }),
    );
    const res = await testSettings(
      req("POST", "/api/settings/test", { provider: "claude", claudeKey: KEY, githubToken: TOKEN }),
    );
    const body = (await res.json()) as {
      check: { ok: boolean; steps: { id: string; ok: boolean; detail: string }[] };
    };
    expect(body.check.ok).toBe(true);
    expect(body.check.steps.map((s) => s.id)).toEqual(["key", "github"]);
    expect(body.check.steps[1]!.detail).toContain("octo");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls[0]!.url.pathname).toBe("/v1/models/claude-opus-5-5");
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("gives Claude the project's repository, runs its tools, and saves the answer", async () => {
    await putSettings(
      req("PUT", "/api/settings", { provider: "claude", claudeKey: KEY, githubToken: TOKEN }),
    );
    const { project } = (await (
      await createProject(req("POST", "/api/projects", { name: "widgets" }))
    ).json()) as { project: Project };
    const tied = await patchProject(
      req("PATCH", `/api/projects/${project.id}`, { repo: "https://github.com/octo/widgets" }),
      ctx(project.id),
    );
    expect(((await tied.json()) as { project: Project }).project.repo).toBe("octo/widgets");
    expect(
      (
        await patchProject(
          req("PATCH", `/api/projects/${project.id}`, { repo: "not a repo" }),
          ctx(project.id),
        )
      ).status,
    ).toBe(400);
    const { session } = (await (
      await createSession(req("POST", "/api/sessions", { projectId: project.id }))
    ).json()) as { session: Session };

    let asked = 0;
    const calls = stubNet((call) => {
      if (call.url.hostname === "api.anthropic.com") {
        return ++asked === 1
          ? claudeStream([{ tool: "list_files", id: "t1", input: { path: "" } }], "tool_use")
          : claudeStream([{ text: "There is a README." }]);
      }
      if (call.url.pathname === "/repos/octo/widgets")
        return Response.json({ default_branch: "main" });
      if (call.url.pathname.includes("/git/ref/"))
        return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json([{ name: "README.md", type: "file", size: 9 }]);
    });
    const out = await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "what is here?" }),
        ctx(session.id),
      ),
    );
    expect(out.at(-1)).toMatchObject({ type: "done", stopped: false });
    const first = calls.find((c) => c.url.hostname === "api.anthropic.com")!;
    expect(String(first.body!.system)).toContain("connected to the GitHub repository octo/widgets");
    expect(String(first.body!.system)).toContain(workBranch(session.id));
    expect((first.body!.tools as { name: string }[]).map((t) => t.name)).toEqual([
      "list_files",
      "read_file",
      "search_code",
      "write_file",
      "edit_file",
      "delete_file",
      "open_pull_request",
    ]);
    const saved = (await (
      await getSession(req("GET", `/api/sessions/${session.id}`), ctx(session.id))
    ).json()) as SessionDetail;
    expect(saved.session.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "There is a README.",
    });
    expect(saved.session.messages.at(-1)!.thinking).toContain(
      "[listing the top of the repository]",
    );
    expect(JSON.stringify(saved)).not.toContain("SECRET");
  });

  it("lets each chat keep a model of its own, whatever settings say", async () => {
    // Settings: the other provider. This chat: Claude Haiku. Another chat: whatever settings say.
    await putSettings(
      req("PUT", "/api/settings", {
        apiKey: "sk-other-000000",
        claudeKey: KEY,
        provider: "compatible",
      }),
    );
    const made = await createSession(
      req("POST", "/api/sessions", { model: { provider: "claude", model: "claude-haiku-5-5" } }),
    );
    const { session } = (await made.json()) as { session: Session };
    expect(session.model).toEqual({ provider: "claude", model: "claude-haiku-5-5" });
    const calls = stubNet((call) =>
      call.url.hostname === "api.anthropic.com"
        ? claudeStream([{ text: "from claude" }])
        : new Response(
            'data: {"choices":[{"delta":{"content":"from the other"}}]}\n\ndata: [DONE]\n\n',
            {
              headers: { "content-type": "text/event-stream" },
            },
          ),
    );
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "hi" }),
        ctx(session.id),
      ),
    );
    expect(calls.at(-1)!.url.hostname).toBe("api.anthropic.com");
    expect(calls.at(-1)!.body!.model).toBe("claude-haiku-5-5");

    // Change it on the chat, and the next message goes to the new one.
    const moved = await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, {
        model: { provider: "claude", model: "claude-sonnet-5-5" },
      }),
      ctx(session.id),
    );
    const after = (await moved.json()) as { session: Session };
    expect(after.session.model).toEqual({ provider: "claude", model: "claude-sonnet-5-5" });
    expect(after.session.title).toBe("hi"); // setting a model renames nothing
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "again" }),
        ctx(session.id),
      ),
    );
    expect(calls.at(-1)!.body!.model).toBe("claude-sonnet-5-5");

    // A chat with no model of its own follows settings; null puts a chat back to that.
    const plain = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${plain.session.id}/messages`, { content: "hi" }),
        ctx(plain.session.id),
      ),
    );
    expect(calls.at(-1)!.url.hostname).not.toBe("api.anthropic.com");
    const cleared = await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { model: null }),
      ctx(session.id),
    );
    expect(((await cleared.json()) as { session: Session }).session.model).toBeNull();

    // The same goes for how hard it thinks: each chat has its own level.
    await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, {
        model: { provider: "claude", model: "claude-opus-5-5" },
        reasoning: "low",
      }),
      ctx(session.id),
    );
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "think less" }),
        ctx(session.id),
      ),
    );
    expect(calls.at(-1)!.body!.output_config).toEqual({ effort: "low" });
    const eager = (await (
      await createSession(
        req("POST", "/api/sessions", {
          model: { provider: "claude", model: "claude-opus-5-5" },
          reasoning: "max",
        }),
      )
    ).json()) as { session: Session };
    expect(eager.session.reasoning).toBe("max");
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${eager.session.id}/messages`, { content: "think hard" }),
        ctx(eager.session.id),
      ),
    );
    expect(calls.at(-1)!.body!.output_config).toEqual({ effort: "max" });
    const reset = await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { reasoning: null }),
      ctx(session.id),
    );
    expect(((await reset.json()) as { session: Session }).session.reasoning).toBeNull();
    expect(
      (
        await patchSession(
          req("PATCH", `/api/sessions/${session.id}`, { reasoning: "lots" }),
          ctx(session.id),
        )
      ).status,
    ).toBe(400);

    // Nonsense is refused.
    for (const model of [{ provider: "nope", model: "x" }, { provider: "claude" }, "claude"]) {
      expect((await createSession(req("POST", "/api/sessions", { model }))).status).toBe(400);
      expect(
        (
          await patchSession(
            req("PATCH", `/api/sessions/${session.id}`, { model }),
            ctx(session.id),
          )
        ).status,
      ).toBe(400);
    }
  });

  it("gives Claude no repository tools without a token, or outside a project with one", async () => {
    await putSettings(req("PUT", "/api/settings", { provider: "claude", claudeKey: KEY }));
    const { session } = (await (await createSession(req("POST", "/api/sessions"))).json()) as {
      session: Session;
    };
    const calls = stubNet(() => claudeStream([{ text: "hi" }]));
    await events(
      await sendMessage(
        req("POST", `/api/sessions/${session.id}/messages`, { content: "hello" }),
        ctx(session.id),
      ),
    );
    expect(calls[0]!.body).not.toHaveProperty("tools");
    expect(calls[0]!.body).not.toHaveProperty("system");
  });
});
