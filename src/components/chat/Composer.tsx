"use client";

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import styles from "./chat.module.css";
import { SendIcon, StopIcon } from "./icons";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  /** A reply is being generated: the send button becomes a stop button. */
  busy: boolean;
  /** Sending is not possible right now (for example while the session loads). Typing still is. */
  canSend: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  footer?: ReactNode;
}

/** Enter sends, Shift+Enter inserts a newline, Escape stops a reply in progress. */
export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, onStop, busy, canSend, inputRef, footer } = props;
  const ready = canSend && !busy && value.trim().length > 0;
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(inputRef, () => textarea.current as HTMLTextAreaElement, []);

  // Grow with the text, up to the max-height set in CSS.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (ready) onSubmit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter while an input method is composing confirms the composition, not the message.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.inputPanel}>
        <span className={styles.prompt} aria-hidden="true">
          &gt;
        </span>
        <textarea
          ref={textarea}
          className={styles.input}
          rows={1}
          value={value}
          placeholder="Message"
          aria-label="Message"
          autoComplete="off"
          spellCheck
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button
            type="button"
            className={`${styles.send} ${styles.stop}`}
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop (Esc)"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            className={styles.send}
            disabled={!ready}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        )}
      </div>
      {footer}
    </form>
  );
}
