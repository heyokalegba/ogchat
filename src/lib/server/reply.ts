import { streamChat, type ProviderMessage } from "@/lib/provider/adapter";
import { streamClaude, type ClaudeTool } from "@/lib/provider/claude";
import path from "node:path";
import { codeSignIn, streamClaudeCode } from "./claudecode";
import { dataDir } from "./paths";
import { activeModel, codeSetup, type ResolvedSettings } from "./settings";
import { paidByOf } from "@/lib/models";
import type { RanOn } from "@/lib/types";

/**
 * The thinking level that is really sent for a turn, or null for none. Claude
 * Haiku 4.5 takes no effort at all, and the OpenAI shape has no "xhigh", so it
 * goes as "high" there.
 */
export function effortSent(settings: ResolvedSettings, reasoning?: string | null): string | null {
  if (!reasoning || reasoning === "default") return null;
  if (settings.provider === "claude" && /^claude-haiku-4/.test(settings.claudeModel)) return null;
  if (settings.provider === "compatible" && reasoning === "xhigh") return "high";
  return reasoning;
}

/** What a turn is about to be sent to, before the provider has said anything. */
export function ranOnFor(settings: ResolvedSettings, reasoning?: string | null): RanOn {
  const requested = activeModel(settings).model;
  const account =
    settings.provider === "compatible" ? null : settings.claudeAccountOn[settings.provider];
  // A plan's usage or API tokens: for Claude Code that is a matter of how it is signed in.
  const paidBy = paidByOf(
    settings.provider,
    settings.provider === "claudecode" ? codeSignIn(codeSetup(settings)) : null,
  );
  return {
    provider: settings.provider,
    requested,
    model: requested,
    effort: effortSent(settings, reasoning),
    ...(account ? { account } : {}),
    ...(paidBy ? { paidBy } : {}),
  };
}

/**
 * One reply from whichever provider is chosen in settings: any
 * OpenAI-shaped one, or Claude. Both yield the reply as text and hand
 * reasoning to `onThinking`; only Claude is given tools.
 */
export function streamReply(
  settings: ResolvedSettings,
  messages: ProviderMessage[],
  options: {
    signal?: AbortSignal;
    /** "default" leaves it to the provider. */
    reasoning?: string;
    webSearch?: boolean;
    onThinking?: (text: string) => void;
    /** Called with the model the provider says is answering, when it says. */
    onModel?: (id: string) => void;
    tools?: ClaudeTool[];
    /**
     * For Claude Code: the folder it works in, the session of its own to
     * carry on with, and what to do with that session's id. Without this it
     * answers once, in a scratch folder, and keeps no memory of it.
     */
    code?: {
      cwd: string;
      resume?: string | null;
      onSession?: (id: string) => void;
      vars?: Record<string, string>;
    };
  } = {},
): AsyncGenerator<string, void, void> {
  const effort = effortSent(settings, options.reasoning);
  if (settings.provider === "claudecode") {
    return streamClaudeCode({
      setup: codeSetup(settings),
      messages,
      model: settings.claudeCodeModel,
      effort,
      cwd: options.code?.cwd ?? path.join(dataDir(), "workspaces", "one-off"),
      resume: options.code?.resume,
      onSession: options.code?.onSession,
      vars: options.code?.vars,
      oneOff: !options.code,
      signal: options.signal,
      onThinking: options.onThinking,
      onModel: options.onModel,
    });
  }
  if (settings.provider === "claude") {
    return streamClaude({
      apiKey: settings.claudeKey,
      model: settings.claudeModel,
      workspace: settings.claudeWorkspace,
      messages,
      effort,
      webSearch: options.webSearch,
      tools: options.tools,
      signal: options.signal,
      onThinking: options.onThinking,
      onModel: options.onModel,
      // For trials against a stand-in, and for anyone who reaches Anthropic through a proxy.
      baseUrl: process.env.OGCHAT_ANTHROPIC_URL?.trim() || null,
    });
  }
  return streamChat({
    config: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
    messages,
    signal: options.signal,
    reasoningEffort: effort,
    webSearch: options.webSearch,
    onThinking: options.onThinking,
  });
}
