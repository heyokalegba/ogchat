import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TEST_KEY, useTempDataDir } from "./helpers";

const data = useTempDataDir();

/** Loads the persistence modules fresh, the way a restarted server would. */
async function boot() {
  vi.resetModules();
  const store = await import("@/lib/server/store");
  const settings = await import("@/lib/server/settings");
  return { store, settings };
}

describe("session persistence", () => {
  it("writes one JSON file per session inside the data directory", async () => {
    const { store } = await boot();
    const session = store.createSession();
    const file = path.join(data.dir(), "sessions", `${session.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      id: session.id,
      title: "new session",
      messages: [],
    });
  });

  it("round-trips a conversation across a restart", async () => {
    const first = await boot();
    const session = first.store.createSession();
    first.store.appendMessage(session.id, { role: "user", content: "What is a monad?" });
    first.store.appendMessage(session.id, { role: "assistant", content: "A monoid in the…" });
    first.store.appendMessage(session.id, {
      role: "user",
      content: "Simpler, please.\n\n```hs\nx\n```",
    });
    first.store.appendMessage(session.id, {
      role: "assistant",
      content: "A pipeline",
      partial: true,
    });

    const second = await boot();
    const restored = second.store.getSession(session.id);
    expect(restored).not.toBeNull();
    expect(restored!.messages.map((m) => [m.role, m.content, m.partial ?? false])).toEqual([
      ["user", "What is a monad?", false],
      ["assistant", "A monoid in the…", false],
      ["user", "Simpler, please.\n\n```hs\nx\n```", false],
      ["assistant", "A pipeline", true],
    ]);
    expect(restored!.messageCount).toBe(4);
    expect(restored!.title).toBe("What is a monad?");
    expect(second.store.listSessions().map((s) => s.id)).toEqual([session.id]);
  });

  it("lists sessions most recently active first", async () => {
    const { store } = await boot();
    const a = store.createSession();
    const b = store.createSession();
    const c = store.createSession();
    expect(store.listSessions().map((s) => s.id)).toEqual([c.id, b.id, a.id]);

    store.appendMessage(a.id, { role: "user", content: "bump" });
    expect(store.listSessions().map((s) => s.id)).toEqual([a.id, c.id, b.id]);
  });

  it("titles a session from its first user message only", async () => {
    const { store } = await boot();
    const session = store.createSession();
    store.appendMessage(session.id, {
      role: "user",
      content:
        "  ## Explain   how TCP congestion control actually works in practice, with examples  ",
    });
    const titled = store.getSession(session.id)!;
    expect(titled.title).toBe("Explain how TCP congestion control actually…");
    expect(Array.from(titled.title).length).toBeLessThanOrEqual(49);

    store.appendMessage(session.id, { role: "user", content: "A different topic" });
    expect(store.getSession(session.id)!.title).toBe(titled.title);
  });

  it("keeps a manual title and does not reorder on rename", async () => {
    const { store } = await boot();
    const older = store.createSession();
    const newer = store.createSession();
    const renamed = store.renameSession(older.id, "kernel notes");
    expect(renamed!.title).toBe("kernel notes");
    expect(store.listSessions().map((s) => s.id)).toEqual([newer.id, older.id]);

    store.appendMessage(older.id, { role: "user", content: "this must not retitle" });
    const again = (await boot()).store.getSession(older.id)!;
    expect(again.title).toBe("kernel notes");
  });

  it("deletes a session and its file", async () => {
    const { store } = await boot();
    const session = store.createSession();
    expect(store.deleteSession(session.id)).toBe(true);
    expect(store.getSession(session.id)).toBeNull();
    expect(store.listSessions()).toEqual([]);
    expect(fs.readdirSync(path.join(data.dir(), "sessions"))).toEqual([]);
    expect(store.deleteSession(session.id)).toBe(false);
  });

  it("truncates from a message, dropping it and everything after", async () => {
    const { store } = await boot();
    const session = store.createSession();
    store.appendMessage(session.id, { role: "user", content: "one" });
    store.appendMessage(session.id, { role: "assistant", content: "two" });
    const third = store.appendMessage(session.id, { role: "user", content: "three" })!;
    store.appendMessage(session.id, { role: "assistant", content: "four" });

    const cut = store.truncateFrom(session.id, third.message.id)!;
    expect(cut.messages.map((m) => m.content)).toEqual(["one", "two"]);
    expect((await boot()).store.getSession(session.id)!.messages).toHaveLength(2);
    expect(store.truncateFrom(session.id, "no-such-message")).toBeNull();
  });

  it("searches titles and message text", async () => {
    const { store } = await boot();
    const a = store.createSession();
    store.appendMessage(a.id, { role: "user", content: "Rust lifetimes" });
    store.appendMessage(a.id, { role: "assistant", content: "Think of the borrow checker…" });
    const b = store.createSession();
    store.appendMessage(b.id, { role: "user", content: "Sourdough hydration" });

    expect(store.listSessions("rust").map((s) => s.id)).toEqual([a.id]);
    expect(store.listSessions("BORROW").map((s) => s.id)).toEqual([a.id]);
    expect(store.listSessions("hydration").map((s) => s.id)).toEqual([b.id]);
    expect(store.listSessions("nothing matches")).toEqual([]);
  });

  it("rejects ids that are not session ids", async () => {
    const { store } = await boot();
    fs.writeFileSync(path.join(data.dir(), "outside.json"), "{}");
    expect(store.getSession("../outside")).toBeNull();
    expect(store.deleteSession("../outside")).toBe(false);
    expect(store.appendMessage("../outside", { role: "user", content: "x" })).toBeNull();
    expect(fs.existsSync(path.join(data.dir(), "outside.json"))).toBe(true);
  });

  it("skips a corrupt session file instead of failing the whole list", async () => {
    const { store } = await boot();
    const good = store.createSession();
    fs.writeFileSync(
      path.join(data.dir(), "sessions", "00000000-0000-4000-8000-000000000000.json"),
      "{ not json",
    );
    expect(store.listSessions().map((s) => s.id)).toEqual([good.id]);
  });

  it("starts empty when the data directory does not exist yet", async () => {
    fs.rmSync(data.dir(), { recursive: true, force: true });
    const { store, settings } = await boot();
    expect(store.listSessions()).toEqual([]);
    expect(settings.publicSettings().apiKey.set).toBe(false);
  });
});

describe("settings persistence", () => {
  it("falls back to the documented defaults", async () => {
    const { settings } = await boot();
    expect(settings.resolveSettings()).toEqual({
      baseUrl: "https://api.abliteration.ai/v1",
      model: "abliterated-model-large-v2",
      apiKey: null,
      keySource: null,
      reasoning: "default",
      systemPrompt: "",
      contextWindow: 1_000_000,
      provider: "compatible",
      claudeKey: null,
      claudeKeySource: null,
      claudeModel: "claude-opus-5-5",
      githubToken: null,
      claudeWorkspace: "",
      githubTokenSource: null,
      runCode: false,
      claudeCodePath: null,
      claudeCodeConfigDir: null,
      claudeCodePermission: "edit",
      claudeCodeModel: "default",
      claudeAccount: "main",
      claudeAccountOn: { claude: null, claudecode: null },
    });
  });

  it("round-trips saved settings across a restart, in an owner-only file", async () => {
    const first = await boot();
    first.settings.updateSettings({
      baseUrl: "http://127.0.0.1:8787/v1/",
      model: "local-model",
      apiKey: `  ${TEST_KEY}  `,
    });

    const second = await boot();
    expect(second.settings.resolveSettings()).toEqual({
      baseUrl: "http://127.0.0.1:8787/v1",
      model: "local-model",
      apiKey: TEST_KEY,
      keySource: "settings",
      reasoning: "default",
      systemPrompt: "",
      contextWindow: 1_000_000,
      provider: "compatible",
      claudeKey: null,
      claudeKeySource: null,
      claudeModel: "claude-opus-5-5",
      githubToken: null,
      claudeWorkspace: "",
      githubTokenSource: null,
      runCode: false,
      claudeCodePath: null,
      claudeCodeConfigDir: null,
      claudeCodePermission: "edit",
      claudeCodeModel: "default",
      claudeAccount: "main",
      claudeAccountOn: { claude: null, claudecode: null },
    });
    const file = path.join(data.dir(), "settings.json");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("only ever exposes the key masked", async () => {
    const { settings } = await boot();
    const view = settings.updateSettings({ apiKey: TEST_KEY });
    expect(view.apiKey).toEqual({ set: true, masked: "••••••••CRET", source: "settings" });
    expect(JSON.stringify(view)).not.toContain(TEST_KEY);
    expect(JSON.stringify(settings.publicSettings())).not.toContain(TEST_KEY);
  });

  it("reads the key and overrides from the environment", async () => {
    vi.stubEnv("OGCHAT_API_KEY", TEST_KEY);
    vi.stubEnv("OGCHAT_API_BASE_URL", "https://example.test/v1");
    vi.stubEnv("OGCHAT_MODEL", "env-model");
    const { settings } = await boot();
    expect(settings.resolveSettings()).toEqual({
      baseUrl: "https://example.test/v1",
      model: "env-model",
      apiKey: TEST_KEY,
      keySource: "env",
      reasoning: "default",
      systemPrompt: "",
      contextWindow: 1_000_000,
      provider: "compatible",
      claudeKey: null,
      claudeKeySource: null,
      claudeModel: "claude-opus-5-5",
      githubToken: null,
      claudeWorkspace: "",
      githubTokenSource: null,
      runCode: false,
      claudeCodePath: null,
      claudeCodeConfigDir: null,
      claudeCodePermission: "edit",
      claudeCodeModel: "default",
      claudeAccount: "main",
      claudeAccountOn: { claude: null, claudecode: null },
    });
    expect(settings.publicSettings().apiKey).toEqual({
      set: true,
      masked: "••••••••CRET",
      source: "env",
    });
    // An env-provided key is never copied into the data directory.
    settings.updateSettings({ model: "other-model" });
    expect(fs.readFileSync(path.join(data.dir(), "settings.json"), "utf8")).not.toContain(TEST_KEY);
  });

  it("lets a saved key override the environment, and removing it falls back", async () => {
    vi.stubEnv("OGCHAT_API_KEY", "env-key-0000000000");
    const { settings } = await boot();
    settings.updateSettings({ apiKey: TEST_KEY });
    expect(settings.resolveSettings()).toMatchObject({ apiKey: TEST_KEY, keySource: "settings" });
    settings.updateSettings({ apiKey: null });
    expect(settings.resolveSettings()).toMatchObject({
      apiKey: "env-key-0000000000",
      keySource: "env",
    });
  });

  it("leaves the saved key alone when a patch does not mention it", async () => {
    const { settings } = await boot();
    settings.updateSettings({ apiKey: TEST_KEY });
    settings.updateSettings({ model: "another-model" });
    expect(settings.resolveSettings()).toMatchObject({ apiKey: TEST_KEY, model: "another-model" });
  });

  it("rejects malformed settings without saving them", async () => {
    const { settings } = await boot();
    const bad = [
      { baseUrl: "not a url" },
      { baseUrl: "ftp://example.test/v1" },
      { baseUrl: "https://user:pass@example.test/v1" },
      { model: "   " },
      { apiKey: "two words" },
    ];
    for (const patch of bad) {
      expect(() => settings.updateSettings(patch)).toThrow(settings.SettingsValidationError);
    }
    expect(fs.existsSync(path.join(data.dir(), "settings.json"))).toBe(false);
  });
});

describe("Claude accounts", () => {
  const WORK_KEY = "sk-ant-work-7c1e9b2a4d6f-WORKSECRET";
  const work = { id: "a-work", name: "work", configDir: "~/.claude-work" };

  it("has one account, the main one, until another is added", async () => {
    const { settings } = await boot();
    expect(settings.publicSettings().claude).toMatchObject({
      account: "main",
      accounts: [
        {
          id: "main",
          name: "main",
          configDir: "",
          key: { set: false, masked: null, source: null },
          workspace: "",
        },
      ],
    });
  });

  it("switches Claude Code to another sign-in, and back", async () => {
    const { settings } = await boot();
    settings.updateSettings({ claudeKey: TEST_KEY, claudeAccounts: [work] });
    // Added, not yet in use.
    expect(settings.resolveSettings()).toMatchObject({
      claudeAccount: "main",
      claudeCodeConfigDir: null,
      claudeAccountOn: { claude: "main", claudecode: "main" },
    });

    const view = settings.updateSettings({ claudeAccount: "a-work" });
    expect(view.claude.account).toBe("a-work");
    expect(view.claude.accounts.map((one) => [one.id, one.name, one.configDir])).toEqual([
      ["main", "main", ""],
      ["a-work", "work", "~/.claude-work"],
    ]);
    expect(settings.resolveSettings()).toMatchObject({
      claudeAccount: "a-work",
      claudeCodeConfigDir: "~/.claude-work",
      // It has no key of its own: the API still goes through the main account's.
      claudeKey: TEST_KEY,
      claudeAccountOn: { claude: "main", claudecode: "work" },
    });

    settings.updateSettings({ claudeAccount: "main" });
    expect(settings.resolveSettings()).toMatchObject({
      claudeAccount: "main",
      claudeCodeConfigDir: null,
    });
  });

  it("keeps each account's key and workspace apart, and never shows a key", async () => {
    const { settings } = await boot();
    settings.updateSettings({ claudeKey: TEST_KEY, claudeWorkspace: "wrkspc_main" });
    const view = settings.updateSettings({
      claudeMainName: "personal",
      claudeAccounts: [{ id: "a-work", name: "work", key: WORK_KEY }],
      claudeAccount: "a-work",
    });
    expect(JSON.stringify(view)).not.toContain(WORK_KEY);
    expect(view.claude.accounts[1]!.key).toEqual({
      set: true,
      masked: "••••••••CRET",
      source: "settings",
    });
    expect(settings.resolveSettings()).toMatchObject({
      claudeKey: WORK_KEY,
      claudeKeySource: "settings",
      // The main account's workspace id does not go out with another account's key.
      claudeWorkspace: "",
      // No sign-in folder of its own: Claude Code stays on the main account.
      claudeCodeConfigDir: null,
      claudeAccountOn: { claude: "work", claudecode: "personal" },
    });

    // A key not mentioned is kept; null takes it away, and then it needs a folder.
    settings.updateSettings({
      claudeAccounts: [{ id: "a-work", name: "the office", workspace: "wrkspc_work" }],
    });
    expect(settings.resolveSettings()).toMatchObject({
      claudeKey: WORK_KEY,
      claudeWorkspace: "wrkspc_work",
      claudeAccountOn: { claude: "the office", claudecode: "personal" },
    });
    expect(() =>
      settings.updateSettings({ claudeAccounts: [{ id: "a-work", name: "work", key: null }] }),
    ).toThrow(/needs a sign-in folder for Claude Code, an API key, or both/);
    expect(settings.resolveSettings().claudeKey).toBe(WORK_KEY);

    const restarted = await boot();
    expect(restarted.settings.resolveSettings()).toMatchObject({
      claudeAccount: "a-work",
      claudeKey: WORK_KEY,
    });
  });

  it("goes back to the main account when the one in use is removed", async () => {
    const { settings } = await boot();
    settings.updateSettings({ claudeAccounts: [work], claudeAccount: "a-work" });
    const view = settings.updateSettings({ claudeAccounts: [] });
    expect(view.claude).toMatchObject({ account: "main", accounts: [{ id: "main" }] });
    expect(settings.resolveSettings()).toMatchObject({
      claudeAccount: "main",
      claudeCodeConfigDir: null,
      claudeAccountOn: { claude: null, claudecode: null },
    });
  });

  it("turns down accounts it cannot use", async () => {
    const { settings } = await boot();
    const bad: [unknown, RegExp][] = [
      [{ claudeAccounts: "work" }, /must be a list/],
      [{ claudeAccounts: [{ ...work, id: "main" }] }, /account id/],
      [{ claudeAccounts: [{ ...work, id: "Not An Id" }] }, /account id/],
      [{ claudeAccounts: [work, { ...work, name: "other" }] }, /same id/],
      [{ claudeAccounts: [{ ...work, name: "  " }] }, /Give every Claude account a name/],
      [{ claudeAccounts: [{ ...work, name: "Main" }] }, /Two Claude accounts are called/],
      [{ claudeAccounts: [{ ...work, configDir: "relative/folder" }] }, /full path/],
      [{ claudeAccounts: [{ id: "a-work", name: "work" }] }, /needs a sign-in folder/],
      [{ claudeAccounts: [work], claudeAccount: "a-other" }, /no such Claude account/],
      [
        {
          claudeAccounts: Array.from({ length: 13 }, (_, i) => ({
            ...work,
            id: `a-${i}`,
            name: `n${i}`,
          })),
        },
        /at most/,
      ],
    ];
    for (const [patch, message] of bad) {
      expect(() => settings.updateSettings(patch as never)).toThrow(message);
    }
    // Nothing of any of them was saved.
    expect(settings.publicSettings().claude.accounts).toHaveLength(1);
  });

  it("tries an account that is typed without saving it", async () => {
    const { settings } = await boot();
    const preview = settings.previewSettings({
      provider: "claudecode",
      claudeAccounts: [work],
      claudeAccount: "a-work",
    });
    expect(preview).toMatchObject({
      provider: "claudecode",
      claudeAccount: "a-work",
      claudeCodeConfigDir: "~/.claude-work",
    });
    expect(settings.publicSettings().claude.accounts).toHaveLength(1);
  });
});
