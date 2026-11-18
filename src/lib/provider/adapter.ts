/**
 * The provider adapter: the only module that talks to the model provider.
 *
 * It speaks the OpenAI chat-completions shape
 *   POST {baseUrl}/chat/completions   Authorization: Bearer <key>
 * and turns the streamed reply into an async sequence of text deltas. To move
 * to a provider with a different wire format, change this file; nothing else
 * in the app knows what the provider looks like.
 */
import type { Role } from "@/lib/types";
import {
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
} from "./errors";
import { maskKey, redactSecret } from "./redact";

export * from "./errors";
export { maskKey, redactSecret } from "./redact";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

export type ProviderContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ProviderMessage {
  role: Role;
  /** Plain text, or OpenAI-style content parts when the message carries images. */
  content: string | ProviderContentPart[];
}

export interface ProviderLogger {
  warn(message: string): void;
}

export interface StreamChatOptions {
  config: ProviderConfig;
  messages: ProviderMessage[];
  /** Aborting this stops the request and ends the stream with ProviderAbortedError. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  logger?: ProviderLogger;
  /** Max wait for the provider to start responding. */
  connectTimeoutMs?: number;
  /** Max silence between two chunks of a streaming reply. */
  idleTimeoutMs?: number;
  /**
   * Called once if the model starts by reasoning (models such as
   * abliterated-model-large-v2 always do) before any answer text arrives.
   */
  onThinking?: () => void;
}

// Reasoning models can take a while to start and can pause between thought and answer.
const DEFAULT_CONNECT_TIMEOUT_MS = 120_000;
const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const DEFAULT_CHECK_TIMEOUT_MS = 45_000;
const USER_AGENT = "ogchat/0.1";
const MAX_DETAIL = 300;

const consoleLogger: ProviderLogger = {
  warn: (message) => console.warn(message),
};

export function chatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("unsupported protocol");
  }
  return `${url.toString().replace(/\/+$/, "")}/chat/completions`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "User-Agent": USER_AGENT };
}

