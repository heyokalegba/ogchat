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
  ProviderEmptyReplyError,
  ProviderError,
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
}

const DEFAULT_CONNECT_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 90_000;
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
        Authorization: `Bearer ${config.apiKey}`,
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
  if (status === 401 || status === 403) return new ProviderAuthError(status);
  if (status === 429) return new ProviderRateLimitError(detail);
  return new ProviderHTTPError(status, detail);
}

type SseResult = { done: true } | { done: false; text: string } | null;

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
  const text = (payload as { choices?: { delta?: { content?: unknown } }[] })?.choices?.[0]?.delta
    ?.content;
  return typeof text === "string" && text ? { done: false, text } : null;
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
      throw new ProviderEmptyReplyError();
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
