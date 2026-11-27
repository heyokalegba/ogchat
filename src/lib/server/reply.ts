import { streamChat, type ProviderMessage } from "@/lib/provider/adapter";
import { streamClaude, type ClaudeTool } from "@/lib/provider/claude";
import path from "node:path";
import { streamClaudeCode } from "./claudecode";
import { dataDir } from "./paths";
import { codeSetup, type ResolvedSettings } from "./settings";

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
  const effort = !options.reasoning || options.reasoning === "default" ? null : options.reasoning;
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
