"use client";

import { useEffect, useState } from "react";
import type { ContextUse, SessionSummary } from "@/lib/types";
import styles from "./chat.module.css";
import { Markdown } from "./Markdown";

/** "812", "48k", "1.2M": a count of tokens, short enough for a footer. */
export function shortTokens(tokens: number): string {
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) {
    const k = tokens / 1_000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  return `${(tokens / 1_000_000).toFixed(tokens < 10_000_000 ? 1 : 0).replace(/\.0$/, "")}M`;
}

/** How pressing it is to compress, from how full the window is. */
export function contextLevel(use: ContextUse): "fine" | "soon" | "now" | "full" {
  const share = use.limit > 0 ? use.tokens / use.limit : 0;
  if (share >= 1) return "full";
  if (share >= 0.9) return "now";
  if (share >= 0.7) return "soon";
  return "fine";
}

const ADVICE = {
  fine: "",
  soon: "compress soon",
  now: "compress now",
  full: "full: compress to continue",
} as const;

/**
 * The context meter under the message box: how much of the model's context
 * window this conversation takes up, a word of advice once it is getting
 * full, and the button that compresses it.
 *
 * The count is an estimate from the length of the text. It is near enough
 * to say when to compress, not exact enough to bill by.
 */
export function ContextMeter(props: {
  use: ContextUse;
  compressing: boolean;
  /** Whether compressing is possible right now: idle, and enough said to be worth it. */
  canCompress: boolean;
  onCompress: () => void;
  /** Gives up on a summary that is being written. */
  onStop?: () => void;
}) {
  const { use, compressing, canCompress, onCompress } = props;
  // How long the summary has been in the writing, so that a long wait does not look like a stall.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!compressing) return;
    setWaited(0);
    const began = Date.now();
    const timer = setInterval(() => setWaited(Math.round((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [compressing]);
  const level = contextLevel(use);
  const share = use.limit > 0 ? use.tokens / use.limit : 0;
  const percent = share > 0 && share < 0.01 ? "<1" : String(Math.min(999, Math.round(share * 100)));
  return (
    <span className={`${styles.status} ${styles.meter}`} data-level={level}>
      <span
        className={styles.meterText}
        title={`About ${use.tokens.toLocaleString("en-US")} of ${use.limit.toLocaleString("en-US")} tokens: what would be sent with your next message, estimated from the length of the text. The window's size is set in settings.`}
      >
        context {percent}%
        <span className={styles.meterBar} aria-hidden="true">
          <span className={styles.meterFill} style={{ width: `${Math.min(100, share * 100)}%` }} />
        </span>
        <span className={styles.meterCount}>
          {shortTokens(use.tokens)} / {shortTokens(use.limit)}
        </span>
        {ADVICE[level] && <span className={styles.meterAdvice}>{ADVICE[level]}</span>}
      </span>
      {compressing && props.onStop ? (
        <button
          type="button"
          className={styles.meterButton}
          onClick={props.onStop}
          title="The model is reading the whole conversation and writing a summary of it, which on a long one can take a minute or more. Press to give up; nothing will have changed."
        >
          compressing {waited}s · stop
        </button>
      ) : (
        <button
          type="button"
          className={styles.meterButton}
          disabled={!canCompress || compressing}
          onClick={onCompress}
          title="Have the model write a summary of this conversation and carry on from that. It frees most of the context window; the messages stay here to read."
        >
          {compressing ? "compressing…" : "compress"}
        </button>
      )}
    </span>
  );
}

/**
 * The line in the transcript where a conversation was compressed: everything
 * above it is still there to read, but the model now works from a summary
 * of it. The summary can be read, and the compression undone.
 */
export function SummaryMark(props: {
  summary: SessionSummary;
  /** Undo is offered only while nothing else is going on. */
  canUndo: boolean;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.summaryMark} role="note">
      <div className={styles.summaryLine}>
        <span className={styles.summaryRule} aria-hidden="true" />
        <span className={styles.summaryLabel}>compressed to here</span>
        <button
          type="button"
          className={styles.summaryButton}
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? "hide summary" : "show summary"}
        </button>
        <button
          type="button"
          className={styles.summaryButton}
          disabled={!props.canUndo}
          onClick={props.onUndo}
          title="Drop the summary and send the whole conversation again"
        >
          undo
        </button>
        <span className={styles.summaryRule} aria-hidden="true" />
      </div>
      <p className={styles.summaryNote}>
        The model now works from a summary of everything above this line.
      </p>
      {open && (
        <div className={styles.summaryBody}>
          <Markdown content={props.summary.text} />
        </div>
      )}
    </div>
  );
}
