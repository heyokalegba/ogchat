"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import type { ChatMessage, SendBody, Session, SessionMeta, StreamEvent } from "@/lib/types";

/**
 * State for one open conversation: loading it, sending turns, following the
 * streamed reply, and recovering from every failure without losing the thread.
 */

export type ChatPhase =
  /** Fetching the session. */
  | "loading"
  | "idle"
  /** A reply is streaming over our own connection. */
  | "streaming"
  /** The server is producing a reply we are not connected to; we poll for it. */
  | "following";

export type RetryAction =
  { kind: "regenerate" } | { kind: "resubmit"; body: SendBody } | { kind: "reload" };

export interface ChatErrorState {
  code: string;
  message: string;
  retry: RetryAction | null;
}

export interface UseChatOptions {
  /** The session to show, or null for a new, not yet saved conversation. */
  sessionId: string | null;
  /** Bump to re-open the same session (replays the boot line and refocuses). */
  openToken?: number;
  api: ChatApi;
  onSessionCreated?: (session: SessionMeta) => void;
  onSessionUpdated?: (session: SessionMeta) => void;
  onSessionMissing?: (sessionId: string) => void;
}

const POLL_MS = 800;
const STOP_GRACE_MS = 2500;

function metaOf(session: Session): SessionMeta {
  const { id, title, createdAt, updatedAt, messageCount } = session;
  return { id, title, createdAt, updatedAt, messageCount };
}

function describe(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  return { code: "unknown", message: "Something went wrong. Retry in a moment." };
}

