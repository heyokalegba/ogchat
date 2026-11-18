#!/usr/bin/env node
/**
 * A stand-in provider for trying ogchat without a real API key.
 *
 *   npm run mock-provider            # listens on http://127.0.0.1:8787/v1
 *
 * Then, in ogchat's settings: base URL http://127.0.0.1:8787/v1, any API key.
 * It speaks the OpenAI chat-completions shape and streams a canned reply.
 * Special prompts exercise the failure paths:
 *   /empty   an empty reply          /error   a 500 from the provider
 *   /slow    a long, slow reply      /drop    the connection dies mid-reply
 * An API key of "bad" is rejected with 401.
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);

const REPLY = `Here is a short tour of what this surface renders.

## Markdown

Replies support **bold**, *emphasis*, \`inline code\`, [links](https://example.com) and lists:

- hairline borders, soft panels
- one accent hue
- monospace chrome, sans reading text

## Code

\`\`\`ts
export async function* streamChat(options: StreamChatOptions) {
  const res = await fetch(url, { ...init, signal });
  for await (const delta of deltas(res)) yield delta; // text as it arrives
}
\`\`\`

| key | action |
| --- | --- |
| enter | send |
| shift+enter | newline |

> You said: `;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || auth === "Bearer bad") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Incorrect API key provided." } }));
    return;
  }

  const body = await readBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = String(messages.at(-1)?.content ?? "");
  console.log(
    `[mock-provider] model=${body.model} messages=${messages.length} last=${JSON.stringify(last.slice(0, 60))}`,
  );

  if (last.startsWith("/error")) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "The mock provider was asked to fail." } }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (content) =>
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`);

  if (!last.startsWith("/empty")) {
    const slow = last.startsWith("/slow");
    const text = slow
      ? Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of a deliberately long reply.`).join(
          "\n\n",
        )
      : `${REPLY}${last.replace(/\s+/g, " ").slice(0, 200)}\n\nThat was message ${messages.length} of this session's context.`;
    const tokens = text.match(/\s*\S+/g) ?? [];
    let closed = false;
    res.on("close", () => (closed = true));
    for (const [index, token] of tokens.entries()) {
      if (closed) return;
      if (last.startsWith("/drop") && index === 12) {
        res.destroy();
        return;
      }
      send(token);
      await sleep(slow ? 60 : 22);
    }
  }
  res.write("data: [DONE]\n\n");
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-provider] OpenAI-compatible mock at http://127.0.0.1:${PORT}/v1`);
});
