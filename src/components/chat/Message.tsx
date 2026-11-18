"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { clockTime } from "@/lib/format";
import type { Attachment, ChatMessage } from "@/lib/types";
import { MessageAttachments } from "./Attachments";
import styles from "./chat.module.css";
import { CopyButton, Markdown } from "./Markdown";

export interface MessageViewProps {
  message: ChatMessage;
  /** Offer edit / delete (the last user message, while nothing is generating). */
  canEdit?: boolean;
  /** Offer retry (the last reply, while nothing is generating). */
  canRegenerate?: boolean;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onRegenerate?: () => void;
  /** Where to load an attachment from (thumbnails, "open file" links). */
  fileUrl: (attachment: Attachment) => string;
}

const CONFIRM_MS = 3000;

function TagRow({
  role,
  time,
  children,
}: {
  role: string;
  time: string;
  children?: React.ReactNode;
}) {
  const tone =
    role === "assistant"
      ? styles.tagAssistant
      : role === "user"
        ? styles.tagUser
        : styles.tagSystem;
  return (
    <div className={styles.tagRow}>
      <span className={`${styles.tag} ${tone}`}>{role}&gt;</span>
      {time && <time className={styles.time}>{time}</time>}
      {children}
    </div>
  );
}

function Editor(props: {
  initial: string;
  /** The message has files, so it may be saved with no text at all. */
  allowEmpty: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(props.initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (text.trim() || props.allowEmpty) props.onSave(text);
    }
  };

  return (
    <div className={styles.editor}>
      <textarea
        ref={ref}
        className={styles.editorInput}
        rows={1}
        value={text}
        aria-label="Edit message"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.editorActions}>
        <button type="button" className={styles.button} onClick={props.onCancel}>
          cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonAccent}`}
          disabled={!text.trim() && !props.allowEmpty}
          onClick={() => props.onSave(text)}
        >
          save &amp; send
        </button>
      </div>
    </div>
  );
}

/** One persisted message. User text is shown as written; replies render as markdown. */
export const MessageView = memo(function MessageView(props: MessageViewProps) {
  const { message, canEdit, canRegenerate, onEdit, onDelete, onRegenerate, fileUrl } = props;
  const attachments = message.attachments ?? [];
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isUser = message.role === "user";

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (isUser && editing && canEdit) {
    return (
      <article className={styles.message} data-role="user">
        <TagRow role="user" time={clockTime(message.createdAt)} />
        <MessageAttachments attachments={attachments} fileUrl={fileUrl} />
        <Editor
          initial={message.content}
          allowEmpty={attachments.length > 0}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            setEditing(false);
            if (text.trim() !== message.content) onEdit?.(message.id, text);
          }}
        />
      </article>
    );
  }

  return (
    <article className={styles.message} data-role={message.role}>
      <TagRow role={message.role} time={clockTime(message.createdAt)}>
        <div className={`${styles.actions} ${confirming ? styles.actionsPinned : ""}`}>
          {isUser && canEdit && (
            <>
              <button type="button" className={styles.action} onClick={() => setEditing(true)}>
                edit
              </button>
              <button
                type="button"
                className={`${styles.action} ${confirming ? styles.actionConfirm : ""}`}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true);
                    return;
                  }
                  setConfirming(false);
                  onDelete?.(message.id);
                }}
              >
                {confirming ? "confirm delete" : "delete"}
              </button>
            </>
          )}
          {!isUser && (
            <>
              <CopyButton text={message.content} label="reply" />
              {canRegenerate && (
                <button type="button" className={styles.action} onClick={onRegenerate}>
                  retry
                </button>
              )}
            </>
          )}
        </div>
      </TagRow>
      {isUser ? (
        <div className={styles.userPlate}>
          {message.content && (
            <div className={`${styles.body} ${styles.userBody}`}>{message.content}</div>
          )}
          <MessageAttachments attachments={attachments} fileUrl={fileUrl} />
        </div>
      ) : (
        <div className={styles.body}>
          <Markdown content={message.content} />
          {message.partial && <div className={styles.stoppedNote}>— stopped</div>}
        </div>
      )}
    </article>
  );
});

/** The reply while it streams in, with the blinking caret at its end. */
export function StreamingMessage({ text, thinking }: { text: string; thinking?: boolean }) {
  return (
    <article className={styles.message} data-role="assistant" aria-live="off">
      <TagRow role="assistant" time="" />
      <div className={`${styles.body} ${styles.streaming}`}>
        {text ? (
          <Markdown content={text} />
        ) : (
          <>
            {thinking && <span className={styles.thinkingNote}>thinking </span>}
            <span className={styles.caret} aria-label={thinking ? "Thinking" : "Generating"} />
          </>
        )}
      </div>
    </article>
  );
}
