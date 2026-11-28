/**
 * Public entry point of the chat surface. Import from here when embedding:
 *
 *   import { ChatSurface } from "@/components/chat";
 */
export { ClaudeAccounts } from "./accounts";
export { ChatSurface, type ChatSurfaceProps } from "./ChatSurface";
export { useChat, type ChatController, type ChatPhase } from "./useChat";
