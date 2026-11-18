import { describe, expect, it, vi } from "vitest";
import {
  buildChatRequest,
  maskKey,
  ProviderAbortedError,
  ProviderAuthError,
  ProviderConfigError,
  ProviderEmptyReplyError,
  ProviderError,
  ProviderHTTPError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  redactSecret,
  streamChat,
  type ProviderConfig,
  type ProviderMessage,
  type StreamChatOptions,
} from "@/lib/provider/adapter";
import { hangingResponse, sseBody, sseResponse, streamResponse, TEST_KEY } from "./helpers";

const config: ProviderConfig = {
  baseUrl: "https://api.abliteration.ai/v1",
  apiKey: TEST_KEY,
  model: "abliterated-model-large",
};

const history: ProviderMessage[] = [
  { role: "system", content: "Be brief." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi." },
  { role: "user", content: "And again" },
];

type FetchStub = (url: string, init: RequestInit) => Response | Promise<Response>;

function harness(respond: FetchStub, overrides: Partial<StreamChatOptions> = {}) {
  const logs: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    respond(String(input), init ?? {}),
  );
  const options: StreamChatOptions = {
    config,
    messages: history,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    logger: { warn: (message) => logs.push(message) },
    ...overrides,
  };
  return { options, fetchImpl, logs };
}

async function collect(options: StreamChatOptions): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of streamChat(options)) out.push(delta);
  return out;
}

async function failure(options: StreamChatOptions): Promise<ProviderError> {
  try {
    await collect(options);
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    return err as ProviderError;
  }
  throw new Error("expected streamChat to fail");
}

describe("request shape", () => {
  it("posts an OpenAI chat-completions request to {base}/chat/completions", async () => {
    const { options, fetchImpl } = harness(() => sseResponse(["ok"]));
    await collect(options);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.abliteration.ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TEST_KEY}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model: "abliterated-model-large",
      stream: true,
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi." },
        { role: "user", content: "And again" },
      ],
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("takes the base URL and model from config, tolerating trailing slashes", () => {
    const { url, init } = buildChatRequest(
      { baseUrl: "http://127.0.0.1:8787/custom/v1//", apiKey: "k", model: "other-model" },
      [{ role: "user", content: "x" }],
    );
    expect(url).toBe("http://127.0.0.1:8787/custom/v1/chat/completions");
    expect(JSON.parse(init.body).model).toBe("other-model");
  });

  it("sends only role and content for each message", () => {
    const messages = [
      { role: "user", content: "x", id: "m1", createdAt: "now", partial: true },
    ] as unknown as ProviderMessage[];
    const { init } = buildChatRequest({ ...config, apiKey: "k" }, messages);
    expect(JSON.parse(init.body).messages).toEqual([{ role: "user", content: "x" }]);
  });
});

