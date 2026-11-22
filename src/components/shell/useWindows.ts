"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionMeta } from "@/lib/types";

/**
 * A chat in a window of its own.
 *
 * A chat can be dragged out of the list (or sent out with its button) into a
 * window that shows only that chat. While that window is open the chat stays
 * in the list, greyed out; close the window and it is an ordinary entry
 * again. Nothing about the chat itself changes: it is the same saved session
 * shown somewhere else.
 *
 * The windows are the same page with `solo=1` in the address. They find each
 * other without the server:
 *  - a window showing one chat holds a lock named after it for as long as it
 *    is open (the browser lets go of it when the window closes, however it
 *    closes), and the main window asks which locks are held;
 *  - a channel between the windows carries the news that cannot wait: a chat
 *    was renamed or answered, a window opened or closed, a chat was deleted.
 */

const CHANNEL = "ogchat:windows";
const LOCK = "ogchat:window:";
const LOOK_EVERY_MS = 2500;

export type WindowNews =
  | { type: "here" | "gone" | "close" | "focus"; id: string }
  | { type: "changed"; session: SessionMeta }
  | { type: "who" };

export function isSoloWindow(): boolean {
  return new URLSearchParams(window.location.search).get("solo") === "1";
}

function soloUrl(id: string): string {
  return `${window.location.pathname}?s=${encodeURIComponent(id)}&solo=1`;
}

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

/** The ids of the chats that have a window of their own open, as far as the locks say. */
async function lockedIds(): Promise<Set<string> | null> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) return null;
  try {
    const { held = [] } = await navigator.locks.query();
    return new Set(
      held
        .map((lock) => lock.name ?? "")
        .filter((name) => name.startsWith(LOCK))
        .map((name) => name.slice(LOCK.length)),
    );
  } catch {
    return null;
  }
}

/**
 * For a window that shows one chat: says so for as long as it is open, passes
 * on what happens in it, and does what the main window asks (come forward,
 * close because the chat was deleted).
 */
export function useSoloWindow(id: string | null, solo: boolean) {
  const port = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!solo || !id) return;
    const news = channel();
    port.current = news;
    let release: (() => void) | null = null;
    if (navigator.locks?.request) {
      void navigator.locks
        .request(
          LOCK + id,
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        )
        .catch(() => {});
    }
    const say = (type: "here" | "gone") => news?.postMessage({ type, id } satisfies WindowNews);
    say("here");
    const onNews = (event: MessageEvent<WindowNews>) => {
      const message = event.data;
      if (message.type === "who") say("here");
      else if (message.type === "focus" && message.id === id) window.focus();
      else if (message.type === "close" && message.id === id) window.close();
    };
    news?.addEventListener("message", onNews);
    const onHide = () => say("gone");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      say("gone");
      release?.();
      news?.close();
      port.current = null;
    };
  }, [id, solo]);

  /** Tells the main window a chat changed here (renamed itself, was answered, got another model). */
  return useCallback((session: SessionMeta) => {
    port.current?.postMessage({ type: "changed", session } satisfies WindowNews);
  }, []);
}

/**
 * For the main window: which chats are out in windows of their own, and how
 * to send one out, bring one forward, or close one.
 */
export function useChatWindows(enabled: boolean, onChanged: (session: SessionMeta) => void) {
  const [away, setAway] = useState<ReadonlySet<string>>(new Set());
  const port = useRef<BroadcastChannel | null>(null);
  const opened = useRef(new Map<string, Window>());
  /** What the windows themselves have said, for browsers that cannot be asked about locks. */
  const said = useRef(new Set<string>());
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  const look = useCallback(async () => {
    const locked = await lockedIds();
    const next = locked ?? new Set(said.current);
    // A window just opened here may not have its lock yet.
    for (const [id, win] of opened.current) {
      if (win.closed) opened.current.delete(id);
      else if (!locked) next.add(id);
    }
    setAway((current) =>
      current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const news = channel();
    port.current = news;
    const onNews = (event: MessageEvent<WindowNews>) => {
      const message = event.data;
      if (message.type === "changed") changed.current(message.session);
      else if (message.type === "here") {
        said.current.add(message.id);
        void look();
      } else if (message.type === "gone") {
        said.current.delete(message.id);
        opened.current.delete(message.id);
        // The lock is let go a moment after the window says it is going.
        void look();
        setTimeout(() => void look(), 400);
      }
    };
    news?.addEventListener("message", onNews);
    news?.postMessage({ type: "who" } satisfies WindowNews);
    void look();
    const timer = setInterval(() => void look(), LOOK_EVERY_MS);
    const onBack = () => void look();
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
      news?.close();
      port.current = null;
    };
  }, [enabled, look]);

  /** Opens a chat in a window of its own, at a point on the screen if one is given. */
  const popOut = useCallback(
    (id: string, at?: { x: number; y: number }) => {
      const width = 780;
      const height = Math.min(900, Math.max(520, window.screen.availHeight - 120));
      const left = Math.round(at ? at.x - 200 : window.screenX + 140);
      const top = Math.round(at ? Math.max(0, at.y - 40) : window.screenY + 60);
      const win = window.open(
        soloUrl(id),
        `ogchat-${id}`,
        `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
      );
      if (!win) return false;
      opened.current.set(id, win);
      setAway((current) => new Set(current).add(id));
      setTimeout(() => void look(), 1500);
      return true;
    },
    [look],
  );

  /** Brings a chat's window to the front. */
  const bringForward = useCallback((id: string) => {
    const win = opened.current.get(id);
    if (win && !win.closed) win.focus();
    port.current?.postMessage({ type: "focus", id } satisfies WindowNews);
  }, []);

  /** Closes a chat's window, if it has one: the chat was deleted. */
  const closeWindow = useCallback((id: string) => {
    port.current?.postMessage({ type: "close", id } satisfies WindowNews);
    const win = opened.current.get(id);
    if (win && !win.closed) win.close();
    opened.current.delete(id);
  }, []);

  return { away, popOut, bringForward, closeWindow };
}
