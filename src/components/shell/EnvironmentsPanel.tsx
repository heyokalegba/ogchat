"use client";

import { useEffect, useState } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import type { Environment } from "@/lib/types";
import { CloseIcon } from "../chat/icons";
import styles from "./shell.module.css";

const varsToText = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");

/** NAME=value lines into a set of variables. Blank lines and # comments are skipped. */
function textToVars(text: string): Record<string, string> | string {
  const vars: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) return `"${line.slice(0, 40)}" is not NAME=value.`;
    vars[line.slice(0, at).trim()] = line.slice(at + 1);
  }
  return vars;
}

/**
 * The environments: make one, change one, delete one. An environment is a
 * setup script, some variables and a network switch for the folder Claude
 * runs commands in; a chat picks one in the bar above its message box.
 */
export function EnvironmentsPanel(props: {
  api: ChatApi;
  environments: Environment[];
  /** The one to show first. */
  startId: string | null;
  onClose: () => void;
  onChanged: (environments: Environment[]) => void;
}) {
  const { api, environments } = props;
  const own = environments.filter((e) => e.id !== "default");
  const [id, setId] = useState<string | null>(
    own.some((e) => e.id === props.startId) ? props.startId : (own[0]?.id ?? null),
  );
  const current = own.find((e) => e.id === id) ?? null;
  const [name, setName] = useState("");
  const [network, setNetwork] = useState<Environment["network"]>("full");
  const [setup, setSetup] = useState("");
  const [vars, setVars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(current?.name ?? "");
    setNetwork(current?.network ?? "full");
    setSetup(current?.setup ?? "");
    setVars(current ? varsToText(current.vars) : "");
    setError(null);
    // Only when another environment is chosen, not on every save of this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => props.onChanged(await api.listEnvironments());

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
        aria-labelledby="ogchat-environments-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!current) return;
          const parsed = textToVars(vars);
          if (typeof parsed === "string") return setError(parsed);
          void attempt(async () => {
            await api.updateEnvironment(current.id, { name, network, setup, vars: parsed });
            await reload();
            setSaved(true);
          });
        }}
      >
        <div className={styles.panelHead}>
          <h2 id="ogchat-environments-title" className={styles.panelTitle}>
            environments
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            onClick={props.onClose}
            aria-label="Close environments"
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.field}>
            <p className={styles.help}>
              An environment sets up the folder Claude runs commands in: a script that gets it
              ready, variables for its commands, and whether they may use the network. Pick one for
              a chat in the bar above its message box. The <code>Default</code> one has no setup, no
              variables, and the network.
            </p>
            <div className={styles.workRow}>
              <select
                className={styles.textInput}
                value={id ?? ""}
                aria-label="Environment to edit"
                onChange={(event) => setId(event.target.value || null)}
              >
                {own.length === 0 && <option value="">no environments of your own yet</option>}
                {own.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() =>
                  void attempt(async () => {
                    const made = await api.createEnvironment({ name: "New environment" });
                    await reload();
                    setId(made.id);
                  })
                }
              >
                new
              </button>
            </div>
          </div>

          {current && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-env-name">
                  Name
                </label>
                <input
                  id="ogchat-env-name"
                  className={styles.textInput}
                  value={name}
                  maxLength={60}
                  autoComplete="off"
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-env-network">
                  Network
                </label>
                <select
                  id="ogchat-env-network"
                  className={styles.textInput}
                  value={network}
                  onChange={(event) => setNetwork(event.target.value as Environment["network"])}
                >
                  <option value="full">allowed: commands can download and install</option>
                  <option value="none">none: commands are cut off from the network</option>
                </select>
                <p className={styles.help}>
                  With none, nothing a command reads can be sent anywhere. The setup script below
                  still gets the network, so it can install what the commands need. Cutting the
                  network off needs the Mac sandbox; elsewhere this setting cannot be enforced.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-env-setup">
                  Setup script
                </label>
                <textarea
                  id="ogchat-env-setup"
                  className={`${styles.textInput} ${styles.textArea} ${styles.codeArea}`}
                  value={setup}
                  placeholder={"npm install\n# or: pip install -r requirements.txt"}
                  spellCheck={false}
                  onChange={(event) => setSetup(event.target.value)}
                />
                <p className={styles.help}>
                  Shell commands, run once in a chat&apos;s folder (inside its copy of the
                  repository) before Claude&apos;s first command there, and again if you change the
                  script. Ten minutes at most.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-env-vars">
                  Variables
                </label>
                <textarea
                  id="ogchat-env-vars"
                  className={`${styles.textInput} ${styles.textArea} ${styles.codeArea}`}
                  value={vars}
                  placeholder={"NODE_ENV=test\nDATABASE_URL=postgres://localhost/dev"}
                  spellCheck={false}
                  onChange={(event) => setVars(event.target.value)}
                />
                <p className={styles.help}>
                  One <code>NAME=value</code> a line. Given to the setup script and to every
                  command. Kept on this machine in a file only you can read; Claude can see them by
                  running a command, so put a key here only if you mean it to be used.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <div className={styles.panelActions}>
            {current && (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() =>
                  void attempt(async () => {
                    await api.deleteEnvironment(current.id);
                    await reload();
                    setId(own.find((e) => e.id !== current.id)?.id ?? null);
                  })
                }
              >
                delete
              </button>
            )}
            <button type="button" className={styles.button} onClick={props.onClose}>
              close
            </button>
            {current && (
              <button
                type="submit"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={busy || !name.trim()}
              >
                {busy ? "saving…" : saved ? "saved" : "save"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
