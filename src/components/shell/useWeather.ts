"use client";

import { useEffect, useState } from "react";
import type { ChatApi } from "@/lib/client/api";
import type { DayRecord, Reading } from "@/lib/weather";

/** How often the live weather is looked at again. The server keeps it for as long. */
const LOOK_EVERY_MS = 10 * 60_000;
/** How soon it is asked again after an attempt that got no answer. */
const RETRY_EVERY_MS = 60_000;

/**
 * New York's weather for the scene: the reading for this moment, looked at
 * again every ten minutes while the window is showing, or, when the scene is
 * set to a past day, that day's record. An attempt that fails is made again
 * a minute later. Nothing is asked for while `wanted` is false, which is how
 * live weather is switched off.
 */
export function useWeather(api: ChatApi, wanted: boolean, date: string | null) {
  const [now, setNow] = useState<Reading | null>(null);
  const [day, setDay] = useState<DayRecord | null>(null);
  /** What the last attempt ran into, by which request: "now", or the date asked for. */
  const [problem, setProblem] = useState<{ about: string; message: string } | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let current = true;
    /** When the weather was last read, and whether an answer is still on its way. */
    let readAt = 0;
    let asking = false;
    const about = date ?? "now";

    const look = () => {
      if (asking) return;
      asking = true;
      const answer = date
        ? api.getWeatherOn(date).then((record) => current && setDay(record))
        : api.getWeatherNow().then((reading) => current && setNow(reading));
      answer
        .then(() => {
          readAt = Date.now();
          if (current) setProblem(null);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "The weather could not be read.";
          if (current) setProblem({ about, message });
        })
        .finally(() => {
          asking = false;
        });
    };
    // Once a minute: a past day is asked for until it has come, and then never
    // again; the live weather is asked for again when the last reading is old.
    const due = () => (readAt === 0 ? true : !date && Date.now() - readAt >= LOOK_EVERY_MS);
    const tick = () => {
      if (due() && document.visibilityState === "visible") look();
    };
    look();
    const timer = setInterval(tick, RETRY_EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [api, wanted, date]);

  const about = date ?? "now";
  return {
    now: wanted && !date ? now : null,
    day: wanted && date && day?.date === date ? day : null,
    problem: wanted && problem?.about === about ? problem.message : null,
  };
}
