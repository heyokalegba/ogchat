import { streamChat, type ProviderMessage } from "@/lib/provider/adapter";
import { streamClaude, type ClaudeTool } from "@/lib/provider/claude";
import type { ResolvedSettings } from "./settings";

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
  } = {},
): AsyncGenerator<string, void, void> {
  const effort = !options.reasoning || options.reasoning === "default" ? null : options.reasoning;
  if (settings.provider === "claude") {
    return streamClaude({
      apiKey: settings.claudeKey,
      model: settings.claudeModel,
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
