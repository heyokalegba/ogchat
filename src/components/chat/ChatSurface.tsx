"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createApi } from "@/lib/client/api";
import { describeRanOn, effortFacts, effortName, modelName, paidByOf } from "@/lib/models";
import type {
  Attachment,
  ChatMessage,
  CodeSignIn,
  ModelChoice,
  ProviderChoice,
  ReasoningEffort,
  SessionMeta,
  SessionModel,
  SessionWork,
} from "@/lib/types";
import { BootLine } from "./BootLine";
import styles from "./chat.module.css";
import { Composer } from "./Composer";
import { ContextMeter, SummaryMark } from "./ContextMeter";
import { copyText } from "./Markdown";
import { MessageView, StreamingMessage } from "./Message";
import "./theme.css";
import { useChat } from "./useChat";
import { Elapsed } from "./Elapsed";
import { FileViewer, type Viewing } from "./FileViewer";

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
  /**
   * The models this chat can be set to, the one it is set to, and what to do
   * when another is picked. With these the model's name under the message box
   * becomes a picker.
   */
  models?: ModelChoice[];
  model?: SessionModel | null;
  onModelChange?: (model: SessionModel) => void;
  /** How Claude Code is signed in, so the picker can say what a chat on it is paid for with. */
  codeSignIn?: CodeSignIn | null;
  /** For a conversation not yet saved: the model it starts with, if not the one in settings. */
  startModel?: SessionModel | null;
  /** Likewise the thinking level a conversation not yet saved starts with. */
  startReasoning?: ReasoningEffort | null;
  /** Likewise where it works: repository, branch, environment. */
  startWork?: Partial<SessionWork> | null;
  /** Shown just above the message box: the shell puts the repository and environment pickers here. */
  above?: ReactNode;
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

const keyOf = (m: SessionModel) => `${m.provider}:${m.model}`;

/** The ways to a model, in the order the picker lists them, and what each is headed. */
const PICKER_GROUPS: readonly ProviderChoice[] = ["claudecode", "claude", "compatible"];
function groupLabel(provider: ProviderChoice, signIn: CodeSignIn | null): string {
  if (provider === "compatible") return "Other provider";
  const paidBy = paidByOf(provider, signIn);
  const name = provider === "claude" ? "Claude API" : "Claude Code";
  return paidBy === "plan"
    ? `${name} · uses your plan`
    : paidBy === "api"
      ? `${name} · uses API tokens`
      : name;
}

/**
 * The model's name, as a list to pick another from. Models whose provider has
 * no key are left out. They are listed under the way each is reached, which
 * says what it is paid for with: a plan's usage, or API tokens.
 */
