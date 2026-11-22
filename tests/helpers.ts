import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

/** A realistic-looking key that must never show up in logs, errors or API responses. */
export const TEST_KEY = "sk-test-3f9a1c7e5b2d4086-SECRET";

const ENV_NAMES = [
  "OGCHAT_API_BASE_URL",
  "OGCHAT_API_KEY",
  "OGCHAT_MODEL",
  "OGCHAT_ALLOWED_HOSTS",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "OGCHAT_GITHUB_TOKEN",
  "OGCHAT_ANTHROPIC_URL",
  "OGCHAT_GITHUB_URL",
] as const;

/** Points the app at a fresh, empty data directory for every test. */
export function useTempDataDir(): { dir: () => string } {
  let dir = "";
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-test-"));
    vi.stubEnv("OGCHAT_DATA_DIR", dir);
    for (const name of ENV_NAMES) vi.stubEnv(name, "");
    delete (globalThis as { __ogchatGenerations?: unknown }).__ogchatGenerations;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir: () => dir };
}

const encoder = new TextEncoder();

/** A streaming chat-completions reply, one SSE event per delta. */
export function sseBody(deltas: string[]): string {
  return (
    deltas
      .map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
      .join("") + "data: [DONE]\n\n"
  );
}

/** A Response whose body arrives in the given raw chunks. */
export function streamResponse(
  chunks: string[],
  init: { status?: number; contentType?: string } = {},
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "Content-Type": init.contentType ?? "text/event-stream" },
  });
}

export function sseResponse(deltas: string[]): Response {
  return streamResponse([sseBody(deltas)]);
}

/**
 * A reply that sends the given deltas and then stays open until the request
 * is aborted, like a provider that is still generating.
 */
export function hangingResponse(deltas: string[], signal?: AbortSignal | null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const content of deltas) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
        );
      }
      signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        } catch {
          // already closed
        }
      });
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

export interface ProviderCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: {
    model: string;
    stream: boolean;
    messages: { role: string; content: string }[];
    reasoning_effort?: string;
    web_search_options?: { search_context_size?: string };
  };
  signal: AbortSignal | null;
}

/**
 * Replaces global fetch with a stub provider. Nothing in the test suite can
 * reach the network: every outgoing request lands here.
 */
export function stubProvider(respond: (call: ProviderCall) => Response | Promise<Response>): {
  calls: ProviderCall[];
} {
  const calls: ProviderCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: ProviderCall = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: { ...(init?.headers as Record<string, string>) },
        body: JSON.parse(String(init?.body ?? "{}")),
        signal: init?.signal ?? null,
      };
      calls.push(call);
      return respond(call);
    }),
  );
  return { calls };
}

/** Fails the test if anything tries to use the network. */
export function forbidNetwork(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`unexpected network call to ${String(input)}`);
    }),
  );
}

/** One reply from the Messages API as it streams: what the Anthropic SDK reads. */
export type ClaudeBlock =
  { text: string } | { thinking: string } | { tool: string; id: string; input: unknown };

export function claudeStream(blocks: ClaudeBlock[], stop = "end_turn"): Response {
  const events: [string, unknown][] = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
    ],
  ];
  blocks.forEach((block, index) => {
    const start =
      "text" in block
        ? { type: "text", text: "" }
        : "thinking" in block
          ? { type: "thinking", thinking: "", signature: "" }
          : { type: "tool_use", id: block.id, name: block.tool, input: {} };
    const delta =
      "text" in block
        ? { type: "text_delta", text: block.text }
        : "thinking" in block
          ? { type: "thinking_delta", thinking: block.thinking }
          : { type: "input_json_delta", partial_json: JSON.stringify(block.input) };
    events.push([
      "content_block_start",
      { type: "content_block_start", index, content_block: start },
    ]);
    events.push(["content_block_delta", { type: "content_block_delta", index, delta }]);
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push([
    "message_delta",
    {
      type: "message_delta",
      delta: { stop_reason: stop, stop_sequence: null },
      usage: { output_tokens: 20 },
    },
  ]);
  events.push(["message_stop", { type: "message_stop" }]);
  const body = events
    .map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
