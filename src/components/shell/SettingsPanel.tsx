"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACCOUNT_COLORS, colorHex, nextAccountColor } from "@/lib/accounts";
import { ApiError, type ChatApi } from "@/lib/client/api";
import {
  MAIN_ACCOUNT,
  type ClaudeAccount,
  type PublicSettings,
  type ProviderChoice,
  type ReasoningEffort,
  type SettingsCheck,
} from "@/lib/types";
import { EFFORT_BLURB, EFFORT_LEVELS } from "@/lib/models";
import { CloseIcon } from "../chat/icons";
import styles from "./shell.module.css";

/** A Claude account as it stands in the form: what is typed, over what is saved. */
interface AccountDraft {
  id: string;
  name: string;
  configDir: string;
  workspace: string;
  /** The colour its chats are marked with. */
  color: string;
  /** A key typed for it, and whether its saved key is to be removed. */
  key: string;
  dropKey: boolean;
  /** As it is saved, or null for one added just now. */
  saved: ClaudeAccount | null;
}

const folderName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "two";

export interface SettingsPanelProps {
  api: ChatApi;
  settings: PublicSettings;
  onClose: () => void;
  onSaved: (settings: PublicSettings) => void;
  /** Open the help over the settings, which stay as they are underneath. */
  onHelp?: () => void;
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
export function SettingsPanel({ api, settings, onClose, onSaved, onHelp }: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningEffort>(settings.reasoning);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [contextWindow, setContextWindow] = useState(String(settings.contextWindow));
  const [removeKey, setRemoveKey] = useState(false);
  const [provider, setProvider] = useState<ProviderChoice>(settings.provider);
  const [claudeModel, setClaudeModel] = useState(settings.claude.model);
  /** The Claude accounts, the main one first, and the one the fields below are for. */
  const [accounts, setAccounts] = useState<AccountDraft[]>(() =>
    settings.claude.accounts.map((saved) => ({
      id: saved.id,
      name: saved.name,
      configDir: saved.configDir,
      workspace: saved.workspace,
      color: saved.color,
      key: "",
      dropKey: false,
      saved,
    })),
  );
  const [accountId, setAccountId] = useState(settings.claude.account);
  const main = accounts[0]!;
  const account = accounts.find((one) => one.id === accountId) ?? main;
  const isMain = account.id === MAIN_ACCOUNT;
  const editAccount = (patch: Partial<AccountDraft>) => {
    setAccounts((list) => list.map((one) => (one.id === account.id ? { ...one, ...patch } : one)));
    setCheck(null);
  };
  const addAccount = () => {
    const taken = new Set(accounts.map((one) => one.name.trim().toLowerCase()));
    let name = "work";
    for (let n = accounts.length + 1; taken.has(name); n++) name = `account ${n}`;
    const id = `a-${Math.random().toString(36).slice(2, 10)}`;
    setAccounts((list) => [
      ...list,
      {
        id,
        name,
        configDir: `~/.claude-${folderName(name)}`,
        workspace: "",
        color: nextAccountColor(list.map((one) => one.color)),
        key: "",
        dropKey: false,
        saved: null,
      },
    ]);
    setAccountId(id);
    setCheck(null);
  };
  const removeAccount = () => {
    setAccounts((list) => list.filter((one) => one.id !== account.id || one.id === MAIN_ACCOUNT));
    setAccountId(MAIN_ACCOUNT);
    setCheck(null);
  };
  const [githubToken, setGithubToken] = useState("");
  const [dropGithub, setDropGithub] = useState(false);
  const [runCode, setRunCode] = useState(settings.runCode.enabled);
  const listed = settings.claude.models.some((one) => one.id === claudeModel);
  const [codePermission, setCodePermission] = useState(settings.claudeCode.permission);
  const [codePath, setCodePath] = useState(settings.claudeCode.path);
  const pick = (next: ProviderChoice) => {
    setProvider(next);
    setCheck(null);
  };
  /** What is in the form for Claude and GitHub, as a save or a test would send it. */
  const claudeFields = () => ({
    provider,
    ...(provider === "claude" ? { runCode, claudeModel } : {}),
    ...(provider === "claudecode"
      ? { claudeCodePermission: codePermission, claudeCodePath: codePath.trim() }
      : {}),
    // The accounts: the one chosen is the one in use once this is saved.
    ...(provider !== "compatible"
      ? {
          claudeAccount: account.id,
          claudeMainName: main.name.trim(),
          claudeMainColor: main.color,
          claudeCodeConfigDir: main.configDir.trim(),
          claudeWorkspace: main.workspace.trim(),
          claudeAccounts: accounts.slice(1).map((one) => ({
            id: one.id,
            name: one.name.trim(),
            configDir: one.configDir.trim(),
            workspace: one.workspace.trim(),
            color: one.color,
            ...(one.key.trim() ? { key: one.key.trim() } : one.dropKey ? { key: null } : {}),
          })),
        }
      : {}),
    ...(main.key.trim() ? { claudeKey: main.key.trim() } : main.dropKey ? { claudeKey: null } : {}),
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
          <span className={styles.panelTools}>
            {onHelp && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={onHelp}
                title="Where things are, and how to use them. Settings stay open underneath."
              >
                help
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Close settings"
            >
              <CloseIcon />
            </button>
          </span>
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
              <button
                type="button"
                className={`${styles.providerButton} ${provider === "claudecode" ? styles.providerActive : ""}`}
                aria-pressed={provider === "claudecode"}
                onClick={() => pick("claudecode")}
              >
                claude code
              </button>
            </div>
            <p className={styles.help}>
              {provider === "claude"
                ? "Claude, from Anthropic, through the API. Replies are paid for in API tokens, on your API key; your plan's usage limits are not touched. With a GitHub token it can also read and change a repository you tie to a project."
                : provider === "claudecode"
                  ? "Claude Code, the program on this computer, on the account it is signed in to in Terminal. Signed in to a Claude plan, replies count against that plan's usage limits and spend no API tokens. It works in a real copy of a repository, or in a folder of your own on this computer, and can edit, run and commit."
                  : "Any provider that speaks the OpenAI chat format, by its address, model id and key."}
            </p>
          </div>

          {provider !== "compatible" && (
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label} htmlFor="ogchat-account">
                  Claude account
                </label>
                <span className={styles.linkRow}>
                  {!isMain && (
                    <button type="button" className={styles.linkButton} onClick={removeAccount}>
                      remove this one
                    </button>
                  )}
                  <button type="button" className={styles.linkButton} onClick={addAccount}>
                    add an account
                  </button>
                </span>
              </div>
              <div className={styles.accountRow}>
                <select
                  id="ogchat-account"
                  className={styles.textInput}
                  value={account.id}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setCheck(null);
                  }}
                >
                  {accounts.map((one) => (
                    <option key={one.id} value={one.id}>
                      {one.name.trim() || "no name yet"}
                      {one.id === settings.claude.account ? " (in use)" : ""}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.textInput}
                  value={account.name}
                  placeholder="its name"
                  aria-label="Account name"
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => editAccount({ name: event.target.value })}
                />
              </div>
              {accounts.length > 1 && (
                <div
                  className={styles.accountColors}
                  role="radiogroup"
                  aria-label={`Colour for ${account.name.trim() || "this account"}`}
                >
                  <span className={styles.accountColorsLabel}>its colour</span>
                  {ACCOUNT_COLORS.map((one) => {
                    const other = accounts.find((a) => a.id !== account.id && a.color === one.id);
                    return (
                      <button
                        key={one.id}
                        type="button"
                        role="radio"
                        aria-checked={account.color === one.id}
                        aria-label={one.id}
                        title={other ? `${one.id} (${other.name.trim()} has it)` : one.id}
                        className={styles.accountColor}
                        style={{ background: colorHex(one.id) }}
                        onClick={() => editAccount({ color: one.id })}
                      />
                    );
                  })}
                </div>
              )}
              <p className={styles.help}>
                {accounts.length > 1 ? (
                  <>
                    The account chosen here is the one every Claude chat uses once you save. You can
                    also switch with <code>account</code> at the top of a Claude chat. Each reply
                    says which account it ran on, and carries its colour, as does the chat in the
                    list.
                  </>
                ) : (
                  <>
                    One account so far. Add another (a second Claude sign-in, or another API key) to
                    switch between them from the top of a Claude chat.
                  </>
                )}{" "}
                {!isMain &&
                  "What an added account has none of its own (a sign-in folder, a key), it shares with the main one. Removing it here leaves its folder on disk alone."}
              </p>
            </div>
          )}

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
                  is about half the price; Haiku is far cheaper and quicker. Fable 5.2 is the newest
                  Fable; Fable 5.1 stays listed for chats that want the earlier one. What you pay is
                  by the token, on your Anthropic account.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="ogchat-claude-key">
                    Claude API key
                  </label>
                  {account.saved?.key.source === "settings" && !account.key && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => editAccount({ dropKey: !account.dropKey })}
                    >
                      {account.dropKey ? "keep saved key" : "remove saved key"}
                    </button>
                  )}
                </div>
                <input
                  id="ogchat-claude-key"
                  className={styles.textInput}
                  type="password"
                  value={account.key}
                  placeholder={
                    account.dropKey
                      ? "the saved key will be removed"
                      : (account.saved?.key.masked ??
                        (isMain ? "sk-ant-…" : "sk-ant-… (empty: the main account's key)"))
                  }
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(event) =>
                    editAccount({
                      key: event.target.value,
                      ...(event.target.value ? { dropKey: false } : {}),
                    })
                  }
                />
                <p className={styles.help}>
                  From console.anthropic.com, under API keys. Saved to{" "}
                  <code>data/settings.json</code> on this machine only, and sent to Anthropic and
                  nowhere else.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-claude-workspace">
                  Workspace id
                </label>
                <input
                  id="ogchat-claude-workspace"
                  className={styles.textInput}
                  value={account.workspace}
                  placeholder="wrkspc_… (usually empty)"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => editAccount({ workspace: event.target.value })}
                />
                <p className={styles.help}>
                  Leave empty unless the test says the key is &quot;not scoped to a workspace&quot;.
                  Then paste the id of the workspace to use, from the Claude Console under
                  Workspaces. It is an id, not a secret.
                </p>
              </div>
            </>
          )}

          {provider === "claudecode" && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-code-permission">
                  What Claude Code may do
                </label>
                <select
                  id="ogchat-code-permission"
                  className={styles.textInput}
                  value={codePermission}
                  onChange={(event) =>
                    setCodePermission(event.target.value as "plan" | "edit" | "run" | "auto")
                  }
                >
                  <option value="plan">look only: read and search, change nothing</option>
                  <option value="edit">edit files in the chat&apos;s folder</option>
                  <option value="run">edit files and run commands</option>
                  <option value="auto">auto: it decides what is safe, and does it</option>
                </select>
                <p className={styles.help}>
                  {settings.claudeCode.found
                    ? "Claude Code was found on this computer."
                    : "Claude Code was not found on this computer yet: install it, or give its path below."}{" "}
                  A chat set to Claude Code starts that program in a folder kept for the chat (a
                  clone of the chat&apos;s repository, if it has one), or in a folder of your own if
                  you give the chat one above its message box, where it edits your files in place.
                  It uses whichever account it is signed in to in Terminal, so it draws on that
                  account&apos;s plan, not on an API key. Commands it runs are <strong>not</strong>{" "}
                  inside ogchat&apos;s sandbox: they run as you. None of these levels stops to ask
                  you anything: what a level does not cover is refused. <em>Auto</em> is Claude
                  Code&apos;s own auto mode, which covers all of its tools and leaves the judging to
                  it; if your plan or Claude Code version does not have it, the chat will say so.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-code-config">
                  Account folder
                </label>
                <input
                  id="ogchat-code-config"
                  className={styles.textInput}
                  value={account.configDir}
                  placeholder={
                    isMain ? "~/.claude (the usual one)" : "empty: the main account's sign-in"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => editAccount({ configDir: event.target.value })}
                />
                <p className={styles.help}>
                  {isMain ? (
                    <>
                      Where Claude Code keeps this account&apos;s sign-in. Leave empty for the one
                      it is already signed in to. For a second sign-in beside it, press{" "}
                      <code>add an account</code> above.
                    </>
                  ) : (
                    <>
                      A folder of its own for this account&apos;s sign-in, so it does not disturb
                      the main one. Sign in to it once in Terminal:{" "}
                      <code>
                        CLAUDE_CONFIG_DIR={account.configDir.trim() || "~/.claude-work"} claude auth
                        login
                      </code>
                    </>
                  )}{" "}
                  Press <code>test</code> to see who it is signed in as.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ogchat-code-path">
                  Where Claude Code is
                </label>
                <input
                  id="ogchat-code-path"
                  className={styles.textInput}
                  value={codePath}
                  placeholder="found by itself"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setCodePath(event.target.value)}
                />
                <p className={styles.help}>
                  Only needed if the test cannot find it. In Terminal, <code>which claude</code>{" "}
                  prints the path.
                </p>
              </div>
            </>
          )}

          {provider !== "compatible" && (
            <>
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

          {provider === "claude" && (
            <>
              <div className={styles.field}>
                <label className={styles.checkRow} htmlFor="ogchat-run-code">
                  <input
                    id="ogchat-run-code"
                    type="checkbox"
                    checked={runCode}
                    onChange={(event) => setRunCode(event.target.checked)}
                  />
                  <span className={styles.label}>Let Claude run code</span>
                </label>
                <p className={styles.help}>
                  Off unless you switch it on. Claude can then run commands on this computer: tests,
                  a build, a script. They run in a folder kept for each chat, which holds a copy of
                  the project&apos;s repository if it has one.{" "}
                  {settings.runCode.sandbox === "macos" ? (
                    <>
                      Each command runs inside the Mac&apos;s sandbox: it can write only in that
                      folder and cannot read your files or ogchat&apos;s keys. It can use the
                      network. Press <code>test</code> to see the sandbox hold.
                    </>
                  ) : (
                    <>
                      <strong>This system has no sandbox for them</strong>: a command runs as you,
                      with your access to everything.
                    </>
                  )}
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
              {EFFORT_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name} — {level.hint}
                </option>
              ))}
            </select>
            <p className={styles.help}>
              How hard the model reasons before it answers. Also on the <code>think</code> button by
              the message box.{" "}
              {provider !== "compatible" ? (
                <>
                  {EFFORT_BLURB} Extra is the API&apos;s <code>xhigh</code>. With Claude, auto
                  leaves it to the model&apos;s own default, and its thoughts are shown in summary.
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
              {provider !== "compatible" ? (
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
