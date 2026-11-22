import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  Project,
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
import {
  DELETE as expandRoute,
  POST as compressRoute,
} from "@/app/api/sessions/[id]/compress/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import {
  DELETE as deleteProjectFile,
  GET as getProjectFile,
} from "@/app/api/projects/[id]/files/[fileId]/route";
import { POST as addProjectFiles } from "@/app/api/projects/[id]/files/route";
import { DELETE as deleteProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { POST as testSettings } from "@/app/api/settings/test/route";
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
        projectId: null,
        model: null,
        reasoning: null,
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
    expect(await detail(session.id)).toEqual({
      session,
      generating: false,
      partial: "",
      thinking: "",
      context: { tokens: 4, limit: 1_000_000 },
    });
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
        model: "abliterated-model-large-v2",
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

  it("passes on what a reasoning model thinks, and keeps it out of the reply", async () => {
    await useKey();
    const chunk = (delta: object) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
    stubProvider(
      () =>
        new Response(
          chunk({ reasoning_content: "They greeted me." }) +
            chunk({ reasoning_content: " Greet back." }) +
            chunk({ content: "Hello." }) +
            "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    const session = await create();
    const events = await send(session.id, { content: "hi" });
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "thinking",
      "thinking",
      "delta",
      "done",
    ]);
    const thoughts = events.flatMap((event) => (event.type === "thinking" ? [event.text] : []));
    expect(thoughts).toEqual(["They greeted me.", " Greet back."]);
    // the reply is the answer alone; the reasoning is kept beside it
    const saved = last(events, "done").message;
    expect(saved?.content).toBe("Hello.");
    expect(saved?.thinking).toBe("They greeted me. Greet back.");
    expect((await detail(session.id)).session.messages.at(-1)?.thinking).toBe(
      "They greeted me. Greet back.",
    );

    // and it is never sent back to the provider as part of the conversation
    const provider = stubProvider(() => sseResponse(["ok"]));
    await send(session.id, { content: "again" });
    expect(JSON.stringify(provider.calls[0]?.body)).not.toContain("Greet back");
  });

  it("sends the system prompt first and the thinking level, when they are set", async () => {
    await useKey();
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "hi" });
    // nothing extra by default: the provider decides
    expect(provider.calls[0]?.body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(provider.calls[0]?.body).not.toHaveProperty("reasoning_effort");
    expect(provider.calls[0]?.body).not.toHaveProperty("web_search_options");

    await putSettings(
      req("PUT", "/api/settings", { reasoning: "max", systemPrompt: "You are terse." }),
    );
    await send(session.id, { content: "again" });
    expect(provider.calls[1]?.body.reasoning_effort).toBe("max");
    expect(provider.calls[1]?.body.messages).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "again" },
    ]);
    // the prompt is an instruction to the model, not part of the saved conversation
    expect((await detail(session.id)).session.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("asks the provider to search the web only for messages sent with web on", async () => {
    await useKey();
    const chunk = (body: object) => `data: ${JSON.stringify(body)}\n\n`;
    const provider = stubProvider((call) =>
      call.body.web_search_options
        ? new Response(
            chunk({ choices: [{ delta: { content: "It is sunny" } }] }) +
              chunk({
                choices: [
                  {
                    delta: {
                      annotations: [
                        {
                          type: "url_citation",
                          url_citation: {
                            url: "https://weather.example/nyc",
                            title: "NYC weather",
                          },
                        },
                      ],
                    },
                  },
                ],
              }) +
              "data: [DONE]\n\n",
            { headers: { "Content-Type": "text/event-stream" } },
          )
        : sseResponse(["plain"]),
    );
    const session = await create();
    const searched = await send(session.id, { content: "weather?", web: true });
    expect(provider.calls[0]?.body.web_search_options).toEqual({ search_context_size: "medium" });
    const started = searched[0];
    expect(started?.type === "start" && started.userMessage?.web).toBe(true);
    // the sources the provider attached are listed under the reply
    expect(last(searched, "done").message?.content).toBe(
      "It is sunny\n\n**Sources**\n- [NYC weather](https://weather.example/nyc)",
    );

    // a retry of that message searches again; a plain message does not
    await send(session.id, { regenerate: true });
    expect(provider.calls[1]?.body.web_search_options).toBeDefined();
    const plain = await send(session.id, { content: "thanks" });
    expect(provider.calls[2]?.body).not.toHaveProperty("web_search_options");
    expect(last(plain, "done").message?.content).toBe("plain");
  });

  it("asks an earlier question again as a new message, web setting and all", async () => {
    await useKey();
    const provider = stubProvider(() => sseResponse(["answer"]));
    const session = await create();
    const first = await send(session.id, { content: "what is new?", web: true });
    const started = first[0];
    const original = started?.type === "start" ? started.userMessage : null;
    await send(session.id, { content: "and something else" });

    const again = await send(session.id, { content: "", replayOf: original!.id, web: true });
    const repeated = again[0]?.type === "start" ? again[0].userMessage : null;
    expect(repeated).toMatchObject({ role: "user", content: "what is new?", web: true });
    expect(repeated?.id).not.toBe(original!.id);
    // it went to the end of the conversation, with everything before it as context
    expect((await detail(session.id)).session.messages.map((m) => m.content)).toEqual([
      "what is new?",
      "answer",
      "and something else",
      "answer",
      "what is new?",
      "answer",
    ]);
    expect(provider.calls[2]?.body.messages).toHaveLength(5);
    expect(provider.calls[2]?.body.web_search_options).toBeDefined();

    // only a message of yours that is still there can be asked again
    const reply = (await detail(session.id)).session.messages[1]!;
    const wrong = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "", replayOf: reply.id }),
      ctx(session.id),
    );
    expect(wrong.status).toBe(400);
    const gone = await sendMessage(
      req("POST", `/api/sessions/${session.id}/messages`, { content: "", replayOf: "nope" }),
      ctx(session.id),
    );
    expect(gone.status).toBe(400);
  });

  it("explains a refused web search", async () => {
    await useKey();
    stubProvider(() =>
      Response.json({ error: { message: "web tools are not enabled" } }, { status: 400 }),
    );
    const session = await create();
    const events = await send(session.id, { content: "news?", web: true });
    expect(last(events, "error").error.message).toMatch(/Web tools/);
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

  it("out of credits is not reported as a bad key", async () => {
    await useKey();
    const { session, events } = await failingTurn(() =>
      Response.json({ error: { message: "Insufficient credits" } }, { status: 402 }),
    );
    const error = last(events, "error");
    expect(error.error).toMatchObject({ code: "no_credits", status: 402 });
    expect(error.error.message).toMatch(/out of credits/);
    await expectRecoverable(session.id);
  });

  it("a refused request (403) is not reported as a bad key", async () => {
    await useKey();
    const { session, events } = await failingTurn(() =>
      Response.json({ error: { message: "No access to this model" } }, { status: 403 }),
    );
    const error = last(events, "error");
    expect(error.error).toMatchObject({ code: "forbidden", status: 403 });
    expect(error.error.message).toContain("No access to this model");
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
      model: "abliterated-model-large-v2",
      apiKey: { set: false, masked: null, source: null },
      defaults: {
        baseUrl: "https://api.abliteration.ai/v1",
        model: "abliterated-model-large-v2",
      },
      reasoning: "default",
      systemPrompt: "",
      contextWindow: 1_000_000,
      provider: "compatible",
      active: { ready: false, model: "abliterated-model-large-v2", provider: "compatible" },
      choices: expect.arrayContaining([
        {
          provider: "claude",
          model: "claude-sonnet-5-5",
          label: "Claude Sonnet 5.5",
          ready: false,
        },
        {
          provider: "compatible",
          model: "abliterated-model-large-v2",
          label: "abliterated-model-large-v2",
          ready: false,
        },
      ]),
      claude: {
        model: "claude-opus-5-5",
        workspace: "",
        key: { set: false, masked: null, source: null },
        models: expect.arrayContaining([{ id: "claude-opus-5-5", label: "Claude Opus 5.5" }]),
      },
      github: { set: false, masked: null, source: null },
      runCode: { enabled: false, sandbox: "none" },
    });
  });

  it("saves the thinking level and the system prompt, and validates both", async () => {
    const res = await putSettings(
      req("PUT", "/api/settings", { reasoning: "high", systemPrompt: "  Answer in one line.  " }),
    );
    expect(res.status).toBe(200);
    expect(await settings()).toMatchObject({
      reasoning: "high",
      systemPrompt: "Answer in one line.",
    });
    // going back to auto and an empty prompt removes both
    await putSettings(req("PUT", "/api/settings", { reasoning: "default", systemPrompt: "" }));
    expect(await settings()).toMatchObject({ reasoning: "default", systemPrompt: "" });

    const bad = await putSettings(req("PUT", "/api/settings", { reasoning: "ludicrous" }));
    expect(bad.status).toBe(400);
    const long = await putSettings(
      req("PUT", "/api/settings", { systemPrompt: "x".repeat(20_001) }),
    );
    expect(long.status).toBe(400);
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

  describe("testing the connection", () => {
    type Check = { ok: boolean; steps: { id: string; ok: boolean | null; detail: string }[] };
    const models = () =>
      Response.json({ data: [{ id: "abliterated-model-large-v2" }, { id: "abliterated-model" }] });
    const reply = () => Response.json({ choices: [{ message: { content: "ok" } }] });

    async function runTest(body: unknown): Promise<{ status: number; text: string; check: Check }> {
      const res = await testSettings(req("POST", "/api/settings/test", body));
      const text = await res.text();
      return { status: res.status, text, check: (JSON.parse(text) as { check: Check }).check };
    }

    it("tests the saved settings and never returns the key", async () => {
      await useKey();
      const provider = stubProvider((call) => (call.method === "GET" ? models() : reply()));
      const { status, text, check } = await runTest({});
      expect(status).toBe(200);
      expect(check.ok).toBe(true);
      expect(provider.calls.map((c) => [c.method, c.url])).toEqual([
        ["GET", "https://api.abliteration.ai/v1/models"],
        ["POST", "https://api.abliteration.ai/v1/chat/completions"],
      ]);
      expect(provider.calls[1]?.body.model).toBe("abliterated-model-large-v2");
      expect(provider.calls[0]?.headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
      expect(text).not.toContain(TEST_KEY);
    });

    it("tests what is typed without saving it", async () => {
      const provider = stubProvider((call) => (call.method === "GET" ? models() : reply()));
      const { check } = await runTest({
        baseUrl: "http://127.0.0.1:8787/v1",
        model: "abliterated-model",
        apiKey: "typed-but-not-saved",
      });
      expect(check.ok).toBe(true);
      expect(provider.calls[0]?.url).toBe("http://127.0.0.1:8787/v1/models");
      expect(provider.calls[0]?.headers.Authorization).toBe("Bearer typed-but-not-saved");
      expect(provider.calls[1]?.body.model).toBe("abliterated-model");
      // Nothing was written: the app still has no key and the default model.
      expect(await settings()).toMatchObject({
        baseUrl: "https://api.abliteration.ai/v1",
        model: "abliterated-model-large-v2",
        apiKey: { set: false },
      });
    });

    it("reports a rejected key in plain words", async () => {
      await useKey();
      stubProvider(() =>
        Response.json({ error: { message: `bad key ${TEST_KEY}` } }, { status: 401 }),
      );
      const { status, text, check } = await runTest({});
      expect(status).toBe(200);
      expect(check.ok).toBe(false);
      expect(check.steps.at(-1)).toMatchObject({ id: "key", ok: false });
      expect(text).not.toContain(TEST_KEY);
    });

    it("says there is no key without calling the provider", async () => {
      const { check } = await runTest({});
      expect(check.ok).toBe(false);
      expect(check.steps[0]?.detail).toMatch(/No API key is set/);
    });

    it("rejects unusable input and requests from other origins", async () => {
      const bad = await testSettings(req("POST", "/api/settings/test", { baseUrl: "ftp://x" }));
      expect(bad.status).toBe(400);
      const foreign = await testSettings(
        req("POST", "/api/settings/test", {}, { origin: "https://evil.example" }),
      );
      expect(foreign.status).toBe(403);
    });
  });
});

describe("projects", () => {
  const pctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const fctx = (id: string, fileId: string) => ({ params: Promise.resolve({ id, fileId }) });

  async function project(name: string): Promise<Project> {
    const res = await createProject(req("POST", "/api/projects", { name }));
    expect(res.status).toBe(201);
    return ((await res.json()) as { project: Project }).project;
  }
  async function projects(): Promise<Project[]> {
    const res = await listProjects(req("GET", "/api/projects"));
    return ((await res.json()) as { projects: Project[] }).projects;
  }
  async function sessionIn(projectId: string | null): Promise<Session> {
    const res = await createSession(req("POST", "/api/sessions", projectId ? { projectId } : {}));
    expect(res.status).toBe(201);
    return ((await res.json()) as { session: Session }).session;
  }
  async function addFiles(id: string, files: [string, string][]): Promise<Response> {
    const form = new FormData();
    for (const [name, text] of files) form.append("files", new File([text], name));
    return addProjectFiles(
      new Request(`${ORIGIN}/api/projects/${id}/files`, {
        method: "POST",
        headers: { host: "localhost:3000", origin: ORIGIN },
        body: form,
      }),
      pctx(id),
    );
  }

  it("creates, renames and lists projects with their session counts", async () => {
    expect(await projects()).toEqual([]);
    const zine = await project("  Zine   issue 4 ");
    expect(zine).toMatchObject({
      name: "Zine issue 4",
      instructions: "",
      files: [],
      sessionCount: 0,
    });
    await project("Apartment hunt");
    await sessionIn(zine.id);
    await sessionIn(zine.id);
    await sessionIn(null);
    expect((await projects()).map((p) => [p.name, p.sessionCount])).toEqual([
      ["Apartment hunt", 0],
      ["Zine issue 4", 2],
    ]);
    const renamed = await patchProject(
      req("PATCH", `/api/projects/${zine.id}`, { name: "Zine", instructions: " Be blunt. " }),
      pctx(zine.id),
    );
    expect(((await renamed.json()) as { project: Project }).project).toMatchObject({
      name: "Zine",
      instructions: "Be blunt.",
      sessionCount: 2,
    });

    expect((await createProject(req("POST", "/api/projects", { name: "  " }))).status).toBe(400);
    expect((await createProject(req("POST", "/api/projects", {}))).status).toBe(400);
  });

  it("files sessions under a project and lists them by project", async () => {
    const work = await project("Work");
    const inside = await sessionIn(work.id);
    const outside = await sessionIn(null);
    expect(inside.projectId).toBe(work.id);
    expect(outside.projectId).toBeNull();
    expect((await list(`?project=${work.id}`)).map((s) => s.id)).toEqual([inside.id]);
    expect((await list("?project=none")).map((s) => s.id)).toEqual([outside.id]);
    expect((await list()).map((s) => s.id).sort()).toEqual([inside.id, outside.id].sort());

    // a chat can be moved in and taken out again, and keeps its title
    const moved = await patchSession(
      req("PATCH", `/api/sessions/${outside.id}`, { projectId: work.id }),
      ctx(outside.id),
    );
    expect(((await moved.json()) as { session: SessionMeta }).session).toMatchObject({
      projectId: work.id,
      title: "new session",
    });
    await patchSession(
      req("PATCH", `/api/sessions/${outside.id}`, { projectId: null }),
      ctx(outside.id),
    );
    expect((await list(`?project=${work.id}`)).map((s) => s.id)).toEqual([inside.id]);

    // only real projects will do
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await createSession(req("POST", "/api/sessions", { projectId: ghost }))).status).toBe(
      400,
    );
    expect((await listSessions(req("GET", "/api/sessions?project=../etc"))).status).toBe(400);
    const bad = await patchSession(
      req("PATCH", `/api/sessions/${inside.id}`, { projectId: ghost }),
      ctx(inside.id),
    );
    expect(bad.status).toBe(400);
  });

  it("sends the project's instructions and files ahead of every chat in it", async () => {
    await useKey();
    await putSettings(req("PUT", "/api/settings", { systemPrompt: "Global rule." }));
    const book = await project("Cookbook");
    await patchProject(
      req("PATCH", `/api/projects/${book.id}`, { instructions: "Metric units only." }),
      pctx(book.id),
    );
    const added = await addFiles(book.id, [["pantry.txt", "flour, salt, yeast"]]);
    expect(added.status).toBe(200);
    const withFile = ((await added.json()) as { project: Project }).project;
    expect(withFile.files.map((f) => [f.name, f.kind])).toEqual([["pantry.txt", "text"]]);

    const provider = stubProvider(() => sseResponse(["ok"]));
    const inside = await sessionIn(book.id);
    await send(inside.id, { content: "what can I bake?" });
    const [system, user] = provider.calls[0]!.body.messages;
    expect(system?.role).toBe("system");
    expect(system?.content).toContain("Global rule.");
    expect(system?.content).toContain('part of the project "Cookbook"');
    expect(system?.content).toContain("Metric units only.");
    expect(system?.content).toContain("Project file: pantry.txt");
    expect(system?.content).toContain("flour, salt, yeast");
    expect(user).toEqual({ role: "user", content: "what can I bake?" });

    // a chat outside the project gets none of it
    const outside = await sessionIn(null);
    await send(outside.id, { content: "hello" });
    expect(provider.calls[1]!.body.messages[0]?.content).toBe("Global rule.");

    // the file is served back as plain text, and can be removed
    const fileId = withFile.files[0]!.id;
    const served = await getProjectFile(
      req("GET", `/api/projects/${book.id}/files/${fileId}`),
      fctx(book.id, fileId),
    );
    expect(served.headers.get("content-type")).toContain("text/plain");
    expect(await served.text()).toBe("flour, salt, yeast");
    const removed = await deleteProjectFile(
      req("DELETE", `/api/projects/${book.id}/files/${fileId}`),
      fctx(book.id, fileId),
    );
    expect(((await removed.json()) as { project: Project }).project.files).toEqual([]);
    expect(fs.existsSync(path.join(data.dir(), "files", book.id, fileId))).toBe(false);
    await send(inside.id, { content: "again" });
    expect(provider.calls[2]!.body.messages[0]?.content).not.toContain("pantry.txt");
  });

  it("refuses files a project cannot use, and more than it can hold", async () => {
    const p = await project("Limits");
    const form = new FormData();
    form.append("files", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], "a.zip"));
    const zip = await addProjectFiles(
      new Request(`${ORIGIN}/api/projects/${p.id}/files`, {
        method: "POST",
        headers: { host: "localhost:3000", origin: ORIGIN },
        body: form,
      }),
      pctx(p.id),
    );
    expect(zip.status).toBe(415);
    const many = Array.from({ length: 21 }, (_, i) => [`n${i}.txt`, "x"] as [string, string]);
    expect((await addFiles(p.id, many)).status).toBe(400);
    expect((await addFiles(p.id, many.slice(0, 20))).status).toBe(200);
    expect((await addFiles(p.id, [["one-more.txt", "x"]])).status).toBe(400);
  });

  it("deleting a project keeps its chats and removes its files", async () => {
    const p = await project("Temporary");
    await addFiles(p.id, [["notes.md", "# notes"]]);
    const chat = await sessionIn(p.id);
    const res = await deleteProject(req("DELETE", `/api/projects/${p.id}`), pctx(p.id));
    expect(res.status).toBe(200);
    expect(await projects()).toEqual([]);
    expect((await detail(chat.id)).session.projectId).toBeNull();
    expect(fs.existsSync(path.join(data.dir(), "files", p.id))).toBe(false);
    expect((await deleteProject(req("DELETE", `/api/projects/${p.id}`), pctx(p.id))).status).toBe(
      404,
    );
  });

  it("is behind the same local-only guard as everything else", async () => {
    const res = await createProject(
      req("POST", "/api/projects", { name: "x" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
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

describe("the context window", () => {
  type Compressed = { session: Session; context: { tokens: number; limit: number } };
  type Sent = { role: string; content: string };
  async function settings(): Promise<PublicSettings> {
    const res = await getSettings(req("GET", "/api/settings"));
    return ((await res.json()) as { settings: PublicSettings }).settings;
  }
  const compress = (id: string) =>
    compressRoute(req("POST", `/api/sessions/${id}/compress`, {}), ctx(id));
  const expand = (id: string) =>
    expandRoute(req("DELETE", `/api/sessions/${id}/compress`), ctx(id));

  it("measures a session against the window in settings, and grows with what is said", async () => {
    await useKey();
    stubProvider(() => sseResponse(["A".repeat(3600)]));
    const session = await create();
    const empty = (await detail(session.id)).context;
    expect(empty.limit).toBe(1_000_000);
    await send(session.id, { content: "B".repeat(7200) });
    const after = (await detail(session.id)).context;
    // 10,800 characters at about 3.6 to the token, and a little for the wrapping
    expect(after.tokens).toBeGreaterThan(3000);
    expect(after.tokens).toBeLessThan(3050);

    await putSettings(req("PUT", "/api/settings", { contextWindow: 8000 }));
    expect((await detail(session.id)).context).toEqual({ tokens: after.tokens, limit: 8000 });
    await putSettings(req("PUT", "/api/settings", { systemPrompt: "S".repeat(360) }));
    expect((await detail(session.id)).context.tokens).toBe(after.tokens + 100);
  });

  it("accepts a sensible window only, and 0 for the default", async () => {
    for (const bad of [5, -1, 50_000_000, "lots"]) {
      const res = await putSettings(req("PUT", "/api/settings", { contextWindow: bad }));
      expect(res.status).toBe(400);
    }
    await putSettings(req("PUT", "/api/settings", { contextWindow: 200_000 }));
    expect(await settings()).toMatchObject({ contextWindow: 200_000 });
    await putSettings(req("PUT", "/api/settings", { contextWindow: 0 }));
    expect(await settings()).toMatchObject({ contextWindow: 1_000_000 });
  });

  it("compresses: the model summarises, and the summary is sent in place of what it covers", async () => {
    await useKey();
    let turn = 0;
    const provider = stubProvider((call) => {
      const last = (call.body.messages as Sent[]).at(-1)!.content;
      return sseResponse([
        last.startsWith("Stop here.") ? "SUMMARY: they greeted each other." : `reply ${++turn}`,
      ]);
    });
    const session = await create();
    await send(session.id, { content: "first " + "x".repeat(4000) });
    await send(session.id, { content: "second" });
    const before = (await detail(session.id)).context.tokens;

    const res = await compress(session.id);
    expect(res.status).toBe(200);
    const done = (await res.json()) as Compressed;
    // the request to summarise carried the whole conversation, then the instruction
    const asked = provider.calls.at(-1)!.body.messages;
    expect(asked.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect((asked as Sent[]).at(-1)!.content).toMatch(
      /^Stop here\. Do not reply to the conversation: summarise it\./,
    );
    expect(provider.calls.at(-1)!.body.web_search_options).toBeUndefined();
    // nothing is thrown away: the messages are all still there, and the summary beside them
    expect(done.session.messages).toHaveLength(4);
    expect(done.session.summary).toMatchObject({
      text: "SUMMARY: they greeted each other.",
      upTo: done.session.messages[3]!.id,
    });
    expect(done.context.tokens).toBeLessThan(before / 10);
    expect((await detail(session.id)).session.summary?.text).toBe(
      "SUMMARY: they greeted each other.",
    );

    // the next turn goes out as the summary and the new message only
    await send(session.id, { content: "third" });
    const next = provider.calls.at(-1)!.body.messages as Sent[];
    expect(next).toHaveLength(2);
    expect(next[0]!.role).toBe("system");
    expect(next[0]!.content).toContain("<summary>\nSUMMARY: they greeted each other.\n</summary>");
    expect(next[1]).toEqual({ role: "user", content: "third" });
    expect(JSON.stringify(next)).not.toContain("xxxx");

    // compressing again folds the old summary and the new messages into a new one
    await compress(session.id);
    const again = provider.calls.at(-1)!.body.messages as Sent[];
    expect(again[0]!.content).toContain("SUMMARY: they greeted each other.");
    expect(again.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("keeps the system prompt ahead of the summary", async () => {
    await useKey();
    await putSettings(req("PUT", "/api/settings", { systemPrompt: "Be brief." }));
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "one" });
    await compress(session.id);
    await send(session.id, { content: "two" });
    const system = (provider.calls.at(-1)!.body.messages as Sent[])[0]!;
    expect(system.role).toBe("system");
    expect(system.content.startsWith("Be brief.")).toBe(true);
    expect(system.content).toContain("<summary>\nok\n</summary>");
  });

  it("can be undone: the whole conversation is sent again", async () => {
    await useKey();
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "one" });
    await compress(session.id);
    const res = await expand(session.id);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Compressed).session.summary).toBeUndefined();
    await send(session.id, { content: "two" });
    expect(provider.calls.at(-1)!.body.messages).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "two" },
    ]);
  });

  it("drops the summary when the message it reaches is deleted", async () => {
    await useKey();
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "one" });
    const { session: compressed } = (await (await compress(session.id)).json()) as Compressed;
    // deleting a message takes everything after it too, the summary's last message included
    const last = compressed.messages[0]!;
    await deleteMessage(req("DELETE", `/api/sessions/${session.id}/messages/${last.id}`), {
      params: Promise.resolve({ id: session.id, messageId: last.id }),
    });
    expect((await detail(session.id)).session.summary).toBeUndefined();
  });

  it("leaves the oldest messages out of the request when the conversation is over the window", async () => {
    await useKey();
    const provider = stubProvider(() => sseResponse(["r".repeat(3000)]));
    const session = await create();
    for (const word of ["alpha", "beta", "gamma", "delta"]) {
      await send(session.id, { content: `${word} ${"w".repeat(3000)}` });
    }
    await putSettings(req("PUT", "/api/settings", { contextWindow: 3000 }));
    expect((await detail(session.id)).context.tokens).toBeGreaterThan(3000);
    const res = await compress(session.id);
    expect(res.status).toBe(200);
    const asked = provider.calls.at(-1)!.body.messages as { content: string }[];
    expect(asked[0]!.content).toMatch(/earliest messages of this conversation are not shown/);
    expect(JSON.stringify(asked)).not.toContain("alpha");
    expect(JSON.stringify(asked)).toContain("delta");
    // the session itself still has every message
    expect((await detail(session.id)).session.messages).toHaveLength(8);
  });

  it("says no plainly: nothing to compress, an unknown session, a busy one, a failed request", async () => {
    await useKey();
    const empty = await create();
    expect(await errorOf(await compress(empty.id))).toMatchObject({ code: "nothing_to_compress" });
    expect((await compress("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await expand("00000000-0000-4000-8000-000000000000")).status).toBe(404);

    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await send(session.id, { content: "one" });
    stubProvider(() => Response.json({ error: { message: "too long" } }, { status: 400 }));
    const failed = await compress(session.id);
    expect(failed.status).toBe(502);
    expect((await detail(session.id)).session.summary).toBeUndefined();
    expect((await detail(session.id)).generating).toBe(false);

    stubProvider(() => sseResponse([""]));
    const hollow = await compress(session.id);
    expect(hollow.status).toBe(502);
    expect((await detail(session.id)).session.summary).toBeUndefined();
  });
});
