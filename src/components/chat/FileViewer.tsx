"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { editedFile, isOver, peekFile, type Peek } from "@/lib/client/peek";
import { formatBytes, MAX_TEXT_CHARS } from "@/lib/limits";
import type { Attachment } from "@/lib/types";
import styles from "./chat.module.css";
import { CloseIcon } from "./icons";
import { copyText } from "./Markdown";

/** What the viewer is showing: a file waiting in the message box, or one on a sent message. */
export type Viewing =
  { kind: "pending"; file: File } | { kind: "sent"; attachment: Attachment; url: string };

export interface FileViewerProps {
  viewing: Viewing;
  /** Puts the edited file in place of the one that was opened. */
  onSave: (file: File, next: File) => void;
  onRemove: (file: File) => void;
  onClose: () => void;
}

type Shown =
  | { state: "loading" }
  | { state: "failed"; message: string }
  | { state: "ready"; peek: Peek; imageUrl?: string };

const count = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/**
 * An attachment opened over the chat, in the chat's own paper and ink.
 * A file that has not been sent yet can be read and, when it is text, changed:
 * that is how a long paste is edited. A sent one is shown as it was sent.
 */
export function FileViewer({ viewing, onSave, onRemove, onClose }: FileViewerProps) {
  const [shown, setShown] = useState<Shown>({ state: "loading" });
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const pending = viewing.kind === "pending" ? viewing.file : null;
  const name = pending ? pending.name : viewing.kind === "sent" ? viewing.attachment.name : "";
  const size = pending ? pending.size : viewing.kind === "sent" ? viewing.attachment.size : 0;

  useEffect(() => {
    let gone = false;
    let imageUrl: string | undefined;
    const ready = (peek: Peek, body = "") => {
      if (gone) return;
      setText(body);
      setOriginal(body);
      setShown({ state: "ready", peek, imageUrl });
    };
    const failed = (message: string) => {
      if (!gone) setShown({ state: "failed", message });
    };

    if (viewing.kind === "pending") {
      peekFile(viewing.file)
        .then((peek) => {
          if (peek.kind === "image" && !gone) imageUrl = URL.createObjectURL(viewing.file);
          ready(peek, peek.kind === "text" ? peek.text : "");
        })
        .catch(() => failed("This file could not be read."));
    } else if (viewing.attachment.kind === "image") {
      imageUrl = viewing.url;
      ready({ kind: "image" });
    } else {
      fetch(viewing.url)
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const body = await res.text();
          ready({ kind: "text", text: body, editable: false, over: false }, body);
        })
        .catch(() => failed("This file could not be loaded."));
    }
    return () => {
      gone = true;
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [viewing]);

  const peek = shown.state === "ready" ? shown.peek : null;
  const editable = Boolean(pending) && peek?.kind === "text" && peek.editable;
  const dirty = editable && text !== original;
  const canSave = dirty && text.length > 0;

  // Closing with unsaved edits asks once before it throws them away.
  const close = () => {
    if (dirty && !confirming) return setConfirming(true);
    onClose();
  };
  const save = () => {
    if (pending && canSave) onSave(pending, editedFile(pending, text));
  };
  const closeRef = useRef(close);
  const saveRef = useRef(save);
  useEffect(() => {
    closeRef.current = close;
    saveRef.current = save;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Escape closes the viewer; it must not also stop a reply that is being written.
        event.stopPropagation();
        event.preventDefault();
        closeRef.current();
      } else if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "Enter")) {
        event.stopPropagation();
        event.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // The text takes the cursor when it can be edited; otherwise the close button does.
  const isReady = shown.state === "ready";
  useEffect(() => {
    if (editable) area.current?.focus();
    else closeButton.current?.focus();
  }, [isReady, editable]);

  /** Tab stays inside the viewer while it is open. */
  const onTab = (event: ReactKeyboardEvent) => {
    if (event.key !== "Tab") return;
    const stops = Array.from(
      panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea, a[href]") ??
        [],
    );
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sent = viewing.kind === "sent" ? viewing.attachment : null;
  const over = editable ? isOver(text) : peek?.kind === "text" && peek.over;
  const facts = [
    formatBytes(size),
    peek?.kind === "text" ? count(Array.from(text).length, "character") : null,
    peek?.kind === "text" ? count(text.length ? text.split("\n").length : 0, "line") : null,
    sent ? "sent" : editable ? "not sent yet: you can edit it" : "not sent yet",
  ].filter(Boolean);

  let note: string | null = null;
  if (confirming) note = "Unsaved edits. Save them, or close again to throw them away.";
  else if (editable && text.length === 0) note = "Nothing left in it. Remove it instead.";
  else if (over)
    note = `Only the first ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters are sent; the rest is cut off.`;
  else if (pending && peek?.kind === "text" && !peek.editable)
    note = "Too long to edit here. The beginning is shown.";
  else if (sent?.truncated)
    note = `This was cut off at ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters when it was sent.`;
  else if (sent && sent.mime === "application/pdf") note = "The text taken from this PDF.";

  return (
    <div
      className={styles.viewerScrim}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className={styles.viewer}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onKeyDown={onTab}
      >
        <header className={styles.viewerHead}>
          <div className={styles.viewerTitle}>
            <span className={styles.viewerName}>{name}</span>
            <span className={styles.viewerFacts}>{facts.join(" · ")}</span>
          </div>
          <button
            ref={closeButton}
            type="button"
            className={styles.viewerClose}
            onClick={close}
            aria-label="Close"
            title="Close (Esc)"
          >
            <CloseIcon />
          </button>
        </header>

        <div className={styles.viewerBody}>
          {shown.state === "loading" && <p className={styles.viewerNote}>opening…</p>}
          {shown.state === "failed" && <p className={styles.viewerNote}>{shown.message}</p>}
          {peek?.kind === "text" && (
            <textarea
              ref={area}
              className={styles.viewerText}
              value={text}
              readOnly={!editable}
              spellCheck={false}
              aria-label={editable ? `Edit ${name}` : `Contents of ${name}`}
              onChange={(event) => {
                setText(event.target.value);
                setConfirming(false);
              }}
            />
          )}
          {peek?.kind === "image" && shown.state === "ready" && shown.imageUrl && (
            <img className={styles.viewerImage} src={shown.imageUrl} alt={name} />
          )}
          {peek?.kind === "pdf" && (
            <p className={styles.viewerNote}>
              A PDF. Its text is taken out when the message is sent; open it here afterwards to read
              what the model was given.
            </p>
          )}
          {peek?.kind === "other" && (
            <p className={styles.viewerNote}>
              This is not text, a picture or a PDF, so it cannot be shown, and it will be refused
              when the message is sent.
            </p>
          )}
        </div>

        <footer className={styles.viewerFoot}>
          <span className={styles.viewerHint} role="status">
            {note}
          </span>
          {pending && (
            <button type="button" className={styles.button} onClick={() => onRemove(pending)}>
              remove
            </button>
          )}
          {sent && (
            <a
              className={styles.button}
              href={viewing.kind === "sent" ? viewing.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              open in a window
            </a>
          )}
          {peek?.kind === "text" && (
            <button type="button" className={styles.button} onClick={copy}>
              {copied ? "copied" : "copy"}
            </button>
          )}
          <button type="button" className={styles.button} onClick={close}>
            {confirming ? "discard edits" : dirty ? "cancel" : "close"}
          </button>
          {editable && (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonAccent}`}
              onClick={save}
              disabled={!canSave}
              title="Save (⌘S)"
            >
              save
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
