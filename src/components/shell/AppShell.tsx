"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatSurface } from "@/components/chat";
import { MenuIcon } from "@/components/chat/icons";
import "@/components/chat/theme.css";
import { createApi } from "@/lib/client/api";
import type { PublicSettings, SessionMeta } from "@/lib/types";
import { Backdrop, isSceneId, SCENES, type SceneId } from "./Backdrop";
import { SettingsPanel } from "./SettingsPanel";
import styles from "./shell.module.css";
import { Sidebar } from "./Sidebar";

const SEARCH_DEBOUNCE_MS = 140;
const SCENE_KEY = "ogchat:scene";

function sessionFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("s");
}

function writeUrl(id: string | null, mode: "push" | "replace"): void {
  const url = id ? `?s=${encodeURIComponent(id)}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function newestFirst(a: SessionMeta, b: SessionMeta): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);
}

/**
 * The application shell: session sidebar, top bar and settings around a
 * ChatSurface. All chat behavior lives in the surface; the shell only decides
 * which session it shows.
 */
export function AppShell() {
  const api = useMemo(() => createApi("/api"), []);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [openToken, setOpenToken] = useState(0);
  const [ready, setReady] = useState(false);
  /** Which backdrop is on show. Remembered in this browser. */
  const [scene, setScene] = useState<SceneId>("skyline");
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const refreshSessions = useCallback(
    async (q: string, signal?: AbortSignal) => {
      try {
        const next = await api.listSessions(q, signal);
        if (signal?.aborted || queryRef.current !== q) return;
        setSessions(next);
        setLoaded(true);
      } catch {
        // The chat surface reports connection problems; the list just keeps what it has.
      }
    },
    [api],
  );

  // First load: which session the URL points at, the session list, the provider settings.
  useEffect(() => {
    setActiveId(sessionFromUrl());
    try {
      const saved = window.localStorage.getItem(SCENE_KEY);
      if (isSceneId(saved)) setScene(saved);
    } catch {
      // Storage can be unavailable (private mode); the default scene is fine.
    }
    setReady(true);
    void refreshSessions("");
    api.getSettings().then(setSettings, () => {});
    const onPop = () => {
      setActiveId(sessionFromUrl());
      setOpenToken((n) => n + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [api, refreshSessions]);

  // Search as you type.
  const onQueryChange = useCallback((value: string) => {
    queryRef.current = value.trim();
    setQuery(value);
  }, []);
  const trimmedQuery = query.trim();
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => void refreshSessions(trimmedQuery, controller.signal),
      SEARCH_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, refreshSessions]);

  // Cmd/Ctrl+K focuses the session search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const title = sessions.find((s) => s.id === activeId)?.title;
    if (title) setActiveTitle(title);
    else if (!activeId) setActiveTitle(null);
  }, [sessions, activeId]);

  useEffect(() => {
    document.title = activeId && activeTitle ? `${activeTitle} · ogchat` : "ogchat";
  }, [activeId, activeTitle]);

  const open = useCallback((id: string | null) => {
    setActiveId(id);
    setOpenToken((n) => n + 1);
    setSidebarOpen(false);
    if (sessionFromUrl() !== id) writeUrl(id, "push");
  }, []);

  const upsert = useCallback((session: SessionMeta) => {
    setSessions((current) => {
      const known = current.some((s) => s.id === session.id);
      // While a search is active, do not add sessions that the search did not return.
      if (!known && queryRef.current) return current;
      const next = known
        ? current.map((s) => (s.id === session.id ? session : s))
        : [session, ...current];
      return next.sort(newestFirst);
    });
    setActiveTitle((current) => (session.id === activeIdRef.current ? session.title : current));
  }, []);

  const onSessionCreated = useCallback(
    (session: SessionMeta) => {
      activeIdRef.current = session.id;
      setActiveId(session.id);
      setActiveTitle(session.title);
      writeUrl(session.id, "replace");
      upsert(session);
    },
    [upsert],
  );

  const onSessionMissing = useCallback((id: string) => {
    setSessions((current) => current.filter((s) => s.id !== id));
    setActiveId((current) => (current === id ? null : current));
    if (sessionFromUrl() === id) writeUrl(null, "replace");
  }, []);

  const onRename = useCallback(
    async (id: string, title: string) => {
      try {
        upsert(await api.renameSession(id, title));
      } catch {
        void refreshSessions(queryRef.current);
      }
    },
    [api, refreshSessions, upsert],
  );

  const onDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteSession(id);
      } catch {
        void refreshSessions(queryRef.current);
        return;
      }
      setSessions((current) => current.filter((s) => s.id !== id));
      if (activeIdRef.current === id) open(null);
    },
    [api, open, refreshSessions],
  );

  const openSettings = useCallback(() => {
    setSidebarOpen(false);
    setSettingsOpen(true);
    // Pick up changes made outside the app, such as an edited .env.local.
    api.getSettings().then(setSettings, () => {});
  }, [api]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const chooseScene = useCallback((next: SceneId) => {
    setScene(next);
    try {
      window.localStorage.setItem(SCENE_KEY, next);
    } catch {
      // Not remembered, but still switched.
    }
  }, []);

  const provider = useMemo(
    () => (settings ? { ready: settings.apiKey.set, model: settings.model } : null),
    [settings],
  );

  return (
    <div className={`ogchat ${styles.shell}`}>
      {ready && <Backdrop scene={scene} />}
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        query={query}
        loaded={loaded}
        settings={settings}
        open={sidebarOpen}
        searchRef={searchRef}
        onQueryChange={onQueryChange}
        onSelect={open}
        onNew={() => open(null)}
        onRename={onRename}
        onDelete={onDelete}
        onOpenSettings={openSettings}
      />
      {sidebarOpen && <div className={styles.scrim} onClick={() => setSidebarOpen(false)} />}

      <main className={styles.main}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.menuButton}`}
            onClick={() => setSidebarOpen(true)}
            aria-label="Show sessions"
          >
            <MenuIcon />
          </button>
          <div className={styles.topTitle}>
            <span className={styles.topPath}>~/</span>
            {activeId ? (activeTitle ?? "session") : "new session"}
          </div>
          <div className={styles.sceneSwitch} role="group" aria-label="Backdrop">
            {SCENES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.sceneButton} ${option.id === scene ? styles.sceneActive : ""}`}
                aria-pressed={option.id === scene}
                title={option.hint}
                onClick={() => chooseScene(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>
        <div className={styles.surfaceSlot}>
          {ready && (
            <ChatSurface
              className={styles.wall}
              sessionId={activeId}
              openToken={openToken}
              provider={provider}
              onSessionCreated={onSessionCreated}
              onSessionUpdated={upsert}
              onSessionMissing={onSessionMissing}
              onOpenSettings={openSettings}
            />
          )}
        </div>
      </main>

      {settingsOpen && settings && (
        <SettingsPanel
          api={api}
          settings={settings}
          onClose={closeSettings}
          onSaved={(next) => {
            setSettings(next);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
