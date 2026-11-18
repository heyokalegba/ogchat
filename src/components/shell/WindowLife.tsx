"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SCENES, SKY, type SceneId, type SkyState } from "./art";
import styles from "./backdrop.module.css";

/**
 * Life behind the lit windows: now and then somebody crosses a room or
 * comes to look out, a cat settles on a sill, a dog gets its paws up. Only
 * ever a few at once, only in windows that are lit at this hour, each one a
 * dark shape that a CSS animation moves and then removes.
 */

type Kind = "pass" | "stand" | "cat" | "dog";

interface Shadow {
  id: number;
  /** Index into the scene's windows. */
  window: number;
  kind: Kind;
  /** Which row of the silhouettes picture. */
  row: number;
  seconds: number;
  leftward: boolean;
}

/** Which lights are on in each light. The same table the pictures were drawn with. */
const LIT: Record<SkyState, readonly string[]> = {
  day: ["always"],
  golden: ["always"],
  dusk: ["always", "evening"],
  night: ["always", "evening", "night"],
};

const MAX_AT_ONCE = 4;

export function WindowLife({ scene, light }: { scene: SceneId; light: SkyState }) {
  const windows = SCENES[scene].config.windows;
  const [shadows, setShadows] = useState<Shadow[]>([]);
  const lit = useRef<readonly string[]>(LIT[light]);
  useEffect(() => {
    lit.current = LIT[light];
    // A window that has gone dark shows nobody.
    setShadows((current) => current.filter((s) => LIT[light].includes(windows[s.window]!.when)));
  }, [light, windows]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { shadows: sheet } = SKY;
    let id = 0;
    const appear = () => {
      if (document.hidden) return;
      setShadows((current) => {
        if (current.length >= MAX_AT_ONCE) return current;
        const taken = new Set(current.map((s) => s.window));
        const free = windows
          .map((w, index) => ({ w, index }))
          .filter(({ w, index }) => lit.current.includes(w.when) && !taken.has(index));
        if (free.length === 0) return current;
        const { w, index } = free[Math.floor(Math.random() * free.length)]!;
        const roll = Math.random();
        // Tall windows show people; any window can have a cat on its sill.
        const tall = w.h >= 9;
        const kind: Kind =
          roll < 0.42 ? "pass" : roll < 0.7 ? "stand" : roll < 0.88 ? "cat" : "dog";
        const row =
          kind === "cat"
            ? sheet.cat
            : kind === "dog"
              ? sheet.dog
              : tall && Math.random() < 0.5
                ? sheet.tall
                : sheet.person;
        const seconds =
          kind === "pass"
            ? 3 + Math.random() * 4
            : kind === "stand"
              ? 9 + Math.random() * 16
              : kind === "cat"
                ? 18 + Math.random() * 40
                : 7 + Math.random() * 10;
        return [
          ...current,
          { id: ++id, window: index, kind, row, seconds, leftward: Math.random() < 0.5 },
        ];
      });
    };
    // The first one soon, so a scene opened at night is not left waiting.
    const first = setTimeout(appear, 2500);
    const timer = setInterval(() => {
      if (Math.random() < 0.55) appear();
    }, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [windows]);

  const { shadows: sheet } = SKY;
  const px = (n: number) => `calc(var(--u) * ${n})`;
  return (
    <>
      {shadows.map((shadow) => {
        const w = windows[shadow.window]!;
        return (
          <div
            key={shadow.id}
            className={styles.pane}
            style={{ left: px(w.x), top: px(w.y), width: px(w.w), height: px(w.h) }}
          >
            <div
              className={`${styles.shadow} ${styles[`shadow-${shadow.kind}`]} ${
                shadow.leftward ? styles.shadowLeft : ""
              }`}
              style={
                {
                  width: px(sheet.w),
                  height: px(sheet.h),
                  animationDuration: `${shadow.seconds}s`,
                  // how far a figure has to go to cross the window, in scene pixels
                  "--span": w.w,
                } as CSSProperties
              }
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                setShadows((current) => current.filter((other) => other.id !== shadow.id));
              }}
            >
              <div
                className={styles.shadowFrames}
                style={{
                  backgroundImage: `url(${sheet.src})`,
                  backgroundSize: `100% ${sheet.rows * 100}%`,
                  backgroundPosition: `0 ${(shadow.row / (sheet.rows - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
