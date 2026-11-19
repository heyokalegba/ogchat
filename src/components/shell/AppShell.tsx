"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChatSurface } from "@/components/chat";
import { MenuIcon } from "@/components/chat/icons";
import "@/components/chat/theme.css";
import { createApi } from "@/lib/client/api";
import {
  atBrooklynDate,
  brooklynClock,
  brooklynDate,
  brooklynHour,
  FIRST_DATE,
  offsetForClockTime,
  readSky,
} from "@/lib/daylight";
import {
  conditionsFor,
  conditionsOf,
  inventedAt,
  readingAtHour,
  seasonAt,
  type Reading,
} from "@/lib/weather";
import { useWeather } from "./useWeather";
import type { Project, PublicSettings, ReasoningEffort, SessionMeta } from "@/lib/types";
import { SCENES, type SceneId } from "./art";
import { Backdrop } from "./Backdrop";
import { DEFAULT_LOOK, loadLook, lookVariables, saveLook, type Look } from "./look";
import { LookPanel } from "./LookPanel";
import { ProjectPanel } from "./ProjectPanel";
import { SettingsPanel } from "./SettingsPanel";
import styles from "./shell.module.css";
import { Sidebar } from "./Sidebar";

const SEARCH_DEBOUNCE_MS = 140;
const PROJECT_KEY = "ogchat:project";
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
  /** Projects, which one's chats are listed (null: all), and which one is open for editing. */
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  /** The open session's details, kept even when a filter leaves it out of the list. */
  const [activeMeta, setActiveMeta] = useState<SessionMeta | null>(null);
  const projectRef = useRef<string | null>(null);
  /** When the street was first opened (from the server), and a look ahead at its wear. */
  const [builtAt, setBuiltAt] = useState<number | null>(null);
  const [peekYears, setPeekYears] = useState(0);
  const queryRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const refreshSessions = useCallback(
    async (q: string, signal?: AbortSignal) => {
      try {
        const project = projectRef.current;
        const next = await api.listSessions(q, signal, project);
        if (signal?.aborted || queryRef.current !== q || projectRef.current !== project) return;
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
    try {
      projectRef.current = window.localStorage.getItem(PROJECT_KEY) || null;
      setProjectId(projectRef.current);
    } catch {
      // storage unavailable: start on all chats
    }
    setReady(true);
    void refreshSessions("");
    api.listProjects().then(
      (list) => {
        setProjects(list);
        // The remembered project may have been deleted since.
        if (projectRef.current && !list.some((p) => p.id === projectRef.current)) {
          projectRef.current = null;
          setProjectId(null);
          void refreshSessions(queryRef.current);
        }
      },
      () => {},
    );
    api.getSettings().then(setSettings, () => {});
    api.getWorld().then(
      (world) => setBuiltAt(Date.parse(world.builtAt)),
      () => {},
    );
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

  const refreshProjects = useCallback(() => {
    api.listProjects().then(setProjects, () => {});
  }, [api]);

  const onProjectChange = useCallback(
    (id: string | null) => {
      projectRef.current = id;
      setProjectId(id);
      try {
        if (id) window.localStorage.setItem(PROJECT_KEY, id);
        else window.localStorage.removeItem(PROJECT_KEY);
      } catch {
        // not remembered, still applied
      }
      void refreshSessions(queryRef.current);
    },
    [refreshSessions],
  );

  const onNewProject = useCallback(
    async (name: string) => {
      try {
        const project = await api.createProject(name);
        setProjects((current) =>
          [...current, project].sort((a, b) => a.name.localeCompare(b.name)),
        );
        onProjectChange(project.id);
        // Straight into its panel: a project is not much use without instructions or files.
        setEditingProject(project.id);
      } catch {
        refreshProjects();
      }
    },
    [api, onProjectChange, refreshProjects],
  );

  const open = useCallback((id: string | null) => {
    setActiveId(id);
    setOpenToken((n) => n + 1);
    setSidebarOpen(false);
    if (sessionFromUrl() !== id) writeUrl(id, "push");
  }, []);

  const upsert = useCallback((session: SessionMeta) => {
    setSessions((current) => {
      const known = current.some((s) => s.id === session.id);
      // A session that is not in the project being shown does not belong in the list.
      const project = projectRef.current;
      if (project && session.projectId !== project) {
        return known ? current.filter((s) => s.id !== session.id) : current;
      }
      // While a search is active, do not add sessions that the search did not return.
      if (!known && queryRef.current) return current;
      const next = known
        ? current.map((s) => (s.id === session.id ? session : s))
        : [session, ...current];
      return next.sort(newestFirst);
    });
    setActiveTitle((current) => (session.id === activeIdRef.current ? session.title : current));
    if (session.id === activeIdRef.current) setActiveMeta(session);
  }, []);

  const onSessionCreated = useCallback(
    (session: SessionMeta) => {
      activeIdRef.current = session.id;
      setActiveId(session.id);
      setActiveTitle(session.title);
      writeUrl(session.id, "replace");
      upsert(session);
      if (session.projectId) refreshProjects();
    },
    [upsert, refreshProjects],
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
      refreshProjects();
    },
    [api, open, refreshSessions, refreshProjects],
  );

  const openSettings = useCallback(() => {
    setSidebarOpen(false);
    setSettingsOpen(true);
    // Pick up changes made outside the app, such as an edited .env.local.
    api.getSettings().then(setSettings, () => {});
  }, [api]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  /** The composer's thinking button: applied at once, saved in the background. */
  const onReasoningChange = useCallback(
    (reasoning: ReasoningEffort) => {
      setSettings((current) => (current ? { ...current, reasoning } : current));
      api.saveSettings({ reasoning }).then(setSettings, () => {});
    },
    [api],
  );

  const changeLook = useCallback((patch: Partial<Look>) => {
    setLook((current) => {
      const next = { ...current, ...patch };
      saveLook(next);
      return next;
    });
  }, []);

  // With the chat put away, Escape brings it back.
  useEffect(() => {
    if (look.chatShown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lookOpen && !settingsOpen) changeLook({ chatShown: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [look.chatShown, lookOpen, settingsOpen, changeLook]);

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
  // The day the scene is set to: a past one from the look panel, or none, which is today.
  const today = realNow === null ? null : brooklynDate(realNow);
  const heldDate =
    today !== null && look.date >= FIRST_DATE && look.date < today ? look.date : null;
  // On a past day the scene keeps the time of day it would have had today.
  const sceneNow =
    realNow === null
      ? null
      : heldDate
        ? atBrooklynDate(realNow + look.clockOffsetMs, heldDate)
        : realNow + look.clockOffsetMs;
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

  // The session on screen, as the list knows it, and the project named in the title:
  // the open session's own, or for a new chat the one it will be filed under.
  const activeSession =
    (activeMeta?.id === activeId ? activeMeta : null) ??
    sessions.find((session) => session.id === activeId) ??
    null;
  const titleProject =
    projects.find((p) => p.id === (activeId ? activeSession?.projectId : projectId)) ?? null;
  const panelProject = projects.find((p) => p.id === editingProject) ?? null;

  // How old the street is, in days, by the real clock: what its wear is counted from.
  const streetDays =
    builtAt === null || realNow === null ? 0 : Math.max(0, (realNow - builtAt) / 86_400_000);

  // The season: the calendar's on the scene's day, unless the look panel holds it.
  const season =
    look.season === "auto"
      ? seasonAt(sceneNow ?? 0)
      : look.season === "snow"
        ? "winter"
        : look.season;

  // The weather: New York's own, now or on the scene's day; or one kind held; or,
  // with live weather off or out of reach, made up by the clock.
  const liveWanted = look.weather === "live";
  const feed = useWeather(api, liveWanted && realNow !== null, heldDate);
  const reading: Reading | null = heldDate
    ? feed.day && readingAtHour(feed.day, brooklynHour(sceneNow ?? 0))
    : feed.now;
  const conditions =
    look.weather !== "live" && look.weather !== "invented"
      ? conditionsFor(look.weather, look.weather === "snow" && season === "winter")
      : reading
        ? conditionsOf(reading)
        : inventedAt(sceneNow ?? 0, season);
  // Winter is drawn white when it is held that way, or when snow is really lying.
  const snowy =
    look.season === "snow" ||
    (conditions.snowLying && (look.season === "auto" || look.season === "winter"));

  const provider = useMemo(
    () => (settings ? { ready: settings.apiKey.set, model: settings.model } : null),
    [settings],
  );

  return (
    <div
      className={`ogchat ${styles.shell} ${look.wallShown ? "" : styles.noWall} ${
        look.chatShown ? "" : styles.sceneOnly
      }`}
      style={lookVariables(look) as CSSProperties}
    >
      {ready && view && (
        <Backdrop
          scene={look.scene}
          view={view}
          now={sceneNow ?? 0}
          season={season}
          snowy={snowy}
          conditions={conditions}
          age={streetDays + peekYears * 365}
          people={look.people}
          still={look.still}
        />
      )}
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
        projects={projects}
        projectId={projectId}
        onProjectChange={onProjectChange}
        onNewProject={onNewProject}
        onEditProject={(id) => {
          setSidebarOpen(false);
          setEditingProject(id);
        }}
        onResize={(width) => changeLook({ sidebarWidth: Math.round(width / 10) * 10 })}
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
            <span className={styles.topPath}>~/{titleProject ? `${titleProject.name}/` : ""}</span>
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
              className={`${styles.lookButton} ${look.chatShown ? "" : styles.lookButtonOpen}`}
              aria-pressed={!look.chatShown}
              title={
                look.chatShown
                  ? "Put the chat away and just look at the scene"
                  : "Bring the chat back (Esc)"
              }
              onClick={() => changeLook({ chatShown: !look.chatShown })}
            >
              {look.chatShown ? "hide chat" : "show chat"}
            </button>
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
              projectId={projectId}
              reasoning={settings?.reasoning}
              onReasoningChange={settings ? onReasoningChange : undefined}
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
          season={season}
          conditions={conditions}
          reading={liveWanted ? reading : null}
          weatherProblem={feed.problem}
          today={today ?? ""}
          heldDate={heldDate}
          streetDays={streetDays}
          peekYears={peekYears}
          onPeek={setPeekYears}
        />
      )}

      {panelProject && (
        <ProjectPanel
          key={panelProject.id}
          api={api}
          project={panelProject}
          session={activeSession}
          onClose={() => setEditingProject(null)}
          onChanged={(next) =>
            setProjects((current) =>
              current
                .map((p) => (p.id === next.id ? next : p))
                .sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
          onSessionMoved={(session) => {
            upsert(session);
            setActiveMeta(session);
            refreshProjects();
            void refreshSessions(queryRef.current);
          }}
          onDeleted={(id) => {
            setEditingProject(null);
            setProjects((current) => current.filter((p) => p.id !== id));
            if (projectRef.current === id) onProjectChange(null);
            else void refreshSessions(queryRef.current);
          }}
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
