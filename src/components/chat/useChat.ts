"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import { formatBytes, MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE } from "@/lib/limits";
import type {
  Attachment,
  ChatMessage,
  ContextUse,
  RanOn,
  SendBody,
  Session,
  ReasoningEffort,
  SessionMeta,
  SessionModel,
  SessionSummary,
  SessionWork,
  StreamEvent,
} from "@/lib/types";

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
  /** The provider's HTTP status, when the failure came from the provider. */
  status?: number;
  retry: RetryAction | null;
}

export interface UseChatOptions {
  /** The session to show, or null for a new, not yet saved conversation. */
  sessionId: string | null;
  /** Bump to re-open the same session (replays the boot line and refocuses). */
  openToken?: number;
  api: ChatApi;
  /** The project a new conversation is filed under when its first message is sent. */
  projectId?: string | null;
  /** The model a new conversation is set to, if not the one in settings. */
  model?: SessionModel | null;
  /** The thinking level a new conversation is set to, if not the one in settings. */
  startReasoning?: ReasoningEffort | null;
  /** Where a new conversation works: its repository, branch and environment, if picked. */
  startWork?: Partial<SessionWork> | null;
  onSessionCreated?: (session: SessionMeta) => void;
  onSessionUpdated?: (session: SessionMeta) => void;
  onSessionMissing?: (sessionId: string) => void;
}

const POLL_MS = 800;
const WEB_KEY = "ogchat:web";
const STOP_GRACE_MS = 2500;

function metaOf(session: Session): SessionMeta {
  const { messages: _messages, summary: _summary, ...meta } = session;
  return meta;
}

/** Requests the server refused because of what was sent; sending the same thing again cannot work. */
function isRefusal(err: unknown): boolean {
  return err instanceof ApiError && [400, 413, 415, 422].includes(err.status);
}

/** Stand-in attachments shown on a message while its files upload. */
function previewAttachments(files: File[]): Attachment[] {
  return files.map((file, index) => {
    const image = file.type.startsWith("image/");
    return {
      id: `pending-file-${index}`,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: image ? "image" : "text",
      ...(image ? { previewUrl: URL.createObjectURL(file) } : {}),
    };
  });
}

