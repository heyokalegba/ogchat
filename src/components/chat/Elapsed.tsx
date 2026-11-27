"use client";

import { useEffect, useState } from "react";
import { stopwatch } from "@/lib/format";

/** The time now, updated every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * A stopwatch counting up from `since`: how long a reply has been going,
 * thinking included. "thinking 0:42", "writing 1:10".
 */
export function Elapsed(props: { since: number; label?: string; className?: string }) {
  const now = useNow(true);
  const time = stopwatch(now - props.since);
  return (
    <span
      className={props.className}
      title="How long this reply has been going, thinking included"
      aria-label={`${props.label ? `${props.label} for ` : ""}${time}`}
      role="timer"
    >
      {props.label ? `${props.label} ` : ""}
      {time}
    </span>
  );
}
