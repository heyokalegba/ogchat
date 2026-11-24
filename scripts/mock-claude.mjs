#!/usr/bin/env node
/**
 * A stand-in for the Claude API and for GitHub, for trying ogchat's Claude
 * provider without a key, a token, or a connection.
 *
 *   node scripts/mock-claude.mjs            # listens on http://127.0.0.1:8789
 *   OGCHAT_ANTHROPIC_URL=http://127.0.0.1:8789 \
 *   OGCHAT_GITHUB_URL=http://127.0.0.1:8789 npm run dev
 *
 * Any key and any token are accepted. Claude "thinks", looks at the top of
 * the repository if it has been given one (or runs a command, if it may
 * and has no repository), then answers. The repository has
 * two files and takes writes on any branch.
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8789);
const files = {
  "README.md": "# Widgets\n\nA stand-in repository.\n",
  "src/index.ts": "export {};\n",
};
const branches = new Set(["main"]);

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

function stream(res, blocks, stop) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const say = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  say("message_start", {
    type: "message_start",
    message: {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  });
  blocks.forEach((block, index) => {
    const [start, delta] =
      "text" in block
        ? [
            { type: "text", text: "" },
            { type: "text_delta", text: block.text },
          ]
        : "thinking" in block
          ? [
              { type: "thinking", thinking: "", signature: "" },
              { type: "thinking_delta", thinking: block.thinking },
            ]
          : [
              { type: "tool_use", id: block.id, name: block.tool, input: {} },
              { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
            ];
    say("content_block_start", { type: "content_block_start", index, content_block: start });
    say("content_block_delta", { type: "content_block_delta", index, delta });
    say("content_block_stop", { type: "content_block_stop", index });
  });
  say("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: 20 },
  });
  say("message_stop", { type: "message_stop" });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const path = url.pathname;

  // ---- Claude
  if (path.startsWith("/v1/models/")) {
    const id = path.slice("/v1/models/".length);
    return send(res, 200, { id, type: "model", display_name: `Mock ${id}`, created_at: "" });
  }
  if (path === "/v1/messages" && req.method === "POST") {
    const last = body.messages?.at(-1);
    const answered =
      Array.isArray(last?.content) && last.content.some((part) => part.type === "tool_result");
    const hasRepo = (body.tools ?? []).some((tool) => tool.name === "list_files");
    const canRun = (body.tools ?? []).some((tool) => tool.name === "run_command");
    if (canRun && !hasRepo && !answered) {
      return stream(
        res,
        [{ tool: "run_command", id: "toolu_run", input: { command: "echo $((6*7)); uname -s" } }],
        "tool_use",
      );
    }
    if (hasRepo && !answered) {
      return stream(
        res,
        [
          { thinking: "I should look at the repository first." },
          { tool: "list_files", id: "toolu_mock", input: { path: "" } },
        ],
        "tool_use",
      );
    }
    const found = answered
      ? String(last.content.find((part) => part.type === "tool_result").content)
      : null;
    return stream(
      res,
      [
        ...(answered ? [] : [{ thinking: "A short answer will do." }]),
        {
          text: found ? `Here is what came back:\n\n${found}` : "Mock Claude here. Hello.",
        },
      ],
      "end_turn",
    );
  }

  // ---- GitHub
  if (path === "/user") return send(res, 200, { login: "mock-user" });
  if (path === "/user/repos") {
    return send(res, 200, [
      { full_name: "octo/widgets", private: false, default_branch: "main" },
      { full_name: "octo/secret-plans", private: true, default_branch: "trunk" },
    ]);
  }
  const repo = path.match(/^\/repos\/[^/]+\/[^/]+(\/.*)?$/);
  if (repo) {
    const rest = repo[1] ?? "";
    if (rest === "") return send(res, 200, { default_branch: "main" });
    if (rest.startsWith("/git/ref/heads/")) {
      const name = decodeURIComponent(rest.slice("/git/ref/heads/".length));
      return branches.has(name)
        ? send(res, 200, { object: { sha: "0".repeat(40) } })
        : send(res, 404, { message: "Not Found" });
    }
    if (rest === "/git/refs" && req.method === "POST") {
      branches.add(String(body.ref).replace("refs/heads/", ""));
      return send(res, 201, { ref: body.ref });
    }
    if (rest === "/branches")
      return send(
        res,
        200,
        [...branches].map((name) => ({ name })),
      );
    if (rest === "/pulls") {
      return send(res, req.method === "POST" ? 201 : 200, {
        number: 1,
        html_url: "https://github.com/mock/mock/pull/1",
      });
    }
    if (rest === "/contents" || rest.startsWith("/contents/")) {
      const file = decodeURIComponent(rest.slice("/contents/".length));
      if (req.method === "PUT") {
        files[file] = Buffer.from(String(body.content), "base64").toString("utf8");
        return send(res, 201, { content: { path: file } });
      }
      if (req.method === "DELETE") {
        delete files[file];
        return send(res, 200, {});
      }
      if (file in files) {
        if (req.headers.accept?.includes("raw")) {
          res.writeHead(200, { "content-type": "text/plain" });
          return res.end(files[file]);
        }
        return send(res, 200, { type: "file", path: file, sha: "1".repeat(40) });
      }
      const under = Object.keys(files).filter((name) => !file || name.startsWith(`${file}/`));
      if (!under.length) return send(res, 404, { message: "Not Found" });
      const names = new Map();
      for (const name of under) {
        const [head, ...tail] = name.slice(file ? file.length + 1 : 0).split("/");
        names.set(head, tail.length ? "dir" : "file");
      }
      return send(
        res,
        200,
        [...names].map(([name, type]) => ({
          name,
          type,
          size: 10,
          path: file ? `${file}/${name}` : name,
        })),
      );
    }
  }
  if (path === "/search/code") return send(res, 200, { total_count: 0, items: [] });
  send(res, 404, { message: `mock: nothing at ${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock Claude and GitHub on http://127.0.0.1:${PORT}`);
});