describe("streaming", () => {
  it("yields deltas in order", async () => {
    const { options } = harness(() => sseResponse(["Hel", "lo", ", ", "world"]));
    expect(await collect(options)).toEqual(["Hel", "lo", ", ", "world"]);
  });

  it("reassembles events split across network chunks, including multi-byte text", async () => {
    const bytes = new TextEncoder().encode(sseBody(["naïve ", "café ☕", " done"]));
    // Deliver three bytes at a time, so events and characters are cut mid-way.
    const pieces: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 3) pieces.push(bytes.slice(i, i + 3));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(piece);
        controller.close();
      },
    });
    const { options } = harness(
      () => new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    );
    expect((await collect(options)).join("")).toBe("naïve café ☕ done");
  });

  it("ignores keep-alives, role-only chunks, CRLF line endings and a missing [DONE]", async () => {
    const raw =
      ": keep-alive\r\n\r\n" +
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\r\n\r\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "A" } }] })}\r\n\r\n` +
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\r\n\r\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "B" } }] })}`;
    const { options } = harness(() => streamResponse([raw]));
    expect(await collect(options)).toEqual(["A", "B"]);
  });

  it("stops reading at [DONE]", async () => {
    const raw =
      sseBody(["kept"]) +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "dropped" } }] })}\n\n`;
    const { options } = harness(() => streamResponse([raw]));
    expect(await collect(options)).toEqual(["kept"]);
  });

  it("accepts a provider that answers in one JSON piece instead of streaming", async () => {
    const { options } = harness(() =>
      Response.json({ choices: [{ message: { role: "assistant", content: "All at once." } }] }),
    );
    expect(await collect(options)).toEqual(["All at once."]);
  });
});

describe("error classes", () => {
  it("fails with ProviderConfigError before any request when the key is missing", async () => {
    for (const apiKey of [null, "", "   "]) {
      const { options, fetchImpl } = harness(() => sseResponse(["x"]), {
        config: { ...config, apiKey },
      });
      const err = await failure(options);
      expect(err).toBeInstanceOf(ProviderConfigError);
      expect(err.code).toBe("not_configured");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("fails with ProviderConfigError for an unusable base URL or model", async () => {
    const bad = harness(() => sseResponse(["x"]), { config: { ...config, baseUrl: "nonsense" } });
    expect(await failure(bad.options)).toBeInstanceOf(ProviderConfigError);
    const noModel = harness(() => sseResponse(["x"]), { config: { ...config, model: " " } });
    expect(await failure(noModel.options)).toBeInstanceOf(ProviderConfigError);
    expect(bad.fetchImpl).not.toHaveBeenCalled();
    expect(noModel.fetchImpl).not.toHaveBeenCalled();
  });

  it("maps 401 and 403 to ProviderAuthError", async () => {
    for (const status of [401, 403]) {
      const { options } = harness(() =>
        Response.json({ error: { message: "Incorrect API key provided" } }, { status }),
      );
      const err = await failure(options);
      expect(err).toBeInstanceOf(ProviderAuthError);
      expect(err.code).toBe("invalid_key");
      expect(err.status).toBe(status);
    }
  });

  it("maps 429 to ProviderRateLimitError", async () => {
    const { options } = harness(() =>
      Response.json({ error: { message: "Slow down" } }, { status: 429 }),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect(err.code).toBe("rate_limited");
  });

  it("maps other HTTP failures to ProviderHTTPError with the provider's detail", async () => {
    const { options } = harness(() =>
      Response.json({ error: { message: "model overloaded" } }, { status: 503 }),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderHTTPError);
    expect(err.code).toBe("provider_error");
    expect(err.status).toBe(503);
    expect(err.message).toContain("model overloaded");
  });

  it("does not paste an HTML error page into the message", async () => {
    const { options } = harness(
      () => new Response("<html><body>Bad gateway</body></html>", { status: 502 }),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderHTTPError);
    expect(err.message).not.toContain("<html>");
  });

  it("maps an error event inside a 200 stream to ProviderHTTPError", async () => {
    const raw = `data: ${JSON.stringify({ error: { message: "context length exceeded" } })}\n\n`;
    const { options } = harness(() => streamResponse([raw]));
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderHTTPError);
    expect(err.message).toContain("context length exceeded");
  });

  it("maps a failed connection to ProviderNetworkError", async () => {
    const { options } = harness(() => {
      throw new TypeError("fetch failed");
    });
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderNetworkError);
    expect(err.code).toBe("network");
    expect(err.message).toContain("api.abliteration.ai");
  });

  it("maps a connection dropped mid-reply to ProviderNetworkError, after the text so far", async () => {
    const event = `data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode(event));
        else controller.error(new TypeError("terminated"));
      },
    });
    const { options } = harness(
      () => new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    );
    const seen: string[] = [];
    let err: unknown;
    try {
      for await (const delta of streamChat(options)) seen.push(delta);
    } catch (e) {
      err = e;
    }
    expect(seen).toEqual(["partial"]);
    expect(err).toBeInstanceOf(ProviderNetworkError);
  });

  it("maps a reply with no text to ProviderEmptyReplyError", async () => {
    const empties: (() => Response)[] = [
      () => sseResponse([]),
      () => sseResponse(["", "  \n"]),
      () => Response.json({ choices: [{ message: { role: "assistant", content: "" } }] }),
      () => Response.json({ choices: [] }),
      () => new Response(null, { status: 200 }),
    ];
    for (const respond of empties) {
      const { options } = harness(respond);
      const err = await failure(options);
      expect(err).toBeInstanceOf(ProviderEmptyReplyError);
      expect(err.code).toBe("empty_reply");
    }
  });

  it("ends with ProviderAbortedError when the caller aborts mid-stream", async () => {
    const controller = new AbortController();
    const { options, logs } = harness(
      (_url, init) => hangingResponse(["one", "two"], init.signal),
      {
        signal: controller.signal,
      },
    );
    const seen: string[] = [];
    let err: unknown;
    try {
      for await (const delta of streamChat(options)) {
        seen.push(delta);
        if (seen.length === 2) controller.abort();
      }
    } catch (e) {
      err = e;
    }
    expect(seen).toEqual(["one", "two"]);
    expect(err).toBeInstanceOf(ProviderAbortedError);
    expect(logs).toEqual([]);
  });

  it("does not send anything when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { options, fetchImpl } = harness(() => sseResponse(["x"]), { signal: controller.signal });
    expect(await failure(options)).toBeInstanceOf(ProviderAbortedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("times out a provider that never answers", async () => {
    const { options } = harness(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
      { connectTimeoutMs: 20 },
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderTimeoutError);
    expect(err.code).toBe("timeout");
  });

  it("times out a stream that goes silent", async () => {
    const { options } = harness((_url, init) => hangingResponse(["started"], init.signal), {
      idleTimeoutMs: 20,
    });
    const seen: string[] = [];
    let err: unknown;
    try {
      for await (const delta of streamChat(options)) seen.push(delta);
    } catch (e) {
      err = e;
    }
    expect(seen).toEqual(["started"]);
    expect(err).toBeInstanceOf(ProviderTimeoutError);
  });
});

