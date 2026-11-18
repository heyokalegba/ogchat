"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { shortAge } from "@/lib/format";
import type { Project, PublicSettings, SessionMeta } from "@/lib/types";
import { GearIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "../chat/icons";
import styles from "./shell.module.css";

export interface SidebarProps {
  sessions: SessionMeta[];
  activeId: string | null;
  query: string;
  /** False until the first list has loaded. */
  loaded: boolean;
  settings: PublicSettings | null;
  open: boolean;
  searchRef: Ref<HTMLInputElement>;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  projects: Project[];
  /** The project whose sessions are listed, or null for every chat. */
  projectId: string | null;
  onProjectChange: (id: string | null) => void;
  /** Asks for a new project with this name. */
  onNewProject: (name: string) => void;
  onEditProject: (id: string) => void;
  /** Called with the pointer's x while the sidebar's edge is dragged: the width asked for. */
  onResize?: (width: number) => void;
}

const CONFIRM_MS = 3000;

/** The sidebar's right edge: drag it, or use the arrow keys, to change the sidebar's width. */
function SidebarGrip({ onResize }: { onResize: (width: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={styles.sidebarGrip}
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      tabIndex={0}
      data-dragging={dragging}
      title="Drag to resize the sidebar"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (dragging) onResize(event.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const edge = event.currentTarget.getBoundingClientRect().left + 6;
        onResize(edge + (event.key === "ArrowLeft" ? -20 : 20));
      }}
    />
  );
}

function SessionItem(props: {
  session: SessionMeta;
  /** The name of the session's project, shown when the list mixes projects. */
  tag?: string;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { session, active } = props;
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    input.current?.focus();
    input.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const startRename = () => {
    setTitle(session.title);
    setRenaming(true);
  };

  const commit = () => {
    setRenaming(false);
    const next = title.replace(/\s+/g, " ").trim();
    if (next && next !== session.title) props.onRename(next);
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setRenaming(false);
    }
  };

  if (renaming) {
    return (
      <li className={`${styles.item} ${active ? styles.itemActive : ""}`}>
        <input
          ref={input}
          className={styles.renameInput}
          value={title}
          maxLength={120}
          aria-label="Session title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={onRenameKey}
          onBlur={commit}
        />
      </li>
    );
  }

  return (
    <li className={`${styles.item} ${active ? styles.itemActive : ""}`}>
      <button
        type="button"
        className={styles.itemButton}
        aria-current={active ? "true" : undefined}
        title={session.title}
        onClick={props.onSelect}
        onDoubleClick={startRename}
        onKeyDown={(event) => {
          if (event.key === "F2") startRename();
        }}
      >
        <span className={styles.itemTitle}>{session.title}</span>
        {props.tag && <span className={styles.itemTag}>{props.tag}</span>}
        <span className={styles.itemAge}>{shortAge(session.updatedAt)}</span>
      </button>
      <div className={styles.itemTools} data-pinned={confirming}>
        {confirming ? (
          <button
            type="button"
            className={`${styles.itemTool} ${styles.itemToolConfirm}`}
            onClick={props.onDelete}
            onBlur={() => setConfirming(false)}
          >
            delete?
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.itemTool}
              aria-label={`Rename ${session.title}`}
              title="Rename"
              onClick={startRename}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className={styles.itemTool}
              aria-label={`Delete ${session.title}`}
              title="Delete"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function Sidebar(props: SidebarProps) {
  const { sessions, activeId, query, loaded, settings, projects, projectId } = props;
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const project = projects.find((candidate) => candidate.id === projectId) ?? null;
  const projectName = (id: string | null) =>
    projects.find((candidate) => candidate.id === id)?.name;
  const [modKey, setModKey] = useState("⌘");
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("ctrl ");
  }, []);

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && sessions[0]) {
      event.preventDefault();
      props.onSelect(sessions[0].id);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      props.onQueryChange("");
    }
  };

  const keyStatus = !settings
    ? "settings"
    : settings.apiKey.set
      ? settings.model
      : "add an api key";

  return (
    <aside
      className={`${styles.sidebar} ${props.open ? styles.sidebarOpen : ""}`}
      aria-label="Sessions"
    >
      {props.onResize && <SidebarGrip onResize={props.onResize} />}
      <div className={styles.brandRow}>
        <span className={styles.brand}>
          ogchat
          <span className={styles.brandCaret} aria-hidden="true" />
        </span>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.newButton}`}
          onClick={props.onNew}
          aria-label="New session"
          title="New session"
        >
          <PlusIcon />
        </button>
      </div>

      <div className={styles.search}>
        <span className={styles.searchIcon}>
          <SearchIcon />
        </span>
        <input
          ref={props.searchRef}
          className={styles.searchInput}
          type="search"
          value={query}
          placeholder="search sessions"
          aria-label="Search sessions"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={onSearchKey}
        />
        {!query && <span className={styles.kbd}>{modKey}K</span>}
      </div>

      <div className={styles.projectRow}>
        {naming ? (
          <form
            className={styles.projectForm}
            onSubmit={(event) => {
              event.preventDefault();
              const name = newName.trim();
              setNaming(false);
              setNewName("");
              if (name) props.onNewProject(name);
            }}
          >
            <input
              className={styles.projectInput}
              value={newName}
              placeholder="project name"
              aria-label="New project name"
              maxLength={80}
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onBlur={() => setNaming(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setNaming(false);
                }
              }}
            />
          </form>
        ) : (
          <>
            <select
              className={styles.projectSelect}
              value={projectId ?? ""}
              aria-label="Project"
              title="Show one project's chats, or all of them"
              onChange={(event) => props.onProjectChange(event.target.value || null)}
            >
              <option value="">all chats</option>
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.sessionCount})
                </option>
              ))}
            </select>
            {project && (
              <button
                type="button"
                className={styles.projectTool}
                onClick={() => props.onEditProject(project.id)}
                aria-label={`Edit project ${project.name}`}
                title="Instructions and files for this project"
              >
                <GearIcon />
              </button>
            )}
            <button
              type="button"
              className={styles.projectTool}
              onClick={() => setNaming(true)}
              aria-label="New project"
              title="New project"
            >
              <PlusIcon />
            </button>
          </>
        )}
      </div>

      <div className={styles.listLabel}>
        {query.trim() ? "matches" : project ? `sessions in ${project.name}` : "sessions"}
      </div>
      <ul className={styles.list}>
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            tag={project ? undefined : projectName(session.projectId)}
            active={session.id === activeId}
            onSelect={() => props.onSelect(session.id)}
            onRename={(title) => props.onRename(session.id, title)}
            onDelete={() => props.onDelete(session.id)}
          />
        ))}
        {loaded && sessions.length === 0 && (
          <li className={styles.listEmpty}>
            {query.trim()
              ? "no sessions match."
              : project
                ? "nothing in this project yet. your first message here starts a chat in it."
                : "no sessions yet. your first message starts one."}
          </li>
        )}
      </ul>

      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={styles.settingsButton}
          onClick={props.onOpenSettings}
          aria-label="Open settings"
        >
          <span className={`${styles.dot} ${settings?.apiKey.set ? "" : styles.dotOff}`} />
          <span className={styles.settingsLabel}>{keyStatus}</span>
          <GearIcon />
        </button>
      </div>
    </aside>
  );
}
