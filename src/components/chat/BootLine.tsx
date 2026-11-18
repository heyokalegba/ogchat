"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./chat.module.css";

const SETTLE_MS = 1500;

/**
 * The startup moment: one line typed out when a session opens. It then dims,
 * and fades away unless `persist` is set (an empty session keeps it as ambience).
 * Purely decorative: it never takes focus or blocks input, and any key press
 * or click finishes it at once.
 */
export function BootLine({ text, persist }: { text: string; persist: boolean }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const finish = () => setDone(true);
    const timer = setTimeout(finish, SETTLE_MS);
    window.addEventListener("keydown", finish, { once: true });
    window.addEventListener("pointerdown", finish, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, []);

  const style = { "--og-boot-chars": Array.from(text).length } as CSSProperties;
  return (
    <div
      className={`${styles.boot} ${done ? styles.bootDone : ""} ${done && !persist ? styles.bootGone : ""}`}
      style={style}
      aria-hidden="true"
    >
      <div className={styles.bootInner}>
        <span className={styles.bootLabel}>
          <span className={styles.bootText}>{text}</span>
          <span className={styles.bootCaret} />
        </span>
      </div>
    </div>
  );
}