describe("the API key stays out of logs and messages", () => {
  it("masks keys, keeping at most the last four characters", () => {
    expect(maskKey(TEST_KEY)).toBe("••••••••CRET");
    expect(maskKey("short")).toBe("••••••••");
    expect(maskKey("")).toBe("(none)");
    expect(maskKey(null)).toBe("(none)");
  });

  it("redacts the key and bearer credentials from arbitrary text", () => {
    const text = `bad key ${TEST_KEY} in header Authorization: Bearer ${TEST_KEY}`;
    const clean = redactSecret(text, TEST_KEY);
    expect(clean).not.toContain(TEST_KEY);
    expect(clean).toContain("••••••••CRET");
    expect(redactSecret("Authorization: Bearer abc.def-123")).toBe(
      "Authorization: Bearer ••••••••",
    );
  });

  it("logs failures with the key masked", async () => {
    const { options, logs } = harness(() =>
      Response.json({ error: { message: "upstream exploded" } }, { status: 500 }),
    );
    await failure(options);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("key=••••••••CRET");
    expect(logs[0]).toContain("provider_error");
    expect(logs[0]).toContain("https://api.abliteration.ai/v1/chat/completions");
    expect(logs[0]).not.toContain(TEST_KEY);
    expect(logs[0]).not.toContain("Bearer");
  });

  it("scrubs a key that the provider echoes back in its error", async () => {
    const responses: (() => Response)[] = [
      () =>
        Response.json(
          { error: { message: `Incorrect API key provided: ${TEST_KEY}. Find yours at…` } },
          { status: 400 },
        ),
      () => new Response(`invalid token ${TEST_KEY}`, { status: 500 }),
      () =>
        streamResponse([
          `data: ${JSON.stringify({ error: { message: `key ${TEST_KEY} expired` } })}\n\n`,
        ]),
      () => Response.json({ error: { message: `quota for ${TEST_KEY}` } }, { status: 429 }),
      () => Response.json({ error: `denied ${TEST_KEY}` }, { status: 401 }),
    ];
    for (const respond of responses) {
      const { options, logs } = harness(respond);
      const err = await failure(options);
      expect(err.message).not.toContain(TEST_KEY);
      expect(String(err.stack)).not.toContain(TEST_KEY);
      expect(logs.join("\n")).not.toContain(TEST_KEY);
      expect(logs).toHaveLength(1);
    }
  });

  it("never writes the key to the console with the default logger", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const failing = harness(() => new Response(`nope ${TEST_KEY}`, { status: 401 }));
    await failure({ ...failing.options, logger: undefined });
    const ok = harness(() => sseResponse(["fine"]));
    await collect({ ...ok.options, logger: undefined });

    const written = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
    expect(written).toContain("invalid_key");
    expect(written).not.toContain(TEST_KEY);
  });
});
