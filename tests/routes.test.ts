import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  PublicSettings,
  Session,
  SessionDetail,
  SessionMeta,
  StreamEvent,
} from "@/lib/types";
import { DELETE as deleteMessage } from "@/app/api/sessions/[id]/messages/[messageId]/route";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import {
  DELETE as deleteSession,
  GET as getSession,
  PATCH as patchSession,
} from "@/app/api/sessions/[id]/route";
import { POST as stopSession } from "@/app/api/sessions/[id]/stop/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import {
  forbidNetwork,
  hangingResponse,
  sseResponse,
  stubProvider,
  TEST_KEY,
  useTempDataDir,
} from "./helpers";

const data = useTempDataDir();
const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  // Any route that reaches for the network without a stub fails loudly.
  forbidNetwork();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function req(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}${url}`, {
    method,
    headers: {
      host: "localhost:3000",
      ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(title?: string): Promise<Session> {
  const res = await createSession(req("POST", "/api/sessions", title ? { title } : undefined));
  expect(res.status).toBe(201);
  return ((await res.json()) as { session: Session }).session;
}

async function list(query = ""): Promise<SessionMeta[]> {
  const res = await listSessions(req("GET", `/api/sessions${query}`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { sessions: SessionMeta[] }).sessions;
}

async function detail(id: string): Promise<SessionDetail> {
  const res = await getSession(req("GET", `/api/sessions/${id}`), ctx(id));
  expect(res.status).toBe(200);
  return (await res.json()) as SessionDetail;
}

async function readEvents(res: Response): Promise<StreamEvent[]> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/x-ndjson");
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

async function send(id: string, body: unknown): Promise<StreamEvent[]> {
  return readEvents(await sendMessage(req("POST", `/api/sessions/${id}/messages`, body), ctx(id)));
}

async function useKey(): Promise<void> {
  const res = await putSettings(req("PUT", "/api/settings", { apiKey: TEST_KEY }));
  expect(res.status).toBe(200);
}

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

function last<T extends StreamEvent["type"]>(events: StreamEvent[], type: T) {
  const event = events.at(-1);
  expect(event?.type).toBe(type);
  return event as Extract<StreamEvent, { type: T }>;
}

describe("sessions API", () => {
  it("creates a session and lists it", async () => {
    expect(await list()).toEqual([]);
    const session = await create();
    expect(session).toMatchObject({ title: "new session", messageCount: 0, messages: [] });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await list()).toEqual([
      {
        id: session.id,
        title: "new session",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: 0,
      },
    ]);
  });

  it("lists newest first and filters with ?q=", async () => {
    const a = await create("alpha notes");
    const b = await create("beta notes");
    const c = await create("gamma");
    expect((await list()).map((s) => s.id)).toEqual([c.id, b.id, a.id]);
    expect((await list("?q=notes")).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(await list("?q=zzz")).toEqual([]);
  });

  it("returns a session with its messages", async () => {
    const session = await create();
    expect(await detail(session.id)).toEqual({ session, generating: false, partial: "" });
  });

  it("renames a session", async () => {
    const session = await create();
    const res = await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { title: "  weekend   project " }),
      ctx(session.id),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { session: SessionMeta }).session.title).toBe("weekend project");
    expect((await list())[0]?.title).toBe("weekend project");
  });

  it("rejects an empty title and unknown sessions", async () => {
    const session = await create();
    const empty = await patchSession(
      req("PATCH", `/api/sessions/${session.id}`, { title: "   " }),
      ctx(session.id),
    );
    expect(empty.status).toBe(400);
    expect((await errorOf(empty)).code).toBe("bad_title");

    const missing = "11111111-1111-4111-8111-111111111111";
    for (const res of [
      await getSession(req("GET", `/api/sessions/${missing}`), ctx(missing)),
      await patchSession(req("PATCH", `/api/sessions/${missing}`, { title: "x" }), ctx(missing)),
      await deleteSession(req("DELETE", `/api/sessions/${missing}`), ctx(missing)),
      await sendMessage(
        req("POST", `/api/sessions/${missing}/messages`, { content: "hi" }),
        ctx(missing),
      ),
      await getSession(req("GET", "/api/sessions/..%2Fsettings"), ctx("../settings")),
    ]) {
      expect(res.status).toBe(404);
      expect((await errorOf(res)).code).toBe("not_found");
    }
  });

  it("deletes a session", async () => {
    const keep = await create();
    const drop = await create();
    const res = await deleteSession(req("DELETE", `/api/sessions/${drop.id}`), ctx(drop.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await list()).map((s) => s.id)).toEqual([keep.id]);
    expect((await getSession(req("GET", `/api/sessions/${drop.id}`), ctx(drop.id))).status).toBe(
      404,
    );
  });

  it("answers malformed JSON with 400", async () => {
    const res = await createSession(
      new Request(`${ORIGIN}/api/sessions`, {
        method: "POST",
        headers: { host: "localhost:3000", origin: ORIGIN },
        body: "{ nope",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("sending messages", () => {
  it("streams the reply and persists both sides of the turn", async () => {
    await useKey();
    const provider = stubProvider(() => sseResponse(["Hello", ", ", "world."]));
    const session = await create();

    const events = await send(session.id, { content: "  Say hello to the world  " });
    expect(events.map((e) => e.type)).toEqual(["start", "delta", "delta", "delta", "done"]);

    const start = events[0] as Extract<StreamEvent, { type: "start" }>;
    expect(start.userMessage).toMatchObject({ role: "user", content: "Say hello to the world" });
    expect(start.session.title).toBe("Say hello to the world");
    expect(
      events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text),
    ).toEqual(["Hello", ", ", "world."]);
    const done = last(events, "done");
    expect(done.stopped).toBe(false);
    expect(done.message).toMatchObject({ role: "assistant", content: "Hello, world." });
    expect(done.session.messageCount).toBe(2);

    const stored = await detail(session.id);
    expect(stored.generating).toBe(false);
    expect(stored.session.title).toBe("Say hello to the world");
    expect(stored.session.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Say hello to the world"],
      ["assistant", "Hello, world."],
    ]);
    expect(stored.session.messages[1]?.id).toBe(done.message?.id);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      url: "https://api.abliteration.ai/v1/chat/completions",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_KEY}` },
      body: {
        model: "abliterated-model-large",
        stream: true,
        messages: [{ role: "user", content: "Say hello to the world" }],
      },
    });
  });

  it("sends the session's full history as context on every request", async () => {
    await useKey();
    let turn = 0;
    const provider = stubProvider(() => sseResponse([`reply ${++turn}`]));
    const session = await create();
    const other = await create();

    await send(session.id, { content: "first" });
    await send(other.id, { content: "unrelated" });
    await send(session.id, { content: "second" });
    await send(session.id, { content: "third" });

    expect(provider.calls.map((c) => c.body.messages)).toEqual([
      [{ role: "user", content: "first" }],
      [{ role: "user", content: "unrelated" }],
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply 1" },
        { role: "user", content: "second" },
      ],
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply 1" },
        { role: "user", content: "second" },
        { role: "assistant", content: "reply 3" },
        { role: "user", content: "third" },
      ],
    ]);
    // Activity moves a session to the top of the list.
    expect((await list()).map((s) => s.id)).toEqual([session.id, other.id]);
  });

  it("uses the base URL and model from settings without re-entering the key", async () => {
    await useKey();
    const saved = await putSettings(
      req("PUT", "/api/settings", { baseUrl: "http://127.0.0.1:8787/v1/", model: "local-model" }),
    );
    expect(saved.status).toBe(200);
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "hi" });
    expect(provider.calls[0]).toMatchObject({
      url: "http://127.0.0.1:8787/v1/chat/completions",
      headers: { Authorization: `Bearer ${TEST_KEY}` },
      body: { model: "local-model" },
    });
  });

  it("rejects an empty message without touching the session", async () => {
    await useKey();
    const session = await create();
    const res = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "   " }),
      ctx(session.id),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("empty_message");
    expect((await detail(session.id)).session.messages).toEqual([]);
  });

  it("edits the last user message: replaces it and its reply, then answers again", async () => {
    await useKey();
    let turn = 0;
    const provider = stubProvider(() => sseResponse([`reply ${++turn}`]));
    const session = await create();
    await send(session.id, { content: "keep me" });
    await send(session.id, { content: "typo in thsi one" });
    const before = (await detail(session.id)).session.messages;
    const target = before[2] as ChatMessage;

    const events = await send(session.id, {
      content: "typo fixed in this one",
      replaceFromMessageId: target.id,
    });
    expect(last(events, "done").message?.content).toBe("reply 3");

    const after = (await detail(session.id)).session.messages;
    expect(after.map((m) => m.content)).toEqual([
      "keep me",
      "reply 1",
      "typo fixed in this one",
      "reply 3",
    ]);
    expect(provider.calls.at(-1)?.body.messages).toEqual([
      { role: "user", content: "keep me" },
      { role: "assistant", content: "reply 1" },
      { role: "user", content: "typo fixed in this one" },
    ]);

    const stale = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, {
        content: "x",
        replaceFromMessageId: target.id,
      }),
      ctx(session.id),
    );
    expect(stale.status).toBe(400);
    expect((await detail(session.id)).session.messages).toHaveLength(4);
  });

  it("deletes the last user message together with its reply", async () => {
    await useKey();
    stubProvider(() => sseResponse(["reply"]));
    const session = await create();
    await send(session.id, { content: "one" });
    await send(session.id, { content: "two" });
    const messages = (await detail(session.id)).session.messages;
    const [, firstReply, lastUser] = messages as [ChatMessage, ChatMessage, ChatMessage];

    const notYours = await deleteMessage(
      req("DELETE", `/api/sessions/${session.id}/messages/${firstReply.id}`),
      { params: Promise.resolve({ id: session.id, messageId: firstReply.id }) },
    );
    expect(notYours.status).toBe(400);

    const res = await deleteMessage(
      req("DELETE", `/api/sessions/${session.id}/messages/${lastUser.id}`),
      { params: Promise.resolve({ id: session.id, messageId: lastUser.id }) },
    );
    expect(res.status).toBe(200);
    const { session: updated } = (await res.json()) as { session: Session };
    expect(updated.messages.map((m) => m.content)).toEqual(["one", "reply"]);
    expect((await detail(session.id)).session.messages).toHaveLength(2);

    const gone = await deleteMessage(
      req("DELETE", `/api/sessions/${session.id}/messages/${lastUser.id}`),
      { params: Promise.resolve({ id: session.id, messageId: lastUser.id }) },
    );
    expect(gone.status).toBe(404);
  });

  it("regenerates the last reply without duplicating the user message", async () => {
    await useKey();
    let turn = 0;
    const provider = stubProvider(() => sseResponse([`reply ${++turn}`]));
    const session = await create();
    await send(session.id, { content: "question" });

    const events = await send(session.id, { regenerate: true });
    expect((events[0] as Extract<StreamEvent, { type: "start" }>).userMessage).toBeNull();
    expect((await detail(session.id)).session.messages.map((m) => m.content)).toEqual([
      "question",
      "reply 2",
    ]);
    expect(provider.calls[1]?.body.messages).toEqual([{ role: "user", content: "question" }]);

    const empty = await create();
    const nothing = await sendMessage(
      req("POST", `/api/sessions/${empty.id}/messages`, { regenerate: true }),
      ctx(empty.id),
    );
    expect(nothing.status).toBe(400);
    expect((await errorOf(nothing)).code).toBe("nothing_to_retry");
  });
});

