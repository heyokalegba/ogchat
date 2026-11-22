import Anthropic from "@anthropic-ai/sdk";
import type { ProviderMessage } from "./adapter";
import {
  ProviderAbortedError,
  ProviderConfigError,
  ProviderEmptyReplyError,
  ProviderError,
} from "./errors";
import { redactSecret } from "./redact";

/**
 * Claude, through Anthropic's own SDK and Messages API.
 *
 * This is the second way ogchat can talk to a model; the first is the
 * OpenAI-shaped adapter beside it. It yields the reply as text, hands
 * reasoning over separately, and, when it is given tools, runs them: Claude
 * asks for a tool, this calls it, sends back what it returned, and goes
 * round again until Claude has nothing more to ask for. That loop is how
 * Claude reads and changes a repository (see server/github.ts).
 *
 * Every failure is thrown as a ProviderError, the same as the other adapter,
 * so the chat shows it the same way. The key is never put in a message.
 */

/** Something Claude can call: what it is told about it, and what running it does. */
export interface ClaudeTool {
  definition: Anthropic.Beta.BetaTool;
  /**
   * Checks what Claude sent. Returns null if it is usable, or what is wrong
   * with it. Tool inputs are streamed as they are written and are not
   * checked by the API, so this is the only check there is.
   */
  check(input: unknown): string | null;
  run(input: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  /** A few words on what a call is doing, to show while it runs: "reading src/app.ts". */
  describe(input: Record<string, unknown>): string;
}

export interface ClaudeTurn {
  apiKey: string | null;
  model: string;
  /** The conversation as the other adapter takes it: a system message first, if any. */
  messages: ProviderMessage[];
  /** "low" | "medium" | "high" | "max", or null to leave it to the model. */
  effort?: string | null;
  /** Let Claude search the web (Anthropic runs the search and bills it). */
  webSearch?: boolean;
  tools?: ClaudeTool[];
  signal?: AbortSignal;
  onThinking?: (text: string) => void;
  /** For tests and proxies: another address for the API, and another fetch. */
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
}

/** Current Claude models, for the settings panel to offer. Any other id can be typed. */
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2" },
] as const;
const API = "https://api.anthropic.com";
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

/** Room for a long answer. Replies are streamed, so a large ceiling costs nothing by itself. */
const MAX_TOKENS = 64_000;
/** How many times Claude may go round asking for tools in one turn before it is stopped. */
const MAX_ROUNDS = 40;
/** These decline a request now and then; the API can hand a declined one to another model. */
const FALLBACK_MODELS = /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Splits a data: URL into what an image block wants. Null if it is not one. */
function imageSource(url: string): Anthropic.Beta.BetaBase64ImageSource | null {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(url);
  if (!match) return null;
  return {
    type: "base64",
    media_type: match[1] as Anthropic.Beta.BetaBase64ImageSource["media_type"],
    data: match[2]!,
  };
}

/** The conversation in the Messages API's shape: the system text apart, the rest as turns. */
export function toClaudeMessages(messages: ProviderMessage[]): {
  system: string;
  turns: Anthropic.Beta.BetaMessageParam[];
} {
  const system: string[] = [];
  const turns: Anthropic.Beta.BetaMessageParam[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      if (typeof message.content === "string") system.push(message.content);
      continue;
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (typeof message.content === "string") {
      if (message.content.trim()) content.push({ type: "text", text: message.content });
    } else {
      for (const part of message.content) {
        if (part.type === "text") content.push({ type: "text", text: part.text });
        else {
          const source = imageSource(part.image_url.url);
          if (source) content.push({ type: "image", source });
        }
      }
    }
    // The API takes no empty turn; a message that was only a file that has since gone says so.
    if (content.length === 0) content.push({ type: "text", text: "(empty message)" });
    const last = turns.at(-1);
    // Turns must take it in turns: two of the same in a row are one.
    if (last && last.role === message.role && Array.isArray(last.content)) {
      last.content.push(...content);
    } else {
      turns.push({ role: message.role, content });
    }
  }
  return { system: system.join("\n\n"), turns };
}

