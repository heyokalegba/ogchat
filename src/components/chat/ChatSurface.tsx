"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { createApi } from "@/lib/client/api";
import type { ChatMessage, ReasoningEffort, SessionMeta } from "@/lib/types";
import { BootLine } from "./BootLine";
import styles from "./chat.module.css";
import { Composer } from "./Composer";
import { copyText } from "./Markdown";
import { MessageView, StreamingMessage } from "./Message";
import "./theme.css";
import { useChat } from "./useChat";

export interface ChatSurfaceProps {
  /** Session to show; null starts a new conversation that is saved on first send. */
  sessionId: string | null;
  /** Bump to re-open the current session (replays the boot line, refocuses the input). */
  openToken?: number;
  /** Where the ogchat API is mounted. */
  apiBase?: string;
  /** Provider status for the status line and the empty state; null while unknown. */
  provider?: { ready: boolean; model: string } | null;
  /** The project a new conversation here is filed under, if any. */
  projectId?: string | null;
  /** How hard the model thinks, and what to do when the composer changes it. */
  reasoning?: ReasoningEffort;
  onReasoningChange?: (next: ReasoningEffort) => void;
  onSessionCreated?: (session: SessionMeta) => void;
  onSessionUpdated?: (session: SessionMeta) => void;
  /** The requested session no longer exists. */
  onSessionMissing?: (sessionId: string) => void;
  onOpenSettings?: () => void;
  className?: string;
}

const STICK_PX = 96;

/**
 * The chat surface: transcript and composer for one session.
 *
 * It is independent of the app shell. It needs only the ogchat API (apiBase)
 * and a parent that gives it a height, so it can be dropped into another
 * layout or app as a component.
 */