describe("stopping", () => {
  it("halts generation, keeps the partial reply, and frees the session", async () => {
    await useKey();
    const provider = stubProvider((call) => hangingResponse(["Once upon", " a time"], call.signal));
    const session = await create();

    const res = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "tell me a story" }),
      ctx(session.id),
    );
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes(" a time")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before the reply started");
      text += decoder.decode(value, { stream: true });
    }

    const during = await detail(session.id);
    expect(during.generating).toBe(true);
    expect(during.partial).toBe("Once upon a time");

    const busy = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "impatient" }),
      ctx(session.id),
    );
    expect(busy.status).toBe(409);
    expect((await errorOf(busy)).code).toBe("busy");

    const stop = await stopSession(
      req("POST", `/api/sessions/${session.id}/stop`),
      ctx(session.id),
    );
    expect(await stop.json()).toEqual({ stopped: true });
    expect(provider.calls[0]?.signal?.aborted).toBe(true);

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    const events = text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StreamEvent);
    const done = last(events, "done");
    expect(done.stopped).toBe(true);
    expect(done.message).toMatchObject({
      role: "assistant",
      content: "Once upon a time",
      partial: true,
    });

    const after = await detail(session.id);
    expect(after.generating).toBe(false);
    expect(after.session.messages.map((m) => [m.role, m.content, m.partial ?? false])).toEqual([
      ["user", "tell me a story", false],
      ["assistant", "Once upon a time", true],
    ]);

    const again = await stopSession(
      req("POST", `/api/sessions/${session.id}/stop`),
      ctx(session.id),
    );
    expect(await again.json()).toEqual({ stopped: false });
  });

  it("finishes and saves the reply even if the browser stops listening", async () => {
    await useKey();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubProvider(async () => {
      await gate;
      return sseResponse(["saved ", "anyway"]);
    });
    const session = await create();

    const res = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "closing the tab now" }),
      ctx(session.id),
    );
    await res.body!.cancel();
    expect((await detail(session.id)).generating).toBe(true);

    release?.();
    await vi.waitFor(async () => expect((await detail(session.id)).generating).toBe(false));
    expect((await detail(session.id)).session.messages.map((m) => m.content)).toEqual([
      "closing the tab now",
      "saved anyway",
    ]);
  });

  it("stops quietly when a session is deleted mid-reply", async () => {
    await useKey();
    stubProvider((call) => hangingResponse(["half"], call.signal));
    const session = await create();
    const res = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "going away" }),
      ctx(session.id),
    );
    const removed = await deleteSession(
      req("DELETE", `/api/sessions/${session.id}`),
      ctx(session.id),
    );
    expect(removed.status).toBe(200);
    await res.text();
    expect(await list()).toEqual([]);
    expect(fs.readdirSync(path.join(data.dir(), "sessions"))).toEqual([]);
  });
});