function releasePreviews(attachments: Attachment[]): void {
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

function describe(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  return { code: "unknown", message: "Something went wrong. Retry in a moment." };
}

/**
 * A message written while a reply was still coming. It waits its turn and is
 * sent when the conversation is free, as Claude's own apps do.
 */
export interface QueuedMessage {
  id: string;
  content: string;
  files: File[];
  web: boolean;
}

export function useChat(options: UseChatOptions) {
  const { sessionId, openToken = 0, api } = options;

  const [activeId, setActiveId] = useState<string | null>(sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhaseState] = useState<ChatPhase>(sessionId ? "loading" : "idle");
  const [streamText, setStreamText] = useState("");
  /** The model is reasoning and has not started its answer yet. */
  const [thinking, setThinking] = useState(false);
  /** What it has reasoned so far, when the provider shares it. */
  const [thinkingText, setThinkingText] = useState("");
  const thinkingRef = useRef("");
  /** Which model is writing the reply in progress, and at what thinking level. */
  const [ranOn, setRanOn] = useState<RanOn | null>(null);
  /** When the reply in progress started (ms since the epoch): what its timer counts from. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** Messages written while a reply was coming, waiting to be sent in order. */
  const [queued, setQueuedState] = useState<QueuedMessage[]>([]);
  const queuedRef = useRef<QueuedMessage[]>([]);
  const setQueued = useCallback((next: QueuedMessage[]) => {
    queuedRef.current = next;
    setQueuedState(next);
  }, []);
  /**
   * The queue waits instead of going on by itself: after a reply was stopped
   * or failed, the next message is the user's to send, not the app's.
   */
  const [queuePaused, setQueuePausedState] = useState(false);
  const queuePausedRef = useRef(false);
  const setQueuePaused = useCallback((paused: boolean) => {
    queuePausedRef.current = paused;
    setQueuePausedState(paused);
  }, []);
  const [error, setError] = useState<ChatErrorState | null>(null);
  /** How full the model's context window is with this conversation. */
  const [context, setContext] = useState<ContextUse | null>(null);
  /** The summary standing in for the early part of the conversation, once compressed. */
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [draft, setDraft] = useState("");
  /** Files waiting in the composer to go out with the next message. */
  const [files, setFilesState] = useState<File[]>([]);
  const filesRef = useRef<File[]>([]);
  const setFiles = useCallback((next: File[]) => {
    filesRef.current = next;
    setFilesState(next);
  }, []);
  /** Whether the next message may search the web. Remembered in this browser. */
  const [web, setWebState] = useState(false);
  const webRef = useRef(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WEB_KEY) === "1";
      webRef.current = saved;
      setWebState(saved);
    } catch {
      // storage unavailable: the switch simply starts off
    }
  }, []);
  const setWeb = useCallback((next: boolean) => {
    webRef.current = next;
    setWebState(next);
    try {
      window.localStorage.setItem(WEB_KEY, next ? "1" : "0");
    } catch {
      // not remembered, still applied
    }
  }, []);
  /** Counts session opens; drives the boot line and composer focus. */
  const [openCount, setOpenCount] = useState(0);

  const compressingRef = useRef(false);
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
    thinkingRef.current = "";
    setStreamText("");
    setThinking(false);
    setThinkingText("");
    setRanOn(null);
    setStartedAt(null);
  }, []);

  /** Fetches the session and adopts whatever state the server is in. */
  const load = useCallback(
    async (id: string, epoch: number): Promise<boolean> => {
      try {
        const detail = await api.getSession(id);
        if (epochRef.current !== epoch) return false;
        setMessages(detail.session.messages);
        // Whoever shows this chat learns what it is called and which model it is set to.
        callbacks.current.onSessionUpdated?.(metaOf(detail.session));
        setContext(detail.context ?? null);
        setSummary(detail.session.summary ?? null);
        callbacks.current.onSessionUpdated?.(metaOf(detail.session));
        if (detail.generating) {
          bufferRef.current = detail.partial;
          thinkingRef.current = detail.thinking ?? "";
          setStreamText(detail.partial);
          setThinkingText(thinkingRef.current);
          setRanOn(detail.ranOn ?? null);
          const began = detail.startedAt ? Date.parse(detail.startedAt) : NaN;
          setStartedAt((current) => (Number.isNaN(began) ? (current ?? Date.now()) : began));
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
    setContext(null);
    setSummary(null);
    setCompressing(false);
    setDraft("");
    setFiles([]);
    setQueued([]);
    setQueuePaused(false);
    resetStream();
    setOpenCount((n) => n + 1);
    if (sessionId) {
      setPhase("loading");
      void load(sessionId, epochRef.current);
    } else {
      setPhase("idle");
    }
  }, [sessionId, openToken, load, resetStream, setFiles, setPhase, setQueued, setQueuePaused]);

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

  /** Reads the context meter and the summary again, after the conversation has changed. */
  const remeasure = useCallback(
    async (id: string, epoch: number) => {
      try {
        const detail = await api.getSession(id);
        if (epochRef.current !== epoch) return;
        setContext(detail.context ?? null);
        setSummary(detail.session.summary ?? null);
      } catch {
        // the meter keeps its last reading; the next change reads it again
      }
    },
    [api],
  );

  const submit = useCallback(
    async (body: SendBody) => {
      if (phaseRef.current !== "idle") return;
      const epoch = epochRef.current;
      const isRegenerate = "regenerate" in body;
      const tempId = `pending-${Date.now()}`;
      const sending = !isRegenerate && body.files ? body.files : [];
      const previews = previewAttachments(sending);

      setError(null);
      resetStream();
      setStartedAt(Date.now());
      setPhase("streaming");
      setMessages((current) => {
        if (isRegenerate) {
          return current.at(-1)?.role === "assistant" ? current.slice(0, -1) : current;
        }
        const cut = body.replaceFromMessageId
          ? current.findIndex((m) => m.id === body.replaceFromMessageId)
          : -1;
        const kept = cut === -1 ? current : current.slice(0, cut);
        // An edited message keeps the files it already had; so does a question asked again.
        const source = body.replayOf ? current.find((m) => m.id === body.replayOf) : current[cut];
        const attachments = [...(source?.attachments ?? []), ...previews];
        return [
          ...kept,
          {
            id: tempId,
            role: "user",
            content: body.content,
            createdAt: new Date().toISOString(),
            ...(attachments.length ? { attachments } : {}),
          },
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
            releasePreviews(previews);
            callbacks.current.onSessionUpdated?.(event.session);
            break;
          }
          case "thinking": {
            if (!bufferRef.current) setThinking(true);
            if (event.text) {
              thinkingRef.current += event.text;
              if (!frameRef.current) {
                frameRef.current = requestAnimationFrame(() => {
                  frameRef.current = 0;
                  setThinkingText(thinkingRef.current);
                  setStreamText(bufferRef.current);
                });
              }
            }
            break;
          }
          case "model": {
            setRanOn(event.ranOn);
            break;
          }
          case "delta": {
            bufferRef.current += event.text;
            if (!frameRef.current) {
              frameRef.current = requestAnimationFrame(() => {
                frameRef.current = 0;
                setStreamText(bufferRef.current);
                setThinkingText(thinkingRef.current);
              });
            }
            break;
          }
          case "done":
          case "error": {
            const { message } = event;
            resetStream();
            // A stopped or failed reply holds the queue until the user says to go on.
            if (event.type === "error" || event.stopped) setQueuePaused(true);
            if (message) setMessages((current) => [...current, message]);
            if (event.type === "error") {
              setError({ ...event.error, retry: { kind: "regenerate" } });
            }
            setPhase("idle");
            callbacks.current.onSessionUpdated?.(event.session);
            void remeasure(event.session.id, epoch);
            break;
          }
        }
      };

      try {
        if (!id) {
          const created = await api.createSession(
            callbacks.current.projectId ?? null,
            callbacks.current.model ?? null,
            callbacks.current.startReasoning ?? null,
            callbacks.current.startWork ?? null,
          );
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
        // Nothing was accepted: put the transcript back and keep the text and files within reach.
        setMessages((current) => current.filter((m) => m.id !== tempId));
        releasePreviews(previews);
        if (!isRegenerate && !body.replayOf) {
          setDraft((current) => (current.trim() ? current : body.content));
          if (sending.length && filesRef.current.length === 0) setFiles(sending);
        }
        if (id && (isRegenerate || body.replaceFromMessageId)) void load(id, epoch);
        else setPhase("idle");
        setQueuePaused(true);
        // A refused request (bad file, too large…) needs changing, not repeating.
        setError({ ...describe(err), retry: isRefusal(err) ? null : { kind: "resubmit", body } });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [api, load, remeasure, resetStream, setFiles, setPhase],
  );

  const send = useCallback(
    (content: string) => {
      const text = content.trim();
      const attached = filesRef.current;
      if (!text && attached.length === 0) return false;
      const now = phaseRef.current;
      // A reply is still coming: the message waits its turn.
      if (now === "streaming" || now === "following") {
        setDraft("");
        setFiles([]);
        setQueued([
          ...queuedRef.current,
          { id: `queued-${Date.now()}`, content: text, files: attached, web: webRef.current },
        ]);
        return true;
      }
      if (now !== "idle") return false;
      setDraft("");
      setFiles([]);
      setQueuePaused(false);
      void submit({
        content: text,
        ...(attached.length ? { files: attached } : {}),
        ...(webRef.current ? { web: true } : {}),
      });
      return true;
    },
    [setFiles, setQueued, setQueuePaused, submit],
  );

  /** Sends a queued message now (the conversation must be free), and lets the rest follow. */
  const sendQueued = useCallback(
    (id: string) => {
      const item = queuedRef.current.find((one) => one.id === id);
      if (!item || phaseRef.current !== "idle") return;
      setQueued(queuedRef.current.filter((one) => one.id !== id));
      setQueuePaused(false);
      void submit({
        content: item.content,
        ...(item.files.length ? { files: item.files } : {}),
        ...(item.web ? { web: true } : {}),
      });
    },
    [setQueued, setQueuePaused, submit],
  );

  /** Takes a queued message out of the queue, and back into the message box if asked. */
  const unqueue = useCallback(
    (id: string, toEdit: boolean) => {
      const item = queuedRef.current.find((one) => one.id === id);
      if (!item) return;
      setQueued(queuedRef.current.filter((one) => one.id !== id));
      if (toEdit) {
        setDraft((current) => (current.trim() ? `${current}\n\n${item.content}` : item.content));
        if (item.files.length) setFiles([...filesRef.current, ...item.files]);
      }
    },
    [setFiles, setQueued],
  );

  // When the conversation is free again, the next queued message goes, unless the queue is held.
  useEffect(() => {
    if (phase !== "idle" || compressing || error || queuePaused) return;
    const next = queued[0];
    if (!next || !activeIdRef.current) return;
    sendQueued(next.id);
  }, [phase, compressing, error, queuePaused, queued, sendQueued]);

  /** Queues files for the next message. Oversized or surplus files are refused with a note. */
  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const accepted = [...filesRef.current];
      const problems: string[] = [];
      for (const file of incoming) {
        if (file.size > MAX_FILE_BYTES) {
          problems.push(
            `"${file.name}" is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)} per file.`,
          );
        } else if (accepted.length >= MAX_FILES_PER_MESSAGE) {
          problems.push(
            `Only ${MAX_FILES_PER_MESSAGE} files fit on one message; "${file.name}" was left out.`,
          );
        } else if (!accepted.some((f) => f.name === file.name && f.size === file.size)) {
          accepted.push(file);
        }
      }
      setFiles(accepted);
      if (problems.length)
        setError({ code: "attachment", message: problems.join(" "), retry: null });
    },
    [setFiles],
  );

  const removeFile = useCallback(
    (index: number) => setFiles(filesRef.current.filter((_, i) => i !== index)),
    [setFiles],
  );

  const fileUrl = useCallback(
    (attachment: Attachment) => {
      if (attachment.previewUrl) return attachment.previewUrl;
      const id = activeIdRef.current;
      return id && !attachment.id.startsWith("pending-") ? api.fileUrl(id, attachment.id) : "";
    },
    [api],
  );

  const editAndResend = useCallback(
    (messageId: string, content: string) => {
      const text = content.trim();
      if (phaseRef.current !== "idle") return false;
      void submit({
        content: text,
        replaceFromMessageId: messageId,
        ...(webRef.current ? { web: true } : {}),
      });
      return true;
    },
    [submit],
  );

  const regenerate = useCallback(() => void submit({ regenerate: true }), [submit]);

  /** Asks an earlier question again, as a new message at the end, with the files it had. */
  const replay = useCallback(
    (message: ChatMessage) => {
      if (phaseRef.current !== "idle" || message.role !== "user") return false;
      void submit({
        content: message.content,
        replayOf: message.id,
        ...(message.web ? { web: true } : {}),
      });
      return true;
    },
    [submit],
  );

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
      if ("content" in body) {
        setDraft((current) => (current === body.content ? "" : current));
        if (body.files && filesRef.current === body.files) setFiles([]);
      }
      void submit(body);
    } else {
      void submit({ regenerate: true });
    }
  }, [error, load, setFiles, setPhase, submit]);

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
        void remeasure(id, epoch);
      } catch (err) {
        if (epochRef.current !== epoch) return;
        setError({ ...describe(err), retry: null });
      }
    },
    [api, remeasure],
  );

  /**
   * Compresses the conversation: the model writes a summary of it, and from
   * then on the summary is sent in place of the messages it covers. With
   * `undo`, the summary is dropped and the whole conversation is sent again.
   */
  const compress = useCallback(
    async (undo = false) => {
      const id = activeIdRef.current;
      if (!id || phaseRef.current !== "idle" || compressingRef.current) return;
      const epoch = epochRef.current;
      compressingRef.current = true;
      setCompressing(true);
      setError(null);
      try {
        const result = undo ? await api.expand(id) : await api.compress(id);
        if (epochRef.current !== epoch) return;
        setMessages(result.session.messages);
        setSummary(result.session.summary ?? null);
        setContext(result.context);
      } catch (err) {
        if (epochRef.current !== epoch) return;
        // Stopped on purpose: nothing went wrong, and nothing was changed.
        if (describe(err).code !== "aborted") setError({ ...describe(err), retry: null });
      } finally {
        compressingRef.current = false;
        if (epochRef.current === epoch) setCompressing(false);
      }
    },
    [api],
  );

  /** Gives up on a summary that is being written. The conversation is left as it was. */
  const stopCompress = useCallback(() => {
    const id = activeIdRef.current;
    if (id && compressingRef.current) void api.stop(id).catch(() => {});
  }, [api]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    activeId,
    messages,
    phase,
    streamText,
    thinking,
    thinkingText,
    ranOn,
    startedAt,
    queued,
    queuePaused,
    sendQueued,
    unqueue,
    web,
    setWeb,
    error,
    context,
    summary,
    compressing,
    compress,
    stopCompress,
    draft,
    setDraft,
    files,
    addFiles,
    removeFile,
    fileUrl,
    openCount,
    send,
    editAndResend,
    replay,
    regenerate,
    retry,
    stop,
    deleteMessage,
    dismissError,
  };
}

export type ChatController = ReturnType<typeof useChat>;