export function ChatSurface(props: ChatSurfaceProps) {
  const {
    sessionId,
    openToken,
    apiBase = "/api",
    provider = null,
    onOpenSettings,
    className,
  } = props;
  const api = useMemo(() => createApi(apiBase), [apiBase]);
  const chat = useChat({
    sessionId,
    openToken,
    api,
    projectId: props.projectId,
    onSessionCreated: props.onSessionCreated,
    onSessionUpdated: props.onSessionUpdated,
    onSessionMissing: props.onSessionMissing,
  });
  const { messages, phase, streamText, thinking, thinkingText, error, openCount } = chat;

  // Dragging files over the chat: enter/leave fire for every child, so count them.
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    chat.addFiles(Array.from(event.dataTransfer.files));
    inputRef.current?.focus();
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const busy = phase === "streaming" || phase === "following";
  const idle = phase === "idle";
  const lastMessage = messages.at(-1);
  const lastUserId = useMemo(
    () => messages.findLast((m) => m.role === "user")?.id ?? null,
    [messages],
  );
  const pending = lastMessage?.id.startsWith("pending-") ?? false;
  const unanswered = idle && !error && !pending && lastMessage?.role === "user";
  const empty = messages.length === 0 && !busy && phase !== "loading";

  // Opening a session: pin to the bottom and put the cursor in the composer.
  useEffect(() => {
    stick.current = true;
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [openCount]);

  // Follow new content, unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinkingText, error, phase]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  }, []);

  const { send, editAndResend, deleteMessage, regenerate, replay, retry, stop } = chat;
  const onReplay = useCallback(
    (message: ChatMessage) => {
      stick.current = true;
      replay(message);
    },
    [replay],
  );
  /** The whole conversation as plain markdown, for pasting somewhere else. */
  const [chatCopied, setChatCopied] = useState(false);
  const copyChat = useCallback(async () => {
    const transcript = messages
      .map((m) => {
        const files = m.attachments?.length
          ? `\n\n(attached: ${m.attachments.map((a) => a.name).join(", ")})`
          : "";
        return `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}${files}`;
      })
      .join("\n\n");
    if (!(await copyText(transcript))) return;
    setChatCopied(true);
    setTimeout(() => setChatCopied(false), 1500);
  }, [messages]);
  const onSubmit = useCallback(
    (text: string) => {
      stick.current = true;
      send(text);
    },
    [send],
  );
  const onEdit = useCallback(
    (messageId: string, text: string) => {
      stick.current = true;
      editAndResend(messageId, text);
    },
    [editAndResend],
  );
  const onDelete = useCallback(
    (messageId: string) => void deleteMessage(messageId),
    [deleteMessage],
  );
  const onStop = useCallback(() => void stop(), [stop]);
  // Notice buttons disappear when pressed; keep the keyboard in the message box.
  const { dismissError } = chat;
  const onRetry = useCallback(() => {
    retry();
    inputRef.current?.focus();
  }, [retry]);
  const onDismiss = useCallback(() => {
    dismissError();
    inputRef.current?.focus();
  }, [dismissError]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && busy) {
      event.preventDefault();
      onStop();
    }
  };

  const bootText = chat.activeId
    ? `ogchat · session ${chat.activeId.slice(0, 8)} · ${messages.length} ${
        messages.length === 1 ? "message" : "messages"
      } in context · ready`
    : `ogchat · new session${provider?.model ? ` · ${provider.model}` : ""} · ready`;

  // Errors that are settled in the settings panel: the key, its credits or permissions, the model id.
  const needsKey =
    !!error &&
    (["not_configured", "invalid_key", "no_credits", "forbidden"].includes(error.code) ||
      error.status === 404);

  return (
    <section
      className={`ogchat ${styles.surface} ${className ?? ""}`}
      aria-label="Chat"
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropping && (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span className={styles.dropLabel}>drop files to attach</span>
        </div>
      )}
      <div className={styles.stage}>
        {phase !== "loading" && (
          <BootLine key={openCount} text={bootText} persist={messages.length === 0 && !busy} />
        )}
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          <div className={styles.column}>
            {phase === "loading" && <div className={styles.loading}>loading session…</div>}

            {empty && !error && (
              <div className={styles.empty}>
                <div className={styles.wordmark} aria-hidden="true">
                  ogchat
                  <span className={styles.wordmarkCaret} />
                </div>
                {provider && !provider.ready ? (
                  <>
                    <p className={styles.emptyText}>
                      No API key yet. Add your provider key to start chatting. It is stored only on
                      this machine.
                    </p>
                    {onOpenSettings && (
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonAccent}`}
                        onClick={onOpenSettings}
                      >
                        open settings
                      </button>
                    )}
                  </>
                ) : (
                  <p className={styles.emptyText}>
                    Ask anything. This conversation is saved locally and keeps its context.
                  </p>
                )}
              </div>
            )}

            <div className={styles.messages} role="log" aria-label="Conversation">
              {messages.map((message) => (
                <MessageView
                  key={message.id}
                  message={message}
                  canEdit={idle && message.id === lastUserId && !message.id.startsWith("pending-")}
                  canRegenerate={idle && message === lastMessage && message.role === "assistant"}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onRegenerate={regenerate}
                  canReplay={idle && message.role === "user" && !message.id.startsWith("pending-")}
                  onReplay={onReplay}
                  fileUrl={chat.fileUrl}
                />
              ))}
              {busy && (
                <StreamingMessage text={streamText} thinking={thinking} thought={thinkingText} />
              )}
            </div>

            {error && (
              <div className={styles.notice} role="alert">
                <div className={styles.tagRow}>
                  <span className={`${styles.tag} ${styles.tagError}`}>error&gt;</span>
                </div>
                <p className={styles.noticeText}>{error.message}</p>
                <div className={styles.noticeActions}>
                  {error.retry && (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonAccent}`}
                      onClick={onRetry}
                    >
                      retry
                    </button>
                  )}
                  {needsKey && onOpenSettings && (
                    <button type="button" className={styles.button} onClick={onOpenSettings}>
                      open settings
                    </button>
                  )}
                  {!error.retry && (
                    <button type="button" className={styles.button} onClick={onDismiss}>
                      dismiss
                    </button>
                  )}
                </div>
              </div>
            )}

            {unanswered && (
              <div className={`${styles.notice} ${styles.noticeQuiet}`}>
                <div className={styles.tagRow}>
                  <span className={`${styles.tag} ${styles.tagSystem}`}>system&gt;</span>
                </div>
                <p className={styles.noticeText}>No reply was recorded for this message.</p>
                <div className={styles.noticeActions}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonAccent}`}
                    onClick={onRetry}
                  >
                    retry
                  </button>
                </div>
              </div>
            )}

            <div className={styles.bottom} />
          </div>
        </div>
      </div>

      <Composer
        value={chat.draft}
        onChange={chat.setDraft}
        onSubmit={onSubmit}
        onStop={onStop}
        busy={busy}
        canSend={idle}
        inputRef={inputRef}
        files={chat.files}
        onAddFiles={chat.addFiles}
        onRemoveFile={chat.removeFile}
        web={chat.web}
        onToggleWeb={() => chat.setWeb(!chat.web)}
        reasoning={props.reasoning}
        onReasoningChange={props.onReasoningChange}
        footer={
          <div className={styles.hints}>
            <span className={styles.hintKeys}>
              {busy ? "esc to stop" : "enter to send · shift+enter for a newline"}
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                className={`${styles.status} ${styles.statusButton} ${styles.copyChat}`}
                onClick={copyChat}
                title="Copy the whole conversation"
              >
                {chatCopied ? "copied" : "copy chat"}
              </button>
            )}
            {provider &&
              (provider.ready ? (
                <span className={styles.status}>
                  <span className={`${styles.dot} ${busy ? styles.dotBusy : ""}`} />
                  <span className={styles.statusLabel}>{busy ? "generating" : provider.model}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className={`${styles.status} ${styles.statusButton}`}
                  onClick={onOpenSettings}
                >
                  <span className={`${styles.dot} ${styles.dotOff}`} />
                  <span className={styles.statusLabel}>no api key</span>
                </button>
              ))}
          </div>
        }
      />
    </section>
  );
}
