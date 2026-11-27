"use client";

import { useEffect, useRef, useState } from "react";
import { EFFORT_BLURB, EFFORT_LEVELS, effortName } from "@/lib/models";
import type { ReasoningEffort } from "@/lib/types";
import styles from "./chat.module.css";

export interface ThinkingMenuProps {
  value: ReasoningEffort;
  onChange: (next: ReasoningEffort) => void;
  /** The level Claude's apps recommend for the chat's model, if it is one ogchat knows. */
  recommended?: ReasoningEffort | null;
  /** What Auto comes to for this model, such as "Opus 5.5 runs at medium". */
  autoMeans?: string | null;
}

/**
 * The thinking level, as Claude's own apps offer it: a button that opens a
 * list of Low, Medium, High, Extra and Max (with Auto first, which sends no
 * level), the model's recommended one marked, and a warning on Max.
 */
export function ThinkingMenu({ value, onChange, recommended, autoMeans }: ThinkingMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // The chosen level takes focus, so the arrow keys start from it.
    list.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closes the list; it must not also stop a reply that is being written.
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  /** Up and down move through the levels, wrapping round. */
  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

  const pick = (level: ReasoningEffort) => {
    onChange(level);
    setOpen(false);
    button.current?.focus();
  };

  const name = effortName(value);
  return (
    <span className={styles.thinkWrap} ref={root}>
      <button
        ref={button}
        type="button"
        className={`${styles.chip} ${value === "default" ? "" : styles.chipOn}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Thinking effort: ${name}. Press to change.`}
        title="Thinking effort: how hard the model thinks before it answers"
        onClick={() => setOpen((now) => !now)}
      >
        <span className={styles.chipPrefix}>think: </span>
        {name}
      </button>
      {open && (
        <div
          ref={list}
          className={styles.thinkMenu}
          role="menu"
          aria-label="Thinking effort"
          onKeyDown={onListKey}
        >
          <p className={styles.thinkBlurb}>{EFFORT_BLURB}</p>
          {EFFORT_LEVELS.map((level) => {
            const chosen = level.id === value;
            const hint =
              level.id === "default" && autoMeans ? `Sends no level: ${autoMeans}.` : level.hint;
            return (
              <button
                key={level.id}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                className={`${styles.thinkItem} ${chosen ? styles.thinkItemOn : ""}`}
                onClick={() => pick(level.id)}
              >
                <span className={styles.thinkMark} aria-hidden="true">
                  {chosen ? "●" : "○"}
                </span>
                <span className={styles.thinkText}>
                  <span className={styles.thinkName}>
                    {level.name}
                    {level.id === recommended && (
                      <span className={styles.thinkBadge}>Recommended</span>
                    )}
                  </span>
                  <span className={styles.thinkHint}>{hint}</span>
                  {level.warning && <span className={styles.thinkWarning}>{level.warning}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
