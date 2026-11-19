"use client";

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { PASTE_AS_FILE_CHARS } from "@/lib/limits";
import type { ReasoningEffort } from "@/lib/types";
import { PendingFiles } from "./Attachments";
import { BlockCaret } from "./BlockCaret";
import styles from "./chat.module.css";
import { GlobeIcon, PaperclipIcon, SendIcon, StopIcon } from "./icons";

/** The thinking levels the composer steps through. "low" is in settings for those who want it. */
const THINKING: ReasoningEffort[] = ["default", "medium", "high", "max"];
const THINKING_LABEL: Record<ReasoningEffort, string> = {
  default: "auto",
  low: "low",
  medium: "medium",
  high: "high",
  max: "max",
};

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
  /** Files queued to go out with the next message. */
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  /** Whether the next message may search the web. */
  web: boolean;
  onToggleWeb: () => void;
  /** How hard the model thinks. The control is left out when no handler is given. */
  reasoning?: ReasoningEffort;
  onReasoningChange?: (next: ReasoningEffort) => void;
  footer?: ReactNode;
}

/**
 * Enter sends, Shift+Enter inserts a newline, Escape stops a reply in progress.
 * Files are attached with the paperclip, by pasting, or by dropping them on the chat.
 * Pasting a lot of text attaches it as a text file rather than filling the box.
 * The globe lets the next message search the web; "think" sets how hard the
 * model reasons before it answers.
 */
export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, onStop, busy, canSend, inputRef, footer } = props;
  const { files, onAddFiles, onRemoveFile, web, onToggleWeb, onReasoningChange } = props;
  const reasoning = props.reasoning ?? "default";
  const ready = canSend && !busy && (value.trim().length > 0 || files.length > 0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
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

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length > 0) {
      event.preventDefault();
      onAddFiles(pasted);
      return;
    }
    // A long paste rides along as a text attachment and leaves the box clear to type in.
    const text = event.clipboardData.getData("text/plain");
    if (text.length <= PASTE_AS_FILE_CHARS) return;
    event.preventDefault();
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    const stamp = `${two(now.getHours())}.${two(now.getMinutes())}.${two(now.getSeconds())}`;
    onAddFiles([new File([text], `pasted text ${stamp}.txt`, { type: "text/plain" })]);
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.inputPanel}>
        <PendingFiles
          files={files}
          onRemove={(index) => {
            onRemoveFile(index);
            // The removed chip took focus with it; hand it back to the message box.
            textarea.current?.focus();
          }}
        />
        <div className={styles.inputRow}>
          <span className={styles.prompt} aria-hidden="true">
            &gt;
          </span>
          <textarea
            ref={textarea}
            className={styles.input}
            rows={1}
            value={value}
            aria-label="Message"
            autoComplete="off"
            spellCheck
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          <BlockCaret target={textarea} value={value} />
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            onChange={(event) => {
              onAddFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
              textarea.current?.focus();
            }}
          />
          {onReasoningChange && (
            <button
              type="button"
              className={`${styles.chip} ${reasoning === "default" ? "" : styles.chipOn}`}
              onClick={() => {
                const at = THINKING.indexOf(reasoning);
                onReasoningChange(THINKING[(at + 1) % THINKING.length]!);
              }}
              aria-label={`Thinking: ${THINKING_LABEL[reasoning]}. Press to change.`}
              title="How hard the model thinks before answering: auto, medium, high, max"
            >
              <span className={styles.chipPrefix}>think: </span>
              {THINKING_LABEL[reasoning]}
            </button>
          )}
          <button
            type="button"
            className={`${styles.attach} ${web ? styles.attachOn : ""}`}
            onClick={onToggleWeb}
            aria-pressed={web}
            aria-label="Search the web"
            title={
              web ? "Web search is on for the next message" : "Let the next message search the web"
            }
          >
            <GlobeIcon />
          </button>
          <button
            type="button"
            className={styles.attach}
            onClick={() => picker.current?.click()}
            aria-label="Attach files"
            title="Attach files: text, PDF or images"
          >
            <PaperclipIcon />
          </button>
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
      </div>
      {footer}
    </form>
  );
}
