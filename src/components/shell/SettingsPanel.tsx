"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type ChatApi } from "@/lib/client/api";
import {
  REASONING_EFFORTS,
  type PublicSettings,
  type ProviderChoice,
  type ReasoningEffort,
  type SettingsCheck,
} from "@/lib/types";
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
 *
 * "test" tries what is in the form right now, saved or not, and says in plain
 * words which part works and which does not: the key, the model id, credits.
 */
export function SettingsPanel({ api, settings, onClose, onSaved }: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningEffort>(settings.reasoning);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [contextWindow, setContextWindow] = useState(String(settings.contextWindow));
  const [removeKey, setRemoveKey] = useState(false);
  const [provider, setProvider] = useState<ProviderChoice>(settings.provider);
  const [claudeModel, setClaudeModel] = useState(settings.claude.model);
  const [claudeKey, setClaudeKey] = useState("");
  const [dropClaudeKey, setDropClaudeKey] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [dropGithub, setDropGithub] = useState(false);
  const listed = settings.claude.models.some((one) => one.id === claudeModel);
  const pick = (next: ProviderChoice) => {
    setProvider(next);
    setCheck(null);
  };
  /** What is in the form for Claude and GitHub, as a save or a test would send it. */
  const claudeFields = () => ({
    provider,
    ...(provider === "claude" ? { claudeModel } : {}),
    ...(claudeKey.trim()
      ? { claudeKey: claudeKey.trim() }
      : dropClaudeKey
        ? { claudeKey: null }
        : {}),
    ...(githubToken.trim()
      ? { githubToken: githubToken.trim() }
      : dropGithub
        ? { githubToken: null }
        : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [check, setCheck] = useState<SettingsCheck | null>(null);
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
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "input, select, textarea, button:not(:disabled)",
      );
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

  const onTest = async () => {
    if (testing) return;
    setTesting(true);
    setError(null);
    setCheck(null);
    try {
      const typed = apiKey.trim();
      setCheck(
        await api.testSettings({
          baseUrl,
          model,
          ...(typed ? { apiKey: typed } : {}),
          ...claudeFields(),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run the test.");
    } finally {
      setTesting(false);
    }
  };

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
        reasoning,
        systemPrompt,
        contextWindow: Number(contextWindow.replace(/[,_\s]/g, "")) || 0,
        ...claudeFields(),
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
            <span className={styles.label} id="ogchat-provider">
              Provider
            </span>
            <div className={styles.providerSwitch} role="group" aria-labelledby="ogchat-provider">
              <button
                type="button"
                className={`${styles.providerButton} ${provider === "compatible" ? styles.providerActive : ""}`}
                aria-pressed={provider === "compatible"}
                onClick={() => pick("compatible")}
              >
                any provider
              </button>
              <button
                type="button"
                className={`${styles.providerButton} ${provider === "claude" ? styles.providerActive : ""}`}
                aria-pressed={provider === "claude"}
                onClick={() => pick("claude")}
              >
                claude
              </button>
            </div>
            <p className={styles.help}>
              {provider === "claude"
                ? "Claude, from Anthropic, on your own API credit. With a GitHub token it can also read and change a repository you tie to a project."
                : "Any provider that speaks the OpenAI chat format, by its address, model id and key."}
            </p>
          </div>

          {provider === "compatible" && (
            <>
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
                      Using the key from <code>.env.local</code>. A key entered here is saved on
                      this machine and takes precedence.
                    </>
                  ) : savedKey ? (
                    <>
                      A key is saved in <code>data/settings.json</code> on this machine. Type a new
                      one to replace it.
                    </>
                  ) : (
                    <>
                      Saved to <code>data/settings.json</code> on this machine only. It is sent to
                      the provider and nowhere else.
                    </>
                  )}
                </p>
              </div>
            </>
          )}

          {provider === "claude" && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-claude-model">
                  Claude model
                </label>
                <select
                  id="ogchat-claude-model"
                  className={styles.textInput}
                  value={listed ? claudeModel : "other"}
                  onChange={(event) =>
                    setClaudeModel(event.target.value === "other" ? "" : event.target.value)
                  }
                >
                  {settings.claude.models.map((one) => (
                    <option key={one.id} value={one.id}>
                      {one.label} ({one.id})
                    </option>
                  ))}
                  <option value="other">another model id…</option>
                </select>
                {!listed && (
                  <input
                    className={styles.textInput}
                    value={claudeModel}
                    placeholder="claude-…"
                    aria-label="Claude model id"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    onChange={(event) => setClaudeModel(event.target.value)}
                  />
                )}
                <p className={styles.help}>
                  Opus is the most capable of the usual three and costs the most per message; Sonnet
                  is about half the price; Haiku is far cheaper and quicker. What you pay is by the
                  token, on your Anthropic account.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="ogchat-claude-key">
                    Claude API key
                  </label>
                  {settings.claude.key.source === "settings" && !claudeKey && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setDropClaudeKey((value) => !value)}
                    >
                      {dropClaudeKey ? "keep saved key" : "remove saved key"}
                    </button>
                  )}
                </div>
                <input
                  id="ogchat-claude-key"
                  className={styles.textInput}
                  type="password"
                  value={claudeKey}
                  placeholder={
                    dropClaudeKey
                      ? "the saved key will be removed"
                      : (settings.claude.key.masked ?? "sk-ant-…")
                  }
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(event) => {
                    setClaudeKey(event.target.value);
                    if (event.target.value) setDropClaudeKey(false);
                  }}
                />
                <p className={styles.help}>
                  From console.anthropic.com, under API keys. Saved to{" "}
                  <code>data/settings.json</code> on this machine only, and sent to Anthropic and
                  nowhere else.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="ogchat-github-token">
                    GitHub token
                  </label>
                  {settings.github.source === "settings" && !githubToken && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setDropGithub((value) => !value)}
                    >
                      {dropGithub ? "keep saved token" : "remove saved token"}
                    </button>
                  )}
                </div>
                <input
                  id="ogchat-github-token"
                  className={styles.textInput}
                  type="password"
                  value={githubToken}
                  placeholder={
                    dropGithub
                      ? "the saved token will be removed"
                      : (settings.github.masked ?? "github_pat_… (optional)")
                  }
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(event) => {
                    setGithubToken(event.target.value);
                    if (event.target.value) setDropGithub(false);
                  }}
                />
                <p className={styles.help}>
                  Optional. Lets Claude read and change the repository tied to a project. Make a
                  fine-grained token on GitHub (Settings, Developer settings) that covers only the
                  repositories you choose, with <code>Contents</code> and <code>Pull requests</code>{" "}
                  set to read and write. Claude writes only to a branch of its own and opens pull
                  requests; it cannot touch your main branch or merge.
                </p>
              </div>
            </>
          )}

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="ogchat-reasoning">
                Thinking
              </label>
            </div>
            <select
              id="ogchat-reasoning"
              className={styles.textInput}
              value={reasoning}
              onChange={(event) => setReasoning(event.target.value as ReasoningEffort)}
            >
              {REASONING_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort === "default" ? "auto (the provider decides)" : effort}
                </option>
              ))}
            </select>
            <p className={styles.help}>
              How hard the model reasons before it answers. Also on the <code>think</code> button by
              the message box.{" "}
              {provider === "claude" ? (
                <>
                  With Claude, auto leaves it to the model, and its thoughts are shown in summary.
                </>
              ) : (
                <>
                  On <code>abliterated-model-large-v2</code>, medium and high are the same level,
                  and auto means max.
                </>
              )}
            </p>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="ogchat-system-prompt">
                System prompt
              </label>
              {systemPrompt && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setSystemPrompt("")}
                >
                  clear
                </button>
              )}
            </div>
            <textarea
              id="ogchat-system-prompt"
              className={`${styles.textInput} ${styles.textArea}`}
              rows={4}
              value={systemPrompt}
              placeholder="Standing instructions for every conversation. Leave empty for none."
              spellCheck
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <p className={styles.help}>
              Sent ahead of every conversation, old and new, from the next message on.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ogchat-context-window">
              Context window
            </label>
            <input
              id="ogchat-context-window"
              className={styles.textInput}
              inputMode="numeric"
              value={contextWindow}
              placeholder="1000000"
              autoComplete="off"
              onChange={(event) => setContextWindow(event.target.value)}
            />
            <p className={styles.help}>
              How many tokens the model can take in at once: the meter under the message box
              measures each conversation against it.{" "}
              {provider === "claude" ? (
                <>Set it to what your Claude model takes if that is not the figure here.</>
              ) : (
                <>
                  <code>abliterated-model-large-v2</code> is listed at 1,000,000. Leave empty for
                  that.
                </>
              )}
            </p>
          </div>

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          {(testing || check) && (
            <div className={styles.check} role="status" aria-live="polite">
              {testing ? (
                <p className={styles.checkLine}>
                  <span className={styles.checkMark} data-state="wait" aria-hidden="true">
                    ··
                  </span>
                  <span>Asking the provider. A reasoning model can take a few seconds.</span>
                </p>
              ) : (
                check?.steps.map((step) => {
                  const state = step.ok === true ? "ok" : step.ok === false ? "fail" : "note";
                  return (
                    <p key={step.id} className={styles.checkLine}>
                      <span className={styles.checkMark} data-state={state}>
                        {state === "ok" ? "ok" : state === "fail" ? "no" : "?"}
                      </span>
                      <span>
                        <b>{step.title}</b> {step.detail}
                      </span>
                    </p>
                  );
                })
              )}
            </div>
          )}

          <div className={styles.panelActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonTest}`}
              onClick={onTest}
              disabled={testing || removeKey}
              title="Tries the key, model and base URL above with one tiny message. Nothing is saved."
            >
              {testing ? "testing…" : "test"}
            </button>
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
