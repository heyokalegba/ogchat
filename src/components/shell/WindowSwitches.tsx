"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./backdrop.module.css";

/**
 * The windows where somebody turns a light on, or off, as the evening goes.
 *
 * One window changes at a time, and not often: every half minute or so one
 * of them comes on or goes off, chosen at random, the rest left as they were.
 * As the night gets late more go off than come on, until only a few are left.
 * Nothing blinks and nothing moves together. With motion off, the windows
 * simply stay as they are.
 */

export interface SwitchWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** About this share of the switching windows is lit at any one time of an evening. */
const LIT_SHARE = 0.4;
/** How much of that is left in the small hours. */
const LATE_LEFT = 0.25;
/** Seconds between one window changing and the next: this long at least, and up to this much more. */
const PAUSE = { least: 20, more: 40 };

export function WindowSwitches(props: {
  windows: readonly SwitchWindow[];
  /** How strongly the lit windows show: faint by day, full at night. */
  strength: number;
  still: boolean;
  /** How far into the night it is, 0 an evening to 1 the small hours: fewer are lit. */
  late?: number;
}) {
  const { windows, strength, still } = props;
  // The share lit just now, for the next change to lean towards.
  const share = useRef(LIT_SHARE);
  useEffect(() => {
    share.current = LIT_SHARE * (1 - (1 - LATE_LEFT) * Math.min(1, Math.max(0, props.late ?? 0)));
  }, [props.late]);
  // Which windows are lit. Nothing until the page is live, so server and browser agree.
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const start = new Set<number>();
    windows.forEach((_, index) => {
      if (Math.random() < share.current) start.add(index);
    });
    setLit(start);
  }, [windows]);

  useEffect(() => {
    if (still || windows.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => (PAUSE.least + Math.random() * PAUSE.more) * 1000;
    const flip = () => {
      timer = setTimeout(flip, wait());
      if (document.hidden) return;
      setLit((current) => {
        // Lean back toward the usual share, so the street neither fills up nor goes dark.
        const turnOn = Math.random() < (current.size < windows.length * share.current ? 0.7 : 0.3);
        const candidates = windows
          .map((_, index) => index)
          .filter((index) => current.has(index) !== turnOn);
        if (candidates.length === 0) return current;
        const index = candidates[Math.floor(Math.random() * candidates.length)]!;
        const next = new Set(current);
        if (turnOn) next.add(index);
        else next.delete(index);
        return next;
      });
    };
    timer = setTimeout(flip, wait());
    return () => clearTimeout(timer);
  }, [windows, still]);

  const px = (n: number) => `calc(var(--u) * ${n})`;
  return (
    <div className={styles.switches} style={{ opacity: strength }}>
      {[...lit].map((index) => {
        const w = windows[index];
        return (
          w && (
            <span
              key={index}
              className={styles.switchOn}
              style={{
                left: px(w.x),
                top: px(w.y),
                width: px(w.w),
                height: px(w.h),
                background: w.color,
              }}
            />
          )
        );
      })}
    </div>
  );
}
