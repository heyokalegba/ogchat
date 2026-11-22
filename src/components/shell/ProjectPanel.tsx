"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import { formatBytes, MAX_PROJECT_FILES } from "@/lib/limits";
import type { Project, SessionMeta } from "@/lib/types";
import { CloseIcon } from "../chat/icons";
import styles from "./shell.module.css";

export interface ProjectPanelProps {
  api: ChatApi;
  project: Project;
  /** The session on screen, so it can be filed under this project or taken out of it. */
  session: SessionMeta | null;
  onClose: () => void;
  /** The project changed (renamed, instructions or files edited, session moved). */
  onChanged: (project: Project) => void;
  onSessionMoved: (session: SessionMeta) => void;
  onDeleted: (id: string) => void;
}

/**
 * One project: its name, the instructions every chat in it starts from, and
 * its files. Files are added and removed as you go; the name and the
 * instructions are saved with the button.
 */
export function ProjectPanel(props: ProjectPanelProps) {
  const { api, project, session } = props;
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions);
  const [repo, setRepo] = useState(project.repo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  /** Runs one change against the server, reporting what went wrong in plain words. */
  const attempt = async (work: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const dirty =
    name.trim() !== project.name ||
    instructions.trim() !== project.instructions ||
    repo.trim() !== (project.repo ?? "");
  const inProject = session?.projectId === project.id;

  return (
    <div
      className={`ogchat ${styles.overlay}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <form
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ogchat-project-title"
        onSubmit={(event) => {
          event.preventDefault();
          void attempt(async () => {
            props.onChanged(
              await api.updateProject(project.id, { name, instructions, repo: repo.trim() }),
            );
            props.onClose();
          }, "Could not save the project.");
        }}
      >
        <div className={styles.panelHead}>
          <h2 id="ogchat-project-title" className={styles.panelTitle}>
            project
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            onClick={props.onClose}
            aria-label="Close project"
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ogchat-project-name">
              Name
            </label>
            <input
              ref={first}
              id="ogchat-project-name"
              className={styles.textInput}
              type="text"
              value={name}
              maxLength={80}
              autoComplete="off"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ogchat-project-instructions">
              Instructions
            </label>
            <textarea
              id="ogchat-project-instructions"
              className={`${styles.textInput} ${styles.textArea}`}
              rows={5}
              value={instructions}
              placeholder="What every chat in this project should know or do."
              spellCheck
              onChange={(event) => setInstructions(event.target.value)}
            />
            <p className={styles.help}>
              Sent ahead of every chat in this project, after your system prompt, together with the
              files below.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ogchat-project-repo">
              GitHub repository
            </label>
            <input
              id="ogchat-project-repo"
              className={styles.textInput}
              value={repo}
              placeholder="owner/name, or paste its address"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setRepo(event.target.value)}
            />
            <p className={styles.help}>
              Optional. With Claude as the provider and a GitHub token in settings, chats in this
              project can read this repository and change it: every change goes to a branch named
              after the chat, and reaches your main branch only through a pull request you merge.
            </p>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label}>
                Files · {project.files.length} of {MAX_PROJECT_FILES}
              </span>
              <button
                type="button"
                className={styles.linkButton}
                disabled={busy || project.files.length >= MAX_PROJECT_FILES}
                onClick={() => picker.current?.click()}
              >
                add files
              </button>
            </div>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length === 0) return;
                void attempt(
                  async () => props.onChanged(await api.addProjectFiles(project.id, files)),
                  "Could not add those files.",
                );
              }}
            />
            {project.files.length === 0 ? (
              <p className={styles.help}>
                No files yet. Text files, PDFs and images, the same as on a message. Their text is
                given to the model in every chat of the project.
              </p>
            ) : (
              <ul className={styles.fileList}>
                {project.files.map((file) => (
                  <li key={file.id} className={styles.fileRow}>
                    <a
                      className={styles.fileName}
                      href={api.projectFileUrl(project.id, file.id)}
                      target="_blank"
                      rel="noreferrer"
                      title={file.name}
                    >
                      {file.name}
                    </a>
                    <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      className={styles.linkButton}
                      disabled={busy}
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        void attempt(
                          async () =>
                            props.onChanged(await api.removeProjectFile(project.id, file.id)),
                          "Could not remove that file.",
                        )
                      }
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Sessions · {project.sessionCount}</span>
            {session ? (
              <p className={styles.help}>
                {inProject
                  ? "The chat on screen is in this project."
                  : "The chat on screen is not in this project."}{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={busy}
                  onClick={() =>
                    void attempt(async () => {
                      props.onSessionMoved(
                        await api.moveSession(session.id, inProject ? null : project.id),
                      );
                    }, "Could not move the chat.")
                  }
                >
                  {inProject ? "take it out" : "move it here"}
                </button>
              </p>
            ) : (
              <p className={styles.help}>
                New chats started while this project is selected are filed under it.
              </p>
            )}
          </div>

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <div className={styles.panelActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonTest}`}
              disabled={busy}
              title="Delete the project and its files. Its chats are kept."
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                void attempt(async () => {
                  await api.deleteProject(project.id);
                  props.onDeleted(project.id);
                }, "Could not delete the project.");
              }}
              onBlur={() => setConfirming(false)}
            >
              {confirming ? "really delete?" : "delete"}
            </button>
            <button type="button" className={styles.button} onClick={props.onClose}>
              {dirty ? "cancel" : "close"}
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={busy || !name.trim()}
            >
              {busy ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
