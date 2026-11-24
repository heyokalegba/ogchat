"use client";

import { useEffect, useId, useState } from "react";
import type { ChatApi } from "@/lib/client/api";
import type { Environment, RepoChoice, SessionWork } from "@/lib/types";
import styles from "./shell.module.css";

/**
 * Where a chat works, set just above the message box: the GitHub repository
 * Claude is given, the branch its work starts from, and the environment its
 * commands run in. Each chat keeps its own, so two chats (or two windows)
 * can be at work on different repositories at once.
 */
export function WorkBar(props: {
  api: ChatApi;
  /** Whether there is a GitHub token: without one there is no repository to pick. */
  github: boolean;
  /** Whether Claude may run commands: without that an environment means nothing. */
  runCode: boolean;
  /** The repositories the token reaches; null while they are being asked for. */
  repos: RepoChoice[] | null;
  environments: Environment[];
  work: SessionWork;
  /** The repository of the chat's project, used when the chat picks none. */
  projectRepo: string | null;
  onChange: (patch: Partial<SessionWork>) => void;
  onOpenSettings: () => void;
  onEditEnvironments: () => void;
}) {
  const { work, repos, environments } = props;
  const id = useId();
  const [repo, setRepo] = useState(work.repo ?? "");
  const [branch, setBranch] = useState(work.branch ?? "");
  const [branches, setBranches] = useState<{ names: string[]; main: string } | null>(null);
  useEffect(() => setRepo(work.repo ?? ""), [work.repo]);
  useEffect(() => setBranch(work.branch ?? ""), [work.branch]);

  // The branches of whichever repository is in use, for the branch box to offer.
  const inUse = work.repo ?? props.projectRepo;
  const { api, github } = props;
  useEffect(() => {
    setBranches(null);
    if (!github || !work.repo) return;
    let current = true;
    api.listBranches(work.repo).then(
      (found) => current && setBranches({ names: found.branches, main: found.defaultBranch }),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [api, github, work.repo]);

  const cleanRepo = (text: string) =>
    text
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
  const repoOk = (text: string) =>
    !text || /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(text);
  const commitRepo = (text: string) => {
    const next = cleanRepo(text);
    if (!repoOk(next)) return;
    setRepo(next);
    if (next !== (work.repo ?? "")) props.onChange({ repo: next || null, branch: null });
  };
  const commitBranch = (text: string) => {
    const next = text.trim();
    if (next !== (work.branch ?? "")) props.onChange({ branch: next || null });
  };

  if (!github) {
    return (
      <div className={styles.workBar}>
        <button type="button" className={styles.workLink} onClick={props.onOpenSettings}>
          add a GitHub token in settings to work on a repository
        </button>
      </div>
    );
  }

  const environment = work.environmentId ?? "default";
  return (
    <div className={styles.workBar} role="group" aria-label="Where this chat works">
      <label className={styles.workField}>
        <span className={styles.workLabel}>repo</span>
        <input
          className={styles.workInput}
          value={repo}
          list={`${id}-repos`}
          placeholder={
            props.projectRepo ? `${props.projectRepo} (project)` : repos ? "owner/name" : "loading…"
          }
          aria-label="Repository for this chat"
          aria-invalid={!repoOk(cleanRepo(repo))}
          title="The GitHub repository Claude works on in this chat. Pick one your token reaches, or type owner/name. Empty: the project's, or none."
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setRepo(event.target.value);
            // Picked from the list: take it at once.
            if (repos?.some((r) => r.name === event.target.value)) commitRepo(event.target.value);
          }}
          onBlur={(event) => commitRepo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRepo(event.currentTarget.value);
            }
          }}
        />
        <datalist id={`${id}-repos`}>
          {(repos ?? []).map((r) => (
            <option key={r.name} value={r.name}>
              {r.private ? "private" : "public"}
            </option>
          ))}
        </datalist>
      </label>

      {work.repo && (
        <label className={styles.workField}>
          <span className={styles.workLabel}>branch</span>
          <input
            className={`${styles.workInput} ${styles.workBranch}`}
            value={branch}
            list={`${id}-branches`}
            placeholder={branches?.main ?? "default"}
            aria-label="Branch this chat works from"
            title="The branch Claude reads, and the one its pull request goes into. Its own changes always go to a branch of the chat's. Empty: the repository's default branch."
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setBranch(event.target.value);
              if (branches?.names.includes(event.target.value)) commitBranch(event.target.value);
            }}
            onBlur={(event) => commitBranch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitBranch(event.currentTarget.value);
              }
            }}
          />
          <datalist id={`${id}-branches`}>
            {(branches?.names ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      )}

      {props.runCode ? (
        <label className={styles.workField}>
          <span className={styles.workLabel}>env</span>
          <select
            className={styles.workSelect}
            value={environments.some((e) => e.id === environment) ? environment : "default"}
            aria-label="Environment for this chat"
            title="The environment Claude's commands run in: its setup script, its variables, and whether it has the network."
            onChange={(event) => {
              if (event.target.value === "__edit") return props.onEditEnvironments();
              props.onChange({
                environmentId: event.target.value === "default" ? null : event.target.value,
              });
            }}
          >
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.network === "none" ? " (no network)" : ""}
              </option>
            ))}
            <option value="__edit">edit environments…</option>
          </select>
        </label>
      ) : (
        inUse && (
          <button
            type="button"
            className={styles.workLink}
            onClick={props.onOpenSettings}
            title="Claude can read and change the repository. To let it run the tests or a build as well, switch on Let Claude run code in settings."
          >
            read and edit only
          </button>
        )
      )}
    </div>
  );
}