function ModelPicker(props: {
  models: ModelChoice[];
  model: SessionModel;
  signIn: CodeSignIn | null;
  onChange: (model: SessionModel) => void;
}) {
  const { models, model } = props;
  const usable = models.filter((m) => m.ready || keyOf(m) === keyOf(model));
  const listed = usable.some((m) => keyOf(m) === keyOf(model))
    ? usable
    : [{ ...model, label: model.model, ready: true }, ...usable];
  return (
    <select
      className={styles.modelPicker}
      value={keyOf(model)}
      aria-label="Model for this chat"
      title="The model this chat uses, and what it is paid for with. Each chat keeps its own."
      onChange={(event) => {
        const picked = listed.find((m) => keyOf(m) === event.target.value);
        if (picked) props.onChange({ provider: picked.provider, model: picked.model });
      }}
    >
      {PICKER_GROUPS.filter((provider) => listed.some((m) => m.provider === provider)).map(
        (provider) => (
          <optgroup key={provider} label={groupLabel(provider, props.signIn)}>
            {listed
              .filter((m) => m.provider === provider)
              .map((m) => (
                <option key={keyOf(m)} value={keyOf(m)}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        ),
      )}
    </select>
  );
}

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
    model: props.startModel,
    startReasoning: props.startReasoning,
    startWork: props.startWork,
    onSessionCreated: props.onSessionCreated,
    onSessionUpdated: props.onSessionUpdated,
    onSessionMissing: props.onSessionMissing,
  });
  const { messages, phase, streamText, thinking, thinkingText, error, openCount } = chat;
  // What the thinking list knows about this chat's model: its default and recommended levels.
  const facts = props.model ? effortFacts(props.model.provider, props.model.model) : null;
  const autoMeans =
    props.model?.provider === "claudecode"
      ? "Claude Code's own default applies"
      : facts && props.model
        ? `${modelName(props.model.model).replace(/^Claude /, "")} runs at ${effortName(facts.default)}`
        : null;

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

  // A file opened over the chat: one waiting in the message box, or one already sent.
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const openPending = useCallback((file: File) => setViewing({ kind: "pending", file }), []);
  const openSent = useCallback(
    (attachment: Attachment, url: string) => setViewing({ kind: "sent", attachment, url }),
    [],
  );
  const closeViewer = useCallback(() => {
    setViewing(null);
    inputRef.current?.focus();
  }, []);
  // A waiting file that has gone (sent, removed, another chat opened) takes its viewer with it.
  const viewed =
    viewing && (viewing.kind === "sent" || chat.files.includes(viewing.file)) ? viewing : null;
  const stick = useRef(true);

  const busy = phase === "streaming" || phase === "following";
  // Compressing waits on the model like a reply does: nothing else can be sent meanwhile.
  const idle = phase === "idle" && !chat.compressing;
  const lastMessage = messages.at(-1);
  const lastUserId = useMemo(
    () => messages.findLast((m) => m.role === "user")?.id ?? null,
    [messages],
  );
  const pending = lastMessage?.id.startsWith("pending-") ?? false;
  const unanswered = idle && !error && !pending && lastMessage?.role === "user";
  const empty = messages.length === 0 && !busy && phase !== "loading";
  // How many messages have been said since the conversation was last compressed.
  const summaryAt = chat.summary ? messages.findIndex((m) => m.id === chat.summary?.upTo) : -1;
  const sinceSummary = messages.length - (summaryAt + 1);

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
                <Fragment key={message.id}>
                  <MessageView
                    message={message}
                    canEdit={
                      idle && message.id === lastUserId && !message.id.startsWith("pending-")
                    }
                    canRegenerate={idle && message === lastMessage && message.role === "assistant"}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRegenerate={regenerate}
                    canReplay={
                      idle && message.role === "user" && !message.id.startsWith("pending-")
                    }
                    onReplay={onReplay}
                    fileUrl={chat.fileUrl}
                    onOpenFile={openSent}
                  />
                  {chat.summary?.upTo === message.id && (
                    <SummaryMark
                      summary={chat.summary}
                      canUndo={idle}
                      onUndo={() => void chat.compress(true)}
                    />
                  )}
                </Fragment>
              ))}
              {busy && (
                <StreamingMessage
                  text={streamText}
                  thinking={thinking}
                  thought={thinkingText}
                  ranOn={chat.ranOn}
                  startedAt={chat.startedAt}
                />
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

      {chat.queued.length > 0 && (
        <div className={styles.queue} role="list" aria-label="Queued messages">
          {chat.queued.map((item) => (
            <div key={item.id} className={styles.queueItem} role="listitem">
              <span className={`${styles.tag} ${styles.tagUser}`}>
                {chat.queuePaused ? "held" : "queued"}&gt;
              </span>
              <span className={styles.queueText} title={item.content}>
                {item.content || item.files.map((file) => file.name).join(", ")}
              </span>
              {item.files.length > 0 && item.content && (
                <span className={styles.queueMeta}>
                  +{item.files.length} file{item.files.length === 1 ? "" : "s"}
                </span>
              )}
              {idle && chat.queuePaused && (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => chat.sendQueued(item.id)}
                >
                  send now
                </button>
              )}
              <button
                type="button"
                className={styles.action}
                title="Take it out of the queue and back into the message box"
                onClick={() => {
                  chat.unqueue(item.id, true);
                  inputRef.current?.focus();
                }}
              >
                edit
              </button>
              <button
                type="button"
                className={styles.action}
                onClick={() => chat.unqueue(item.id, false)}
              >
                remove
              </button>
            </div>
          ))}
          <p className={styles.queueNote}>
            {chat.queuePaused
              ? "Held, because the last reply was stopped or did not finish. Send one to carry on."
              : "Sent one at a time, each when the reply before it is done."}
          </p>
        </div>
      )}
      {props.above}
      <Composer
        value={chat.draft}
        onChange={chat.setDraft}
        onSubmit={onSubmit}
        onStop={onStop}
        busy={busy}
        canSend={idle}
        canQueue={busy}
        inputRef={inputRef}
        files={chat.files}
        onAddFiles={chat.addFiles}
        onRemoveFile={chat.removeFile}
        onOpenFile={openPending}
        web={chat.web}
        onToggleWeb={() => chat.setWeb(!chat.web)}
        reasoning={props.reasoning}
        onReasoningChange={props.onReasoningChange}
        recommendedReasoning={facts?.recommended ?? null}
        autoMeans={autoMeans}
        footer={
          <div className={styles.hints}>
            <span className={styles.hintKeys}>
              {busy
                ? "enter to queue a message · esc to stop"
                : "enter to send · shift+enter for a newline"}
            </span>
            {chat.context && messages.length > 0 && (
              <ContextMeter
                use={chat.context}
                compressing={chat.compressing}
                canCompress={idle && sinceSummary >= 2}
                onCompress={() => void chat.compress()}
                onStop={chat.stopCompress}
              />
            )}
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
                  {busy || !props.models || !props.model || !props.onModelChange ? (
                    <span className={styles.statusLabel}>
                      {busy ? (
                        <>
                          {chat.ranOn
                            ? `generating · ${describeRanOn(chat.ranOn).short}`
                            : "generating"}
                          {chat.startedAt ? (
                            <>
                              {" · "}
                              <Elapsed since={chat.startedAt} />
                            </>
                          ) : null}
                        </>
                      ) : (
                        modelName(provider.model)
                      )}
                    </span>
                  ) : (
                    <ModelPicker
                      models={props.models}
                      model={props.model}
                      signIn={props.codeSignIn ?? null}
                      onChange={props.onModelChange}
                    />
                  )}
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
      {viewed && (
        <FileViewer
          viewing={viewed}
          onSave={(file, next) => {
            chat.replaceFile(file, next);
            closeViewer();
          }}
          onRemove={(file) => {
            chat.removeFile(chat.files.indexOf(file));
            closeViewer();
          }}
          onClose={closeViewer}
        />
      )}
    </section>
  );
}