export function useChat(options: UseChatOptions) {
  const { sessionId, openToken = 0, api } = options;

  const [activeId, setActiveId] = useState<string | null>(sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhaseState] = useState<ChatPhase>(sessionId ? "loading" : "idle");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<ChatErrorState | null>(null);
  const [draft, setDraft] = useState("");
  /** Counts session opens; drives the boot line and composer focus. */
  const [openCount, setOpenCount] = useState(0);

  const activeIdRef = useRef<string | null>(sessionId);
  const phaseRef = useRef<ChatPhase>(phase);
  /** Bumped whenever a different session is opened; stale async work checks it and bails. */
  const epochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const frameRef = useRef(0);
  const openedRef = useRef<{ id: string | null; token: number } | null>(null);
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const setPhase = useCallback((next: ChatPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const resetStream = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    bufferRef.current = "";
    setStreamText("");
  }, []);

  /** Fetches the session and adopts whatever state the server is in. */
  const load = useCallback(
    async (id: string, epoch: number): Promise<boolean> => {
      try {
        const detail = await api.getSession(id);
        if (epochRef.current !== epoch) return false;
        setMessages(detail.session.messages);
        callbacks.current.onSessionUpdated?.(metaOf(detail.session));
        if (detail.generating) {
          bufferRef.current = detail.partial;
          setStreamText(detail.partial);
          setPhase("following");
        } else {
          resetStream();
          setPhase("idle");
        }
        return true;
      } catch (err) {
        if (epochRef.current !== epoch) return false;
        if (err instanceof ApiError && err.status === 404) {
          callbacks.current.onSessionMissing?.(id);
          activeIdRef.current = null;
          setActiveId(null);
          setMessages([]);
          resetStream();
          setPhase("idle");
          return false;
        }
        resetStream();
        setPhase("idle");
        setError({ ...describe(err), retry: { kind: "reload" } });
        return false;
      }
    },
    [api, resetStream, setPhase],
  );

  // Open a session whenever the requested one changes.
  useEffect(() => {
    const previous = openedRef.current;
    openedRef.current = { id: sessionId, token: openToken };
    if (previous && previous.id === sessionId && previous.token === openToken) return;
    if (previous && sessionId === activeIdRef.current) {
      // Either the parent caught up with a session we just created (nothing to
      // do), or it re-opened the one already on screen (replay the open moment).
      if (previous.token !== openToken) setOpenCount((n) => n + 1);
      return;
    }
    epochRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    activeIdRef.current = sessionId;
    setActiveId(sessionId);
    setMessages([]);
    setError(null);
    setDraft("");
    resetStream();
    setOpenCount((n) => n + 1);
    if (sessionId) {
      setPhase("loading");
      void load(sessionId, epochRef.current);
    } else {
      setPhase("idle");
    }
  }, [sessionId, openToken, load, resetStream, setPhase]);

  // While the server generates without us, poll until it is done.
  useEffect(() => {
    if (phase !== "following" || !activeId) return;
    const epoch = epochRef.current;
    const timer = setInterval(() => void load(activeId, epoch), POLL_MS);
    return () => clearInterval(timer);
  }, [phase, activeId, load]);

  useEffect(
    () => () => {
      epochRef.current += 1;
      abortRef.current?.abort();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      // Forget what was opened, so a remount (React strict mode does one in
      // development) opens the session again instead of waiting on stale work.
      openedRef.current = null;
    },
    [],
  );

  const submit = useCallback(
    async (body: SendBody) => {
      if (phaseRef.current !== "idle") return;
      const epoch = epochRef.current;
      const isRegenerate = "regenerate" in body;
      const tempId = `pending-${Date.now()}`;

      setError(null);
      resetStream();
      setPhase("streaming");
      setMessages((current) => {
        if (isRegenerate) {
          return current.at(-1)?.role === "assistant" ? current.slice(0, -1) : current;
        }
        const cut = body.replaceFromMessageId
          ? current.findIndex((m) => m.id === body.replaceFromMessageId)
          : -1;
        const kept = cut === -1 ? current : current.slice(0, cut);
        return [
          ...kept,
          { id: tempId, role: "user", content: body.content, createdAt: new Date().toISOString() },
        ];
      });

      let id = activeIdRef.current;
      let accepted = false;
      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (event: StreamEvent) => {
        if (epochRef.current !== epoch) return;
        switch (event.type) {
          case "start": {
            accepted = true;
            const { userMessage } = event;
            if (userMessage) {
              setMessages((current) => current.map((m) => (m.id === tempId ? userMessage : m)));
            }
            callbacks.current.onSessionUpdated?.(event.session);
            break;
          }
          case "delta": {
            bufferRef.current += event.text;
            if (!frameRef.current) {
              frameRef.current = requestAnimationFrame(() => {
                frameRef.current = 0;
                setStreamText(bufferRef.current);
              });
            }
            break;
          }
          case "done":
          case "error": {
            const { message } = event;
            resetStream();
            if (message) setMessages((current) => [...current, message]);
            if (event.type === "error") {
              setError({ ...event.error, retry: { kind: "regenerate" } });
            }
            setPhase("idle");
            callbacks.current.onSessionUpdated?.(event.session);
            break;
          }
        }
      };

      try {
        if (!id) {
          const created = await api.createSession();
          if (epochRef.current !== epoch) {
            // The user moved on before the session existed; do not leave an empty one behind.
            void api.deleteSession(created.id).catch(() => {});
            return;
          }
          id = created.id;
          activeIdRef.current = id;
          setActiveId(id);
          callbacks.current.onSessionCreated?.(metaOf(created));
        }
        await api.send(id, body, onEvent, controller.signal);
      } catch (err) {
        if (epochRef.current !== epoch) return;
        resetStream();
        if (accepted && id) {
          // The turn reached the server but our connection to it broke. The
          // server keeps going, so re-read the session and follow from there.
          const ok = await load(id, epoch);
          if (!ok && epochRef.current === epoch) {
            setError({
              code: "connection_lost",
              message:
                "Lost the connection to the ogchat server. Your message was saved; retry to pick up where it left off.",
              retry: { kind: "reload" },
            });
          }
          return;
        }
        // Nothing was accepted: put the transcript back and keep the text within reach.
        setMessages((current) => current.filter((m) => m.id !== tempId));
        if (!isRegenerate) {
          setDraft((current) => (current.trim() ? current : body.content));
        }
        if (id && (isRegenerate || body.replaceFromMessageId)) void load(id, epoch);
        else setPhase("idle");
        setError({ ...describe(err), retry: { kind: "resubmit", body } });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [api, load, resetStream, setPhase],
  );

  const send = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text || phaseRef.current !== "idle") return false;
      setDraft("");
      void submit({ content: text });
      return true;
    },
    [submit],
  );

  const editAndResend = useCallback(
    (messageId: string, content: string) => {
      const text = content.trim();
      if (!text || phaseRef.current !== "idle") return false;
      void submit({ content: text, replaceFromMessageId: messageId });
      return true;
    },
    [submit],
  );

  const regenerate = useCallback(() => void submit({ regenerate: true }), [submit]);

  const retry = useCallback(() => {
    const action = error?.retry ?? { kind: "regenerate" as const };
    const id = activeIdRef.current;
    if (action.kind === "reload") {
      if (!id) return;
      setError(null);
      setPhase("loading");
      void load(id, epochRef.current);
    } else if (action.kind === "resubmit") {
      const { body } = action;
      if ("content" in body) setDraft((current) => (current === body.content ? "" : current));
      void submit(body);
    } else {
      void submit({ regenerate: true });
    }
  }, [error, load, setPhase, submit]);

  const stop = useCallback(async () => {
    const id = activeIdRef.current;
    const current = phaseRef.current;
    if (!id || (current !== "streaming" && current !== "following")) return;
    const epoch = epochRef.current;
    try {
      await api.stop(id);
    } catch {
      abortRef.current?.abort();
    }
    if (current === "following") {
      void load(id, epoch);
      return;
    }
    // Our stream normally ends by itself once the server stops. If it does not, re-sync.
    setTimeout(() => {
      if (epochRef.current !== epoch || phaseRef.current !== "streaming") return;
      abortRef.current?.abort();
    }, STOP_GRACE_MS);
  }, [api, load]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const id = activeIdRef.current;
      if (!id || phaseRef.current !== "idle") return;
      const epoch = epochRef.current;
      try {
        const session = await api.deleteMessage(id, messageId);
        if (epochRef.current !== epoch) return;
        setMessages(session.messages);
        setError(null);
        callbacks.current.onSessionUpdated?.(metaOf(session));
      } catch (err) {
        if (epochRef.current !== epoch) return;
        setError({ ...describe(err), retry: null });
      }
    },
    [api],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    activeId,
    messages,
    phase,
    streamText,
    error,
    draft,
    setDraft,
    openCount,
    send,
    editAndResend,
    regenerate,
    retry,
    stop,
    deleteMessage,
    dismissError,
  };
}

export type ChatController = ReturnType<typeof useChat>;
