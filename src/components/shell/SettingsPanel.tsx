"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import type { PublicSettings } from "@/lib/types";
import { CloseIcon } from "../chat/icons";
import styles from "./shell.module.css";

export interface SettingsPanelProps {
  api: ChatApi;
  settings: PublicSettings;
  onClose: () => void;
  onSaved: (settings: PublicSettings) => void;
}

/**
 * Provider settings: API base URL, API key, model id.
 *
 * The key field is write-only. A saved key is shown masked in the placeholder
 * and never sent back to the browser; typing replaces it.
 */
export function SettingsPanel({ api, settings, onClose, onSaved }: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      // Keep focus inside the dialog.
      const focusable = panel.current.querySelectorAll<HTMLElement>("input, button:not(:disabled)");
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savedKey = settings.apiKey.source === "settings" && !removeKey;
  const envKey = settings.apiKey.source === "env";
  const keyPlaceholder = removeKey
    ? "saved key will be removed"
    : (settings.apiKey.masked ?? "paste your API key");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const typed = apiKey.trim();
      const next = await api.saveSettings({
        baseUrl,
        model,
        ...(typed ? { apiKey: typed } : removeKey ? { apiKey: null } : {}),
      });
      setApiKey("");
      onSaved(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings.");
      setSaving(false);
    }
  };

  return (
    <div
      className={`ogchat ${styles.overlay}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ogchat-settings-title"
        onSubmit={onSubmit}
      >
        <div className={styles.panelHead}>
          <h2 id="ogchat-settings-title" className={styles.panelTitle}>
            settings
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="ogchat-base-url">
                API base URL
              </label>
              {baseUrl !== settings.defaults.baseUrl && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setBaseUrl(settings.defaults.baseUrl)}
                >
                  use default
                </button>
              )}
            </div>
            <input
              ref={first}
              id="ogchat-base-url"
              className={styles.textInput}
              type="url"
              inputMode="url"
              value={baseUrl}
              placeholder={settings.defaults.baseUrl}
              autoComplete="off"
              spellCheck={false}
              required
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="ogchat-model">
                Model id
              </label>
              {model !== settings.defaults.model && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setModel(settings.defaults.model)}
                >
                  use default
                </button>
              )}
            </div>
            <input
              id="ogchat-model"
              className={styles.textInput}
              type="text"
              value={model}
              placeholder={settings.defaults.model}
              autoComplete="off"
              spellCheck={false}
              required
              onChange={(event) => setModel(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="ogchat-api-key">
                API key
              </label>
              {settings.apiKey.source === "settings" && !apiKey && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setRemoveKey((value) => !value)}
                >
                  {removeKey ? "keep saved key" : "remove saved key"}
                </button>
              )}
            </div>
            <input
              id="ogchat-api-key"
              className={styles.textInput}
              type="password"
              value={apiKey}
              placeholder={keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              onChange={(event) => {
                setApiKey(event.target.value);
                if (event.target.value) setRemoveKey(false);
              }}
            />
            <p className={styles.help}>
              {envKey ? (
                <>
                  Using the key from <code>.env.local</code>. A key entered here is saved on this
                  machine and takes precedence.
                </>
              ) : savedKey ? (
                <>
                  A key is saved in <code>data/settings.json</code> on this machine. Type a new one
                  to replace it.
                </>
              ) : (
                <>
                  Saved to <code>data/settings.json</code> on this machine only. It is sent to the
                  provider and nowhere else.
                </>
              )}
            </p>
          </div>

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <div className={styles.panelActions}>
            <button type="button" className={styles.button} onClick={onClose}>
              cancel
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={saving}
            >
              {saving ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