describe("failures surface as inline errors, never a lost session", () => {
  async function failingTurn(respond: Parameters<typeof stubProvider>[0]) {
    const provider = stubProvider(respond);
    const session = await create();
    const events = await send(session.id, { content: "are you there?" });
    return { provider, session, events };
  }

  async function expectRecoverable(sessionId: string) {
    // The user's message is still there, and the session accepts a retry.
    const stored = await detail(sessionId);
    expect(stored.generating).toBe(false);
    expect(stored.session.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "are you there?"],
    ]);
    stubProvider(() => sseResponse(["yes"]));
    await useKey();
    const retry = await send(sessionId, { regenerate: true });
    expect(last(retry, "done").message?.content).toBe("yes");
    expect((await detail(sessionId)).session.messages.map((m) => m.content)).toEqual([
      "are you there?",
      "yes",
    ]);
  }

  it("no key: asks for one, and nothing is sent", async () => {
    const { provider, session, events } = await failingTurn(() => sseResponse(["unreachable"]));
    expect(events.map((e) => e.type)).toEqual(["start", "error"]);
    const error = last(events, "error");
    expect(error.error.code).toBe("not_configured");
    expect(error.error.message).toMatch(/settings/i);
    expect(provider.calls).toEqual([]);
    await expectRecoverable(session.id);
  });

  it("invalid key", async () => {
    await useKey();
    const { session, events } = await failingTurn(() =>
      Response.json({ error: { message: `Incorrect API key: ${TEST_KEY}` } }, { status: 401 }),
    );
    const error = last(events, "error");
    expect(error.error).toMatchObject({ code: "invalid_key", status: 401 });
    expect(JSON.stringify(events)).not.toContain(TEST_KEY);
    await expectRecoverable(session.id);
  });

  it("provider failure", async () => {
    await useKey();
    const { session, events } = await failingTurn(() =>
      Response.json({ error: { message: "model is overloaded" } }, { status: 503 }),
    );
    const error = last(events, "error");
    expect(error.error).toMatchObject({ code: "provider_error", status: 503 });
    expect(error.error.message).toContain("model is overloaded");
    await expectRecoverable(session.id);
  });

  it("empty reply", async () => {
    await useKey();
    const { session, events } = await failingTurn(() => sseResponse([]));
    const error = last(events, "error");
    expect(error.error.code).toBe("empty_reply");
    expect(error.message).toBeNull();
    await expectRecoverable(session.id);
  });

  it("network loss before the reply starts", async () => {
    await useKey();
    const { session, events } = await failingTurn(() => {
      throw new TypeError("fetch failed");
    });
    expect(last(events, "error").error.code).toBe("network");
    await expectRecoverable(session.id);
  });

  it("network loss mid-reply keeps the text received so far", async () => {
    await useKey();
    const encoder = new TextEncoder();
    let pulls = 0;
    const { session, events } = await failingTurn(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls += 1;
              if (pulls === 1) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: "I was say" } }] })}\n\n`,
                  ),
                );
              } else {
                controller.error(new TypeError("terminated"));
              }
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    expect(events.map((e) => e.type)).toEqual(["start", "delta", "error"]);
    const error = last(events, "error");
    expect(error.error.code).toBe("network");
    expect(error.message).toMatchObject({ content: "I was say", partial: true });

    stubProvider(() => sseResponse(["I was saying hello."]));
    await send(session.id, { regenerate: true });
    expect((await detail(session.id)).session.messages.map((m) => m.content)).toEqual([
      "are you there?",
      "I was saying hello.",
    ]);
  });
});

describe("settings API", () => {
  async function settings(): Promise<PublicSettings> {
    const res = await getSettings(req("GET", "/api/settings"));
    expect(res.status).toBe(200);
    return ((await res.json()) as { settings: PublicSettings }).settings;
  }

  it("reports defaults and no key on a fresh install", async () => {
    expect(await settings()).toEqual({
      baseUrl: "https://api.abliteration.ai/v1",
      model: "abliterated-model-large",
      apiKey: { set: false, masked: null, source: null },
      defaults: {
        baseUrl: "https://api.abliteration.ai/v1",
        model: "abliterated-model-large",
      },
    });
  });

  it("saves settings and only ever returns the key masked", async () => {
    const res = await putSettings(
      req("PUT", "/api/settings", {
        baseUrl: "https://example.test/v1",
        model: "m-1",
        apiKey: TEST_KEY,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(TEST_KEY);
    expect((JSON.parse(body) as { settings: PublicSettings }).settings).toMatchObject({
      baseUrl: "https://example.test/v1",
      model: "m-1",
      apiKey: { set: true, masked: "••••••••CRET", source: "settings" },
    });
    expect(JSON.stringify(await settings())).not.toContain(TEST_KEY);
  });

  it("reports a key that comes from the environment as masked, with its source", async () => {
    vi.stubEnv("OGCHAT_API_KEY", TEST_KEY);
    const view = await settings();
    expect(view.apiKey).toEqual({ set: true, masked: "••••••••CRET", source: "env" });
    expect(JSON.stringify(view)).not.toContain(TEST_KEY);
  });

  it("removes the saved key with apiKey: null", async () => {
    await useKey();
    const res = await putSettings(req("PUT", "/api/settings", { apiKey: null }));
    expect(((await res.json()) as { settings: PublicSettings }).settings.apiKey.set).toBe(false);
  });

  it("rejects invalid settings with 400", async () => {
    const res = await putSettings(req("PUT", "/api/settings", { baseUrl: "javascript:alert(1)" }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("invalid_settings");
  });
});

describe("local-only guard", () => {
  it("refuses state-changing requests from other origins", async () => {
    await useKey();
    const attempts: Response[] = [
      await putSettings(
        req(
          "PUT",
          "/api/settings",
          { baseUrl: "https://evil.test/v1" },
          { origin: "https://evil.test" },
        ),
      ),
      await putSettings(
        req(
          "PUT",
          "/api/settings",
          { baseUrl: "https://evil.test/v1" },
          { origin: "http://localhost:5173" },
        ),
      ),
      await putSettings(
        req(
          "PUT",
          "/api/settings",
          { baseUrl: "https://evil.test/v1" },
          { "sec-fetch-site": "cross-site" },
        ),
      ),
      await createSession(req("POST", "/api/sessions", undefined, { origin: "null" })),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("cross_origin");
    }
    const res = await getSettings(req("GET", "/api/settings"));
    const { settings } = (await res.json()) as { settings: PublicSettings };
    expect(settings.baseUrl).toBe("https://api.abliteration.ai/v1");
    expect(await list()).toEqual([]);
  });

  it("refuses requests addressed to a non-local host unless it is allowed", async () => {
    const rebound = await listSessions(
      req("GET", "/api/sessions", undefined, { host: "evil.test:3000" }),
    );
    expect(rebound.status).toBe(403);
    expect((await errorOf(rebound)).code).toBe("forbidden_host");

    vi.stubEnv("OGCHAT_ALLOWED_HOSTS", "ogchat.lan, other.lan:3000");
    const allowed = await listSessions(
      req("GET", "/api/sessions", undefined, { host: "ogchat.lan:3000" }),
    );
    expect(allowed.status).toBe(200);
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect((await listSessions(req("GET", "/api/sessions", undefined, { host }))).status).toBe(
        200,
      );
    }
  });
});