/** What went wrong, as the chat shows it. */
function failure(error: unknown, key: string): ProviderError {
  if (error instanceof ProviderError) return error;
  const detail = (text: string) => redactSecret(text, key).replace(/\s+/g, " ").slice(0, 300);
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderAbortedError();
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError(
      "invalid_key",
      "Anthropic did not accept that API key. Check the Claude key in settings: it starts with sk-ant- and comes from console.anthropic.com.",
      401,
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(
      "forbidden",
      `Anthropic refused this request for this key (${detail(error.message)}). The key's workspace may not have access to this model.`,
      403,
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError(
      "provider_error",
      "Anthropic does not know that model id. Pick one from the list in settings.",
      404,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError(
      "rate_limited",
      "Anthropic is rate-limiting this key. Wait a moment and retry.",
      429,
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    const text = detail(error.message);
    // Out of credit comes back as a bad request that says so.
    if (/credit balance/i.test(text)) {
      return new ProviderError(
        "no_credits",
        "Your Anthropic account is out of API credit. Add credit at console.anthropic.com, under Billing.",
        400,
      );
    }
    return new ProviderError("provider_error", `Anthropic turned the request down: ${text}`, 400);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError("network", "Could not reach Anthropic. Check your connection.");
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError(
      "provider_error",
      `Anthropic answered ${error.status ?? "with an error"}: ${detail(error.message)}`,
      error.status,
    );
  }
  return new ProviderError("network", "The reply from Anthropic was cut off. Retry in a moment.");
}

/**
 * Sends the conversation to Claude and yields the reply as it is written.
 * With tools, keeps going until Claude has finished using them.
 */
export async function* streamClaude(turn: ClaudeTurn): AsyncGenerator<string, void, void> {
  const key = turn.apiKey?.trim() ?? "";
  if (!key) throw new ProviderConfigError("No Claude API key is set. Open settings to add one.");
  if (!turn.model.trim())
    throw new ProviderConfigError("No Claude model is chosen. Open settings.");
  if (turn.signal?.aborted) throw new ProviderAbortedError();

  const client = new Anthropic({
    apiKey: key,
    // Said outright, so a stray ANTHROPIC_BASE_URL in the environment cannot send the key elsewhere.
    baseURL: turn.baseUrl || API,
    ...(turn.fetchImpl ? { fetch: turn.fetchImpl } : {}),
  });
  const { system, turns } = toClaudeMessages(turn.messages);
  const mine = turn.tools ?? [];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    // Inputs stream as they are written, so a file being sent does not look like a stall.
    ...mine.map((tool) => ({ ...tool.definition, eager_input_streaming: true })),
    ...(turn.webSearch
      ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 }]
      : []),
  ];
  // Claude Haiku 4.5 is the one current model that takes neither adaptive thinking nor effort.
  const old = /^claude-haiku-4/.test(turn.model);
  let fallback = FALLBACK_MODELS.test(turn.model);
  let wrote = false;
  let unparsed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      model: turn.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: turns,
      // The conversation so far is the same next time: let the API keep it warm.
      cache_control: { type: "ephemeral" },
      ...(system ? { system } : {}),
      ...(tools.length ? { tools } : {}),
      // Thinking is on for every current model; this asks to be shown a summary of it.
      ...(old ? {} : { thinking: { type: "adaptive", display: "summarized" } }),
      ...(turn.effort && !old
        ? { output_config: { effort: turn.effort as "low" | "medium" | "high" | "max" } }
        : {}),
      // If the model declines on policy grounds, the API may pass the request to another.
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    let message: Anthropic.Beta.BetaMessage;
    let said = "";
    try {
      const stream = client.beta.messages.stream(params, { signal: turn.signal });
      for await (const event of stream) {
        if (event.type !== "content_block_delta") continue;
        if (event.delta.type === "text_delta") {
          said += event.delta.text;
          yield event.delta.text;
        } else if (event.delta.type === "thinking_delta") {
          turn.onThinking?.(event.delta.thinking);
        }
      }
      message = await stream.finalMessage();
      unparsed = 0;
    } catch (error) {
      if (turn.signal?.aborted) throw new ProviderAbortedError();
      // The fallback is a beta: if this account or model will not take it, go without.
      if (fallback && !said && error instanceof Anthropic.BadRequestError) {
        fallback = false;
        round--;
        continue;
      }
      // A tool input that could not be read at all is asked for again, twice at most.
      if (!(error instanceof Anthropic.APIError) && !said && unparsed++ < 2) {
        round--;
        continue;
      }
      throw failure(error, key);
    }
    if (said) wrote = true;

    if (message.stop_reason === "refusal") {
      const why = message.stop_details?.explanation;
      if (!wrote) {
        throw new ProviderError(
          "provider_error",
          `Claude declined this request${why ? `: ${why}` : "."}`,
        );
      }
      return;
    }
    // A long web search can pause; sending the turn back lets it carry on.
    if (message.stop_reason === "pause_turn") {
      turns.push({
        role: "assistant",
        content: message.content as Anthropic.Beta.BetaContentBlockParam[],
      });
      continue;
    }
    const calls = message.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );
    if (calls.length === 0) {
      if (message.stop_reason === "max_tokens") {
        yield "\n\n*(The reply was cut off at its length limit. Ask it to continue.)*";
      }
      break;
    }
    if (message.stop_reason === "max_tokens") {
      // A tool call cut off part-way would run on half its input: it is not run.
      throw new ProviderError(
        "provider_error",
        "Claude ran out of room in the middle of a file. Ask for the change in smaller pieces.",
      );
    }

    turns.push({
      role: "assistant",
      content: message.content as Anthropic.Beta.BetaContentBlockParam[],
    });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const tool = mine.find((one) => one.definition.name === call.name);
      const problem = !tool ? `There is no tool called ${call.name}.` : tool.check(call.input);
      if (!tool || problem) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: problem ?? "Unknown tool.",
        });
        continue;
      }
      const input = call.input as Record<string, unknown>;
      turn.onThinking?.(`\n[${tool.describe(input)}]\n`);
      try {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: await tool.run(input, turn.signal),
        });
      } catch (error) {
        if (turn.signal?.aborted) throw new ProviderAbortedError();
        // What went wrong goes back to Claude, which can usually do something about it.
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: error instanceof Error ? error.message : "The tool failed.",
        });
      }
    }
    turns.push({ role: "user", content: results });
    if (said && !said.endsWith("\n")) yield "\n\n";
    if (round === MAX_ROUNDS - 1) {
      yield "\n\n*(Stopped after a great many steps. Say 'continue' to carry on.)*";
    }
  }
  if (!wrote) throw new ProviderEmptyReplyError();
}

/** Whether a key and a model id are good, without spending anything: asks about the model. */
export async function checkClaude(options: {
  apiKey: string | null;
  model: string;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; detail: string }> {
  const key = options.apiKey?.trim() ?? "";
  if (!key) return { ok: false, detail: "No Claude API key is set." };
  const client = new Anthropic({
    apiKey: key,
    maxRetries: 0,
    timeout: 20_000,
    baseURL: options.baseUrl || API,
    ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
  });
  try {
    const model = await client.models.retrieve(options.model);
    return { ok: true, detail: `${model.display_name} is available to this key.` };
  } catch (error) {
    return { ok: false, detail: failure(error, key).message };
  }
}
