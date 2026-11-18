import { describe, expect, it, vi } from "vitest";
import {
  buildChatRequest,
  checkProvider,
  maskKey,
  ProviderAbortedError,
  ProviderAuthError,
  ProviderConfigError,
  ProviderCreditsError,
  ProviderEmptyReplyError,
  ProviderError,
  ProviderForbiddenError,
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
  model: "abliterated-model-large-v2",
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
      model: "abliterated-model-large-v2",
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

  it("adds the thinking level and web search only when asked", () => {
    const base = { baseUrl: "https://api.abliteration.ai/v1", apiKey: "k", model: "m" };
    const plain = JSON.parse(buildChatRequest(base, history).init.body);
    expect(plain).not.toHaveProperty("reasoning_effort");
    expect(plain).not.toHaveProperty("web_search_options");
    const full = JSON.parse(
      buildChatRequest(base, history, { reasoningEffort: "max", webSearch: true }).init.body,
    );
    expect(full.reasoning_effort).toBe("max");
    expect(full.web_search_options).toEqual({ search_context_size: "medium" });
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

  it("maps 401 to ProviderAuthError, with what the provider said", async () => {
    const { options } = harness(() =>
      Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 }),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderAuthError);
    expect(err.code).toBe("invalid_key");
    expect(err.status).toBe(401);
    expect(err.message).toContain("Incorrect API key provided");
  });

  it("maps 402 to ProviderCreditsError: the key is fine, the account is empty", async () => {
    const { options } = harness(() =>
      Response.json({ error: { message: "Insufficient credits" } }, { status: 402 }),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderCreditsError);
    expect(err.code).toBe("no_credits");
    expect(err.status).toBe(402);
    expect(err.message).toMatch(/out of credits/);
    expect(err.message).toMatch(/key is fine/);
  });

  it("maps 403 to ProviderForbiddenError, not to a wrong key", async () => {
    const denied = harness(() =>
      Response.json({ error: { message: "Key lacks access to this project" } }, { status: 403 }),
    );
    const err = await failure(denied.options);
    expect(err).toBeInstanceOf(ProviderForbiddenError);
    expect(err).not.toBeInstanceOf(ProviderAuthError);
    expect(err.code).toBe("forbidden");
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/not allowed to use this model or project/);
    expect(err.message).toContain("Key lacks access to this project");

    const policy = harness(() =>
      Response.json({ error: { message: "policy_violation" } }, { status: 403 }),
    );
    expect((await failure(policy.options)).message).toMatch(
      /blocked this request under its policy/,
    );
  });

  it("says what the address should be when a 404 comes from a mistyped one", async () => {
    const wrong = harness(() => Response.json({ detail: "Not found" }, { status: 404 }), {
      config: { ...config, baseUrl: "https://api.abliteration.ai/v2" },
    });
    const err = await failure(wrong.options);
    expect(err).toBeInstanceOf(ProviderHTTPError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("https://api.abliteration.ai/v1");
    expect(err.message).toMatch(/use default/);

    // The right address with a wrong model id keeps the general hint.
    const right = harness(() => Response.json({ detail: "Not found" }, { status: 404 }));
    expect((await failure(right.options)).message).toMatch(/base URL and model id/);
    // Another provider's addresses are none of our business.
    const other = harness(() => Response.json({ detail: "Not found" }, { status: 404 }), {
      config: { ...config, baseUrl: "http://127.0.0.1:8787/v2" },
    });
    expect((await failure(other.options)).message).not.toContain("abliteration.ai/v1");
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

  it("treats reasoning chunks as a sign of life, not as reply text", async () => {
    const chunk = (delta: object) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
    const onThinking = vi.fn();
    const { options } = harness(
      () =>
        streamResponse([
          chunk({ role: "assistant" }),
          chunk({ reasoning_content: "The user said hello." }),
          chunk({ reasoning_content: " I should greet them." }),
          chunk({ content: "Hello" }),
          chunk({ reasoning: "more thought" }),
          chunk({ content: " there" }),
          "data: [DONE]\n\n",
        ]),
      { onThinking },
    );
    expect(await collect(options)).toEqual(["Hello", " there"]);
    expect(onThinking).toHaveBeenCalledTimes(1);
  });

  it("says so when a model only thought and never answered", async () => {
    const { options } = harness(() =>
      streamResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "hmm" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    );
    const err = await failure(options);
    expect(err).toBeInstanceOf(ProviderEmptyReplyError);
    expect(err.message).toMatch(/thinking/);
  });

  it("lists sources the provider cites, unless the reply already links to them", async () => {
    const chunk = (body: object) => `data: ${JSON.stringify(body)}\n\n`;
    const annotation = (url: string, title: string) => ({
      type: "url_citation",
      url_citation: { url, title },
    });
    const { options } = harness(() =>
      streamResponse([
        chunk({ choices: [{ delta: { content: "See [the docs](https://a.example/docs)." } }] }),
        chunk({
          choices: [
            {
              delta: {
                annotations: [
                  annotation("https://a.example/docs", "Docs"),
                  annotation("https://b.example/post", "A [post]"),
                  annotation("javascript:alert(1)", "nope"),
                ],
              },
            },
          ],
          citations: ["https://c.example/", "https://b.example/post"],
        }),
        "data: [DONE]\n\n",
      ]),
    );
    expect((await collect(options)).join("")).toBe(
      "See [the docs](https://a.example/docs).\n\n**Sources**\n" +
        "- [A post](https://b.example/post)\n- [https://c.example/](https://c.example/)",
    );
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

describe("connection test", () => {
  const MODELS = { object: "list", data: [{ id: "abliterated-model" }, { id: config.model }] };
  const REPLY = { choices: [{ message: { role: "assistant", content: "ok" } }] };

  /** A provider answering GET /models and POST /chat/completions as told. */
  function provider(models: () => Response, chat: () => Response = () => Response.json(REPLY)) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return String(input).endsWith("/models") ? models() : chat();
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }
  const states = (check: Awaited<ReturnType<typeof checkProvider>>) =>
    Object.fromEntries(check.steps.map((step) => [step.id, step.ok]));

  it("passes when the key, the model and a test message all work", async () => {
    const { calls, fetchImpl } = provider(() => Response.json(MODELS));
    const check = await checkProvider({ config, fetchImpl });
    expect(check.ok).toBe(true);
    // The test key does not start with ak_, which is worth a note on abliteration.ai.
    expect(states(check)).toEqual({ settings: null, key: true, model: true, reply: true });
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ["GET", "https://api.abliteration.ai/v1/models"],
      ["POST", "https://api.abliteration.ai/v1/chat/completions"],
    ]);
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({ Authorization: `Bearer ${TEST_KEY}` });
    }
    expect(JSON.parse(String(calls[1]?.init.body))).toMatchObject({
      model: config.model,
      stream: false,
    });
    expect(JSON.stringify(check)).not.toContain(TEST_KEY);
  });

  it("does not question a key that looks like an abliteration.ai key", async () => {
    const { fetchImpl } = provider(() => Response.json(MODELS));
    const check = await checkProvider({
      config: { ...config, apiKey: "ak_0123456789abcdef" },
      fetchImpl,
    });
    expect(states(check).settings).toBe(true);
    expect(JSON.stringify(check)).not.toContain("ak_0123456789abcdef");
  });

  it("stops at a rejected key without sending a message", async () => {
    const { calls, fetchImpl } = provider(() =>
      Response.json({ error: { message: `Invalid API key ${TEST_KEY}` } }, { status: 401 }),
    );
    const check = await checkProvider({ config, fetchImpl });
    expect(check.ok).toBe(false);
    expect(states(check)).toEqual({ settings: null, key: false });
    expect(check.steps.at(-1)?.detail).toMatch(/rejected the API key \(401\)/);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(check)).not.toContain(TEST_KEY);
  });

  it("names the models the key can use when the model id is not one of them", async () => {
    const { fetchImpl } = provider(
      () => Response.json(MODELS),
      () => Response.json({ error: { message: "model not found" } }, { status: 404 }),
    );
    const check = await checkProvider({ config: { ...config, model: "large v2" }, fetchImpl });
    expect(check.ok).toBe(false);
    expect(states(check)).toMatchObject({ key: true, model: false, reply: false });
    const model = check.steps.find((step) => step.id === "model");
    expect(model?.detail).toContain("abliterated-model-large-v2");
  });

  it("tells an empty account apart from a bad key", async () => {
    const { fetchImpl } = provider(
      () => Response.json(MODELS),
      () => Response.json({ error: { message: "Insufficient credits" } }, { status: 402 }),
    );
    const check = await checkProvider({ config, fetchImpl });
    expect(check.ok).toBe(false);
    expect(states(check)).toMatchObject({ key: true, model: true, reply: false });
    expect(check.steps.at(-1)?.detail).toMatch(/out of credits/);
  });

  it("falls back to the test message when there is no model list", async () => {
    const { fetchImpl } = provider(() => new Response("nope", { status: 404 }));
    const check = await checkProvider({ config, fetchImpl });
    expect(check.ok).toBe(true);
    expect(states(check)).toEqual({ settings: null, key: null, reply: true });
  });

  it("catches the model's v2 typed into the address, and sends nothing there", async () => {
    const never = vi.fn() as unknown as typeof fetch;
    const check = await checkProvider({
      config: { ...config, baseUrl: "https://api.abliteration.ai/v2" },
      fetchImpl: never,
    });
    expect(check.ok).toBe(false);
    expect(check.steps).toHaveLength(1);
    expect(check.steps[0]).toMatchObject({ id: "settings", ok: false });
    expect(check.steps[0]?.detail).toContain("https://api.abliteration.ai/v1");
    expect(never).not.toHaveBeenCalled();
  });

  it("reports an unreachable provider and missing settings without throwing", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const down = await checkProvider({ config, fetchImpl: offline });
    expect(down.ok).toBe(false);
    expect(down.steps.at(-1)?.detail).toMatch(/Could not reach api\.abliteration\.ai/);

    const never = vi.fn() as unknown as typeof fetch;
    const noKey = await checkProvider({ config: { ...config, apiKey: null }, fetchImpl: never });
    expect(noKey.ok).toBe(false);
    expect(noKey.steps[0]?.detail).toMatch(/No API key is set/);
    const badUrl = await checkProvider({
      config: { ...config, baseUrl: "nope" },
      fetchImpl: never,
    });
    expect(badUrl.ok).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});