/** Builds the outgoing request. Exported so its shape can be tested without a network. */
export function buildChatRequest(
  config: ProviderConfig & { apiKey: string },
  messages: ProviderMessage[],
): { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } } {
  return {
    url: chatCompletionsUrl(config.baseUrl),
    init: {
      method: "POST",
      headers: {
        ...authHeaders(config.apiKey),
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
      }),
    },
  };
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL)}…` : flat;
}

function errorDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const err = p.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof p.message === "string") return p.message;
  if (typeof p.detail === "string") return p.detail;
  return "";
}

async function readFailure(res: Response, key: string): Promise<string> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return "";
  }
  let detail = "";
  try {
    detail = errorDetail(JSON.parse(text));
  } catch {
    // Not JSON. Only pass plain text through; an HTML error page is noise.
    if (!/^\s*</.test(text)) detail = text;
  }
  return clip(redactSecret(detail, key));
}

function httpError(status: number, detail: string): ProviderError {
  if (status === 401) return new ProviderAuthError(status, detail);
  if (status === 402) return new ProviderCreditsError(detail);
  if (status === 403) return new ProviderForbiddenError(detail);
  if (status === 429) return new ProviderRateLimitError(detail);
  return new ProviderHTTPError(status, detail);
}

/** `text` is answer text; `thinking` marks a chunk that carried only reasoning. */
type SseResult = { done: true } | { done: false; text: string; thinking?: boolean } | null;

/** Where providers put a reasoning model's thoughts in a streamed chunk. */
const REASONING_FIELDS = ["reasoning_content", "reasoning", "thinking"] as const;

function parseSseLine(line: string, status: number, key: string): SseResult {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  if (data === "[DONE]") return { done: true };
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    throw new ProviderHTTPError(status, clip(redactSecret(errorDetail(payload), key)));
  }
  const delta = (payload as { choices?: { delta?: Record<string, unknown> }[] })?.choices?.[0]
    ?.delta;
  if (!delta || typeof delta !== "object") return null;
  const text = delta.content;
  if (typeof text === "string" && text) return { done: false, text };
  // Thoughts are not part of the reply. They only tell us the model is alive and working.
  const thinking = REASONING_FIELDS.some((field) => {
    const value = delta[field];
    return typeof value === "string" && value.length > 0;
  });
  return thinking ? { done: false, text: "", thinking: true } : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the provider";
  }
}

/**
 * Sends the conversation and yields the reply as text deltas.
 *
 * Throws a ProviderError subclass on every failure path, so callers can branch
 * on `code` and show `message` as is. The API key is never included in an
 * error message or a log line; logs carry the masked form only.
 */
export async function* streamChat(options: StreamChatOptions): AsyncGenerator<string, void, void> {
  const { config, messages, signal } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? consoleLogger;
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  const apiKey = config.apiKey?.trim() ?? "";
  if (!apiKey) {
    throw new ProviderConfigError("No API key is set. Open settings to add one.");
  }
  if (!config.model.trim()) {
    throw new ProviderConfigError("No model id is set. Open settings to choose one.");
  }
  let request: ReturnType<typeof buildChatRequest>;
  try {
    request = buildChatRequest({ ...config, apiKey }, messages);
  } catch {
    throw new ProviderConfigError(
      "The API base URL is not a valid http(s) URL. Check it in settings.",
    );
  }
  if (signal?.aborted) throw new ProviderAbortedError();

  const { url, init } = request;
  const host = hostOf(url);
  const inner = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      inner.abort();
    }, ms);
  };
  const onOuterAbort = () => inner.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  /** Why the in-flight request ended, when it did not end on its own. */
  const interruption = (fallback: string): ProviderError => {
    if (signal?.aborted) return new ProviderAbortedError();
    if (timedOut) return new ProviderTimeoutError();
    return new ProviderNetworkError(fallback);
  };

  try {
    arm(connectTimeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: inner.signal });
    } catch {
      throw interruption(
        `Could not reach the provider at ${host}. Check your connection and the API base URL.`,
      );
    }

    if (!res.ok) {
      throw httpError(res.status, await readFailure(res, apiKey));
    }

    const contentType = res.headers.get("content-type") ?? "";
    let produced = false;
    let thought = false;

    if (contentType.includes("application/json")) {
      // The provider ignored `stream: true` and answered in one piece.
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        throw interruption("The provider sent a reply that could not be read.");
      }
      const detail = errorDetail(payload);
      if (detail && (payload as { error?: unknown }).error) {
        throw new ProviderHTTPError(res.status, clip(redactSecret(detail, apiKey)));
      }
      const text = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
        ?.message?.content;
      if (typeof text === "string" && text.trim()) {
        produced = true;
        yield text;
      }
    } else if (res.body) {
      const reader = res.body.getReader();
      const cancelReader = () => {
        reader.cancel().catch(() => {});
      };
      inner.signal.addEventListener("abort", cancelReader, { once: true });
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      try {
        while (!finished) {
          arm(idleTimeoutMs);
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch {
            throw interruption("The connection to the provider dropped mid-reply.");
          }
          if (inner.signal.aborted) {
            throw interruption("The connection to the provider dropped mid-reply.");
          }
          buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
          if (chunk.done) buffer += "\n";
          let newline: number;
          while (!finished && (newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            const parsed = parseSseLine(line, res.status, apiKey);
            if (!parsed) continue;
            if (parsed.done) {
              finished = true;
            } else if (parsed.thinking) {
              if (!thought && !produced) options.onThinking?.();
              thought = true;
            } else {
              if (parsed.text.trim()) produced = true;
              yield parsed.text;
            }
          }
          if (chunk.done) finished = true;
        }
      } finally {
        inner.signal.removeEventListener("abort", cancelReader);
        cancelReader();
      }
    }

    if (!produced) {
      if (contentType.includes("text/html")) {
        throw new ProviderHTTPError(
          res.status,
          "the response was a web page, not an API reply. Check the API base URL",
        );
      }
      throw new ProviderEmptyReplyError(thought);
    }
  } catch (err) {
    const failure =
      err instanceof ProviderError
        ? err
        : new ProviderNetworkError(`The request to ${host} failed unexpectedly.`);
    if (!(failure instanceof ProviderAbortedError)) {
      logger.warn(
        redactSecret(
          `[ogchat:provider] ${failure.code} · POST ${url} · model=${config.model} · key=${maskKey(apiKey)} · ${failure.message}`,
          apiKey,
        ),
      );
    }
    throw failure;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

// ---------------------------------------------------------------- connection test

export type CheckStepId = "settings" | "key" | "model" | "reply";

export interface CheckStep {
  id: CheckStepId;
  /** true: fine. false: this is what is wrong. null: could not tell, or worth a look. */
  ok: boolean | null;
  title: string;
  /** Plain words, safe to show: the key appears masked only. */
  detail: string;
}

export interface ProviderCheck {
  ok: boolean;
  steps: CheckStep[];
}

export interface CheckOptions {
  config: ProviderConfig;
  fetchImpl?: typeof fetch;
  /** Max wait for each of the two requests. */
  timeoutMs?: number;
}

function modelIds(payload: unknown): string[] | null {
  const list = Array.isArray(payload) ? payload : (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return null;
  return list
    .map((entry) => (typeof entry === "string" ? entry : (entry as { id?: unknown } | null)?.id))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Answers "why is my key not working?" by walking the path a chat request
 * takes, one step at a time: the settings themselves, the key (by asking for
 * the model list), the model id, and finally one tiny real message, which is
 * the only thing that proves key, credits and model together.
 *
 * Never throws. Each step says in plain words what was found.
 */
export async function checkProvider(options: CheckOptions): Promise<ProviderCheck> {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const steps: CheckStep[] = [];
  const report = (): ProviderCheck => ({ ok: steps.every((step) => step.ok !== false), steps });
  const apiKey = config.apiKey?.trim() ?? "";
  const model = config.model.trim();
  const safe = (text: string) => redactSecret(text, apiKey);

  let chatUrl: string;
  try {
    chatUrl = chatCompletionsUrl(config.baseUrl);
  } catch {
    steps.push({
      id: "settings",
      ok: false,
      title: "settings",
      detail: "The API base URL is not a valid http(s) URL.",
    });
    return report();
  }
  if (!apiKey || !model) {
    steps.push({
      id: "settings",
      ok: false,
      title: "settings",
      detail: apiKey
        ? "No model id is set."
        : "No API key is set. Paste one above, or put it in .env.local as OGCHAT_API_KEY and restart ogchat.",
    });
    return report();
  }
  const base = chatUrl.slice(0, -"/chat/completions".length);
  const host = hostOf(chatUrl);
  // abliteration.ai keys all start with "ak_". Anything else was probably copied from the wrong place.
  const oddKey = host === "api.abliteration.ai" && !apiKey.startsWith("ak_");
  steps.push({
    id: "settings",
    ok: oddKey ? null : true,
    title: "settings",
    detail: safe(
      `Sending key ${maskKey(apiKey)} to ${host}, model ${model}.${
        oddKey
          ? " Keys from abliteration.ai start with ak_ and this one does not, so it may not be the API key."
          : ""
      }`,
    ),
  });

  const call = async (url: string, init: RequestInit): Promise<Response | null> => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return null;
    }
  };
  const unreachable = `Could not reach ${host}. Check your connection and the API base URL.`;

  // 1. The key, by way of the model list: a request that costs nothing.
  const listed = await call(`${base}/models`, {
    method: "GET",
    headers: { ...authHeaders(apiKey), Accept: "application/json" },
  });
  if (!listed) {
    steps.push({ id: "key", ok: false, title: "connection", detail: unreachable });
    return report();
  }
  let offered: string[] | null = null;
  if (listed.ok) {
    try {
      offered = modelIds(await listed.json());
    } catch {
      offered = null;
    }
    steps.push({
      id: "key",
      ok: offered ? true : null,
      title: "key",
      detail: offered
        ? "The provider accepted the key."
        : "The provider answered, but not with a model list. The base URL may be wrong.",
    });
  } else if (listed.status === 401) {
    steps.push({
      id: "key",
      ok: false,
      title: "key",
      detail: safe(
        `${new ProviderAuthError(401, await readFailure(listed, apiKey)).message} Make sure the whole key was copied, with nothing before or after it. If the key was deleted or regenerated in the provider's console, the old one stops working.`,
      ),
    });
    return report();
  } else {
    // Not every provider offers a model list. The test message below settles it.
    await listed.body?.cancel().catch(() => {});
    steps.push({
      id: "key",
      ok: null,
      title: "key",
      detail: `The model list is not available here (${listed.status}), so the key is tested with a message instead.`,
    });
  }

  // 2. The model id, against what this key is offered.
  if (offered) {
    const has = offered.includes(model);
    const shown = offered.slice(0, 12).join(", ");
    steps.push({
      id: "model",
      ok: has,
      title: "model",
      detail: has
        ? `${model} is available to this key.`
        : safe(
            `"${model}" is not a model this key can use.${
              shown ? ` Available: ${shown}${offered.length > 12 ? ", …" : ""}.` : ""
            }`,
          ),
    });
  }

  // 3. One tiny real message: the only proof that key, credits and model work together.
  const sent = await call(chatUrl, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      max_tokens: 64,
      stream: false,
    }),
  });
  if (!sent) {
    steps.push({ id: "reply", ok: false, title: "test message", detail: unreachable });
    return report();
  }
  if (!sent.ok) {
    steps.push({
      id: "reply",
      ok: false,
      title: "test message",
      detail: safe(httpError(sent.status, await readFailure(sent, apiKey)).message),
    });
    return report();
  }
  let failure = "";
  try {
    const payload: unknown = await sent.json();
    if ((payload as { error?: unknown } | null)?.error) {
      failure = errorDetail(payload) || "the provider reported an error";
    }
  } catch {
    // A 200 that is not JSON is not a chat API.
    failure = "the reply was not an API response. Check the API base URL";
  }
  steps.push(
    failure
      ? {
          id: "reply",
          ok: false,
          title: "test message",
          detail: safe(new ProviderHTTPError(sent.status, clip(failure)).message),
        }
      : {
          id: "reply",
          ok: true,
          title: "test message",
          detail: steps.some((step) => step.id === "model" && step.ok === false)
            ? "A test message went through all the same, so the provider does accept this model id."
            : "A test message went through. Key, credits and model all work.",
        },
  );
  return report();
}
