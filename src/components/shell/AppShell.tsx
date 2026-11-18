"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChatSurface } from "@/components/chat";
import { MenuIcon } from "@/components/chat/icons";
import "@/components/chat/theme.css";
import { createApi } from "@/lib/client/api";
import { brooklynClock, offsetForClockTime, readSky } from "@/lib/daylight";
import type { PublicSettings, SessionMeta } from "@/lib/types";
import { SCENES, type SceneId } from "./art";
import { Backdrop } from "./Backdrop";
import { DEFAULT_LOOK, loadLook, lookVariables, saveLook, type Look } from "./look";
import { LookPanel } from "./LookPanel";
import { SettingsPanel } from "./SettingsPanel";
import styles from "./shell.module.css";
import { Sidebar } from "./Sidebar";

const SEARCH_DEBOUNCE_MS = 140;
/** How often the scene looks at the clock. The sun moves a quarter of a degree a minute. */
const CLOCK_TICK_MS = 15_000;
const SCENE_IDS = Object.keys(SCENES) as SceneId[];

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
  /** Scene, time of day, wall and text preferences. Remembered in this browser. */
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [lookOpen, setLookOpen] = useState(false);
  /** The real time, re-read every few seconds. Null until the page is live in the browser. */
  const [realNow, setRealNow] = useState<number | null>(null);
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
    setLook(loadLook());
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

  const changeLook = useCallback((patch: Partial<Look>) => {
    setLook((current) => {
      const next = { ...current, ...patch };
      saveLook(next);
      return next;
    });
  }, []);

  // The scene's clock: real time, looked at again every few seconds and
  // whenever the tab comes back. It is never stopped; setting a time only
  // shifts it, and it runs on from there.
  useEffect(() => {
    const tick = () => setRealNow(Date.now());
    tick();
    const timer = setInterval(tick, CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const sceneNow = realNow === null ? null : realNow + look.clockOffsetMs;
  const view = useMemo(() => (sceneNow === null ? null : readSky(sceneNow)), [sceneNow]);
  const clock = useMemo(() => (sceneNow === null ? null : brooklynClock(sceneNow)), [sceneNow]);

  const setSceneTime = useCallback(
    (minutes: number) => {
      const now = Date.now();
      setRealNow(now);
      changeLook({ clockOffsetMs: offsetForClockTime(now, minutes) });
    },
    [changeLook],
  );
  const snapToNow = useCallback(() => {
    setRealNow(Date.now());
    changeLook({ clockOffsetMs: 0 });
  }, [changeLook]);

  const provider = useMemo(
    () => (settings ? { ready: settings.apiKey.set, model: settings.model } : null),
    [settings],
  );

  return (
    <div
      className={`ogchat ${styles.shell} ${look.wallShown ? "" : styles.noWall}`}
      style={lookVariables(look) as CSSProperties}
    >
      {ready && view && <Backdrop scene={look.scene} view={view} people={look.people} />}
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
          <div className={styles.topTools}>
            <div className={styles.sceneSwitch} role="group" aria-label="Scene">
              {SCENE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.sceneButton} ${id === look.scene ? styles.sceneActive : ""}`}
                  aria-pressed={id === look.scene}
                  title={SCENES[id].config.hint}
                  onClick={() => changeLook({ scene: id })}
                >
                  {SCENES[id].config.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`${styles.lookButton} ${lookOpen ? styles.lookButtonOpen : ""}`}
              aria-haspopup="dialog"
              aria-expanded={lookOpen}
              title="Time of day, wall and text"
              onClick={() => setLookOpen((open) => !open)}
            >
              <span className={styles.lookClock}>{clock ? clock.label : "look"}</span>
              <span aria-hidden="true">{lookOpen ? "▴" : "▾"}</span>
            </button>
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

      {lookOpen && clock && (
        <LookPanel
          look={look}
          clock={clock}
          onChange={changeLook}
          onSetTime={setSceneTime}
          onSnapToNow={snapToNow}
          onClose={() => setLookOpen(false)}
        />
      )}

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
