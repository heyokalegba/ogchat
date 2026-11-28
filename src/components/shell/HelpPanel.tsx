"use client";

import { Fragment, useEffect, useRef } from "react";
import { HELP_TOPICS, helpPieces } from "@/lib/help";
import { CloseIcon } from "../chat/icons";
import styles from "./shell.module.css";

export interface HelpPanelProps {
  /** What the chat on screen is paid for with right now, in a sentence, if it is known. */
  paidNow: string | null;
  /** The Claude account in use, when there is more than one to tell apart. */
  accountNow: string | null;
  onClose: () => void;
  /** Go to settings from a topic that is set there. */
  onOpenSettings: () => void;
}

/** A line of the help, with the words that are on the screen set apart. */
function Line({ text }: { text: string }) {
  return (
    <>
      {helpPieces(text).map((piece, at) =>
        at % 2 ? <code key={at}>{piece}</code> : <Fragment key={at}>{piece}</Fragment>,
      )}
    </>
  );
}

/**
 * Help: where things are in the window and how to use them. It opens from the
 * foot of the chat list, from the top of a chat, and from settings, where it
 * lies over the settings without closing them.
 */
export function HelpPanel({ paidNow, accountNow, onClose, onOpenSettings }: HelpPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Help may lie over settings: Escape closes help, and only help.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      event.stopPropagation();
      // Keep focus inside the dialog.
      const focusable = panel.current.querySelectorAll<HTMLElement>("button:not(:disabled)");
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      const inside = panel.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === firstEl || !inside)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && (document.activeElement === lastEl || !inside)) {
        event.preventDefault();
        firstEl.focus();
      }
    };
    // Ahead of the other panels' own listeners, so they do not act on the same key.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const jump = (id: string) =>
    panel.current
      ?.querySelector(`[data-topic="${id}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });

  return (
    <div
      className={`ogchat ${styles.overlay}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`${styles.panel} ${styles.helpPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ogchat-help-title"
      >
        <div className={styles.panelHead}>
          <h2 id="ogchat-help-title" className={styles.panelTitle}>
            help
          </h2>
          <button
            ref={close}
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close help"
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.panelBody}>
          <p className={styles.help}>
            Where things are in this window, and how to use them. Words <code>like this</code> are
            written on the screen as they are here.
          </p>
          <div className={styles.helpJump} role="group" aria-label="Topics">
            {HELP_TOPICS.map((topic) => (
              <button
                key={topic.id}
                type="button"
                className={styles.helpChip}
                onClick={() => jump(topic.id)}
              >
                {topic.short}
              </button>
            ))}
          </div>

          {HELP_TOPICS.map((topic) => (
            <section
              key={topic.id}
              className={styles.helpTopic}
              data-topic={topic.id}
              aria-labelledby={`ogchat-help-${topic.id}`}
            >
              <h3 id={`ogchat-help-${topic.id}`} className={styles.helpTitle}>
                {topic.title}
              </h3>
              <p className={styles.helpWhere}>
                <span className={styles.label}>where</span> <Line text={topic.where} />
              </p>
              {topic.id === "paid" && paidNow && (
                <p className={styles.helpNow}>
                  <span className={styles.label}>right now</span> {paidNow}
                </p>
              )}
              {topic.id === "accounts" && accountNow && (
                <p className={styles.helpNow}>
                  <span className={styles.label}>right now</span> Claude chats run on the account
                  called <code>{accountNow}</code>.
                </p>
              )}
              <ul className={styles.helpPoints}>
                {topic.points.map((point) => (
                  <li key={point}>
                    <Line text={point} />
                  </li>
                ))}
              </ul>
              {topic.settings && (
                <div className={styles.helpGo}>
                  <button type="button" className={styles.button} onClick={onOpenSettings}>
                    open settings
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
