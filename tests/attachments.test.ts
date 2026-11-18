import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILES_PER_MESSAGE, MAX_IMAGE_BYTES, MAX_TEXT_CHARS } from "@/lib/limits";
import { buildChatRequest } from "@/lib/provider/adapter";
import type { Attachment, Session, SessionDetail, SessionMeta, StreamEvent } from "@/lib/types";
import { GET as getFile } from "@/app/api/sessions/[id]/files/[fileId]/route";
import { DELETE as deleteMessage } from "@/app/api/sessions/[id]/messages/[messageId]/route";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { DELETE as deleteSession, GET as getSession } from "@/app/api/sessions/[id]/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { PUT as putSettings } from "@/app/api/settings/route";
import { forbidNetwork, sseResponse, stubProvider, TEST_KEY, useTempDataDir } from "./helpers";

const data = useTempDataDir();
const ORIGIN = "http://localhost:3000";
const HEADERS = { host: "localhost:3000", origin: ORIGIN };

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfe]);

/** A minimal one-page PDF containing the given line of text. */
function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

beforeEach(async () => {
  forbidNetwork();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const res = await putSettings(
    new Request(`${ORIGIN}/api/settings`, {
      method: "PUT",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ apiKey: TEST_KEY }),
    }),
  );
  expect(res.status).toBe(200);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(): Promise<Session> {
  const res = await createSession(
    new Request(`${ORIGIN}/api/sessions`, { method: "POST", headers: HEADERS }),
  );
  return ((await res.json()) as { session: Session }).session;
}

async function detail(id: string): Promise<SessionDetail> {
  const res = await getSession(
    new Request(`${ORIGIN}/api/sessions/${id}`, { headers: HEADERS }),
    ctx(id),
  );
  return (await res.json()) as SessionDetail;
}

type Upload = [name: string, content: string | Uint8Array, type?: string];

function upload(id: string, content: string, files: Upload[], extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("content", content);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  for (const [name, body, type] of files) {
    form.append("files", new File([body as BlobPart], name, { type: type ?? "" }));
  }
  return sendMessage(
    new Request(`${ORIGIN}/api/sessions/${id}/messages`, {
      method: "POST",
      headers: HEADERS,
      body: form,
    }),
    ctx(id),
  );
}

async function events(res: Response): Promise<StreamEvent[]> {
  expect(res.status).toBe(200);
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

async function fetchFile(id: string, fileId: string): Promise<Response> {
  return getFile(
    new Request(`${ORIGIN}/api/sessions/${id}/files/${fileId}`, { headers: HEADERS }),
    {
      params: Promise.resolve({ id, fileId }),
    },
  );
}

function storedFiles(id: string): string[] {
  try {
    return fs.readdirSync(path.join(data.dir(), "files", id)).sort();
  } catch {
    return [];
  }
}

async function attachmentsOf(id: string, index = 0): Promise<Attachment[]> {
  return (await detail(id)).session.messages[index]?.attachments ?? [];
}

describe("attaching files to a message", () => {
  it("inlines a text file into the prompt and keeps it in context on later turns", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    const notes = "# Notes\n\nShip on Friday.\n";

    const stream = await events(
      await upload(session.id, "Summarize this", [["notes.md", notes, "text/markdown"]]),
    );
    const start = stream[0] as Extract<StreamEvent, { type: "start" }>;
    expect(start.userMessage?.attachments).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: "notes.md",
        mime: "text/plain",
        size: notes.length,
        kind: "text",
      },
    ]);

    expect(provider.calls[0]?.body.messages).toEqual([
      {
        role: "user",
        content:
          "Summarize this\n\nAttached file: notes.md\n```\n# Notes\n\nShip on Friday.\n\n```",
      },
    ]);

    // A follow-up without files still carries the file in the history.
    await events(
      await sendMessage(
        new Request(`${ORIGIN}/api/sessions/${session.id}/messages`, {
          method: "POST",
          headers: { ...HEADERS, "content-type": "application/json" },
          body: JSON.stringify({ content: "And the deadline?" }),
        }),
        ctx(session.id),
      ),
    );
    const second = provider.calls[1]?.body.messages as { role: string; content: string }[];
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[0]?.content).toContain("Ship on Friday.");
    expect(second[2]?.content).toBe("And the deadline?");
  });

  it("sends an image as an image part and serves it back as an image", async () => {
    const provider = stubProvider(() => sseResponse(["a picture"]));
    const session = await create();
    await events(await upload(session.id, "What is this?", [["shot.png", PNG, "image/png"]]));

    expect(provider.calls[0]?.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` },
          },
        ],
      },
    ]);

    const [attachment] = await attachmentsOf(session.id);
    expect(attachment).toMatchObject({
      name: "shot.png",
      mime: "image/png",
      kind: "image",
      size: PNG.length,
    });
    const res = await fetchFile(session.id, attachment!.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("extracts the text of a PDF", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(
      await upload(session.id, "", [
        ["report.pdf", makePdf("Quarterly numbers are up"), "application/pdf"],
      ]),
    );

    const content = (provider.calls[0]?.body.messages[0] as { content: string }).content;
    expect(content).toContain("Attached file: report.pdf");
    expect(content).toContain("Quarterly numbers are up");
    const [attachment] = await attachmentsOf(session.id);
    expect(attachment).toMatchObject({ name: "report.pdf", mime: "application/pdf", kind: "text" });

    const res = await fetchFile(session.id, attachment!.id);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toContain("Quarterly numbers are up");
  });

  it("accepts files without any message text, and titles the session after the file", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "   ", [["budget.csv", "a,b\n1,2\n"]]));
    const stored = await detail(session.id);
    expect(stored.session.title).toBe("budget.csv");
    expect(stored.session.messages[0]).toMatchObject({ role: "user", content: "" });
  });

  it("mixes several files, images last, in one message", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(
      await upload(session.id, "Compare", [
        ["a.txt", "alpha"],
        ["photo.jpg", JPEG, "image/jpeg"],
        ["b.py", "print('beta')\n"],
      ]),
    );
    const content = provider.calls[0]?.body.messages[0]?.content as unknown as {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
    expect(content.map((part) => part.type)).toEqual(["text", "image_url"]);
    expect(content[0]?.text).toBe(
      "Compare\n\nAttached file: a.txt\n```\nalpha\n```\n\nAttached file: b.py\n```\nprint('beta')\n\n```",
    );
    expect(content[1]?.image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(storedFiles(session.id)).toHaveLength(3);
  });

  it("decides what a file is from its content, not its name or declared type", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(
      await upload(session.id, "x", [
        ["actually-text.png", "just words", "image/png"],
        ["actually-image.txt", PNG, "text/plain"],
      ]),
    );
    expect((await attachmentsOf(session.id)).map((a) => [a.name, a.kind, a.mime])).toEqual([
      ["actually-text.png", "text", "text/plain"],
      ["actually-image.txt", "image", "image/png"],
    ]);
    const parts = provider.calls[0]?.body.messages[0]?.content as unknown as { type: string }[];
    expect(parts.map((p) => p.type)).toEqual(["text", "image_url"]);
  });

  it("fences file text that itself contains code fences", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "", [["readme.md", "Run:\n````sh\nnpm test\n````"]]));
    const content = (provider.calls[0]?.body.messages[0] as { content: string }).content;
    expect(content).toBe("Attached file: readme.md\n`````\nRun:\n````sh\nnpm test\n````\n`````");
  });

  it("cuts very long text and says so", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "", [["big.log", "x".repeat(MAX_TEXT_CHARS + 500)]]));
    const [attachment] = await attachmentsOf(session.id);
    expect(attachment).toMatchObject({ truncated: true, size: MAX_TEXT_CHARS + 500 });
    const content = (provider.calls[0]?.body.messages[0] as { content: string }).content;
    expect(content).toContain("Attached file: big.log (truncated)");
    expect(content.length).toBeLessThan(MAX_TEXT_CHARS + 200);
  });

  it("strips directories and control characters from file names", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "", [["../../etc/pass\u0000wd", "root"]]));
    expect((await attachmentsOf(session.id))[0]?.name).toBe("passwd");
    expect(fs.readdirSync(data.dir()).sort()).toEqual(["files", "sessions", "settings.json"]);
  });
});

describe("refusing files", () => {
  async function expectRejected(res: Response, status: number, code: string, sessionId: string) {
    expect(res.status).toBe(status);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect(error.code).toBe(code);
    // Nothing was stored, and the session is free for the next attempt.
    const stored = await detail(sessionId);
    expect(stored.session.messages).toEqual([]);
    expect(stored.generating).toBe(false);
    expect(storedFiles(sessionId)).toEqual([]);
    return error.message;
  }

  it("refuses a file type it cannot read, naming the file", async () => {
    const provider = stubProvider(() => sseResponse(["never"]));
    const session = await create();
    const message = await expectRejected(
      await upload(session.id, "see attached", [["archive.zip", ZIP, "application/zip"]]),
      415,
      "unsupported_file",
      session.id,
    );
    expect(message).toContain("archive.zip");
    expect(provider.calls).toEqual([]);
  });

  it("refuses the whole message when any one file is bad", async () => {
    stubProvider(() => sseResponse(["never"]));
    const session = await create();
    await expectRejected(
      await upload(session.id, "two files", [
        ["fine.txt", "fine"],
        ["archive.zip", ZIP],
      ]),
      415,
      "unsupported_file",
      session.id,
    );
  });

  it("refuses an empty file, a broken PDF, an oversized image and too many files", async () => {
    stubProvider(() => sseResponse(["never"]));
    const session = await create();
    await expectRejected(
      await upload(session.id, "x", [["empty.txt", ""]]),
      400,
      "empty_file",
      session.id,
    );
    await expectRejected(
      await upload(session.id, "x", [["broken.pdf", "%PDF-1.4 this is not a real pdf"]]),
      422,
      "unreadable_file",
      session.id,
    );
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(PNG);
    await expectRejected(
      await upload(session.id, "x", [["huge.png", huge]]),
      413,
      "file_too_large",
      session.id,
    );
    const many: Upload[] = Array.from({ length: MAX_FILES_PER_MESSAGE + 1 }, (_, i) => [
      `f${i}.txt`,
      "x",
    ]);
    await expectRejected(await upload(session.id, "x", many), 400, "too_many_files", session.id);
  });

  it("refuses an upload from another origin", async () => {
    const session = await create();
    const form = new FormData();
    form.set("content", "hi");
    form.append("files", new File(["x"], "x.txt"));
    const res = await sendMessage(
      new Request(`${ORIGIN}/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { host: "localhost:3000", origin: "https://evil.test" },
        body: form,
      }),
      ctx(session.id),
    );
    expect(res.status).toBe(403);
    expect(storedFiles(session.id)).toEqual([]);
  });
});

describe("attachments follow their message", () => {
  it("keeps the files when the message is edited and re-sent", async () => {
    const provider = stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "Sumarize", [["notes.md", "Ship on Friday."]]));
    const before = (await detail(session.id)).session.messages;
    const original = before[0]!;

    await events(
      await sendMessage(
        new Request(`${ORIGIN}/api/sessions/${session.id}/messages`, {
          method: "POST",
          headers: { ...HEADERS, "content-type": "application/json" },
          body: JSON.stringify({ content: "Summarize", replaceFromMessageId: original.id }),
        }),
        ctx(session.id),
      ),
    );
    const after = (await detail(session.id)).session.messages;
    expect(after.map((m) => m.content)).toEqual(["Summarize", "ok"]);
    expect(after[0]?.attachments).toEqual(original.attachments);
    expect(storedFiles(session.id)).toEqual([original.attachments![0]!.id]);
    expect((provider.calls[1]?.body.messages[0] as { content: string }).content).toBe(
      "Summarize\n\nAttached file: notes.md\n```\nShip on Friday.\n```",
    );
  });

  it("removes the files when the message is deleted", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "first", [["keep.txt", "keep"]]));
    await events(
      await upload(session.id, "second", [
        ["drop.txt", "drop"],
        ["drop.png", PNG],
      ]),
    );
    const messages = (await detail(session.id)).session.messages;
    expect(storedFiles(session.id)).toHaveLength(3);

    const target = messages[2]!;
    const res = await deleteMessage(
      new Request(`${ORIGIN}/api/sessions/${session.id}/messages/${target.id}`, {
        method: "DELETE",
        headers: HEADERS,
      }),
      { params: Promise.resolve({ id: session.id, messageId: target.id }) },
    );
    expect(res.status).toBe(200);
    expect(storedFiles(session.id)).toEqual([messages[0]!.attachments![0]!.id]);
    expect((await fetchFile(session.id, target.attachments![0]!.id)).status).toBe(404);
  });

  it("removes every file when the session is deleted", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(
      await upload(session.id, "x", [
        ["a.txt", "a"],
        ["b.png", PNG],
      ]),
    );
    expect(storedFiles(session.id)).toHaveLength(2);
    await deleteSession(
      new Request(`${ORIGIN}/api/sessions/${session.id}`, { method: "DELETE", headers: HEADERS }),
      ctx(session.id),
    );
    expect(fs.existsSync(path.join(data.dir(), "files", session.id))).toBe(false);
  });

  it("survives a restart: metadata in the session, bytes on disk", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "x", [["a.txt", "persisted text"]]));
    vi.resetModules();
    const store = await import("@/lib/server/store");
    const files = await import("@/lib/server/files");
    const restored = store.getSession(session.id)!;
    const attachment = restored.messages[0]!.attachments![0]!;
    expect(attachment.name).toBe("a.txt");
    expect(files.readFile(session.id, attachment.id)?.toString("utf8")).toBe("persisted text");
  });

  it("finds a session by the name of an attached file", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const session = await create();
    await events(await upload(session.id, "see file", [["tax-return-2025.pdf.txt", "numbers"]]));
    await create();
    const res = await listSessions(
      new Request(`${ORIGIN}/api/sessions?q=tax-return`, { headers: HEADERS }),
    );
    const { sessions } = (await res.json()) as { sessions: SessionMeta[] };
    expect(sessions.map((s) => s.id)).toEqual([session.id]);
  });

  it("does not serve files across sessions or outside the data directory", async () => {
    stubProvider(() => sseResponse(["ok"]));
    const a = await create();
    const b = await create();
    await events(await upload(a.id, "x", [["a.txt", "secret of a"]]));
    const [attachment] = await attachmentsOf(a.id);
    expect((await fetchFile(a.id, attachment!.id)).status).toBe(200);
    expect((await fetchFile(b.id, attachment!.id)).status).toBe(404);
    expect((await fetchFile(a.id, "../../settings.json")).status).toBe(404);
    expect((await fetchFile("../sessions", `${a.id}.json`)).status).toBe(404);
  });
});

describe("adapter", () => {
  it("passes content parts through to the provider unchanged", () => {
    const { init } = buildChatRequest(
      { baseUrl: "https://api.abliteration.ai/v1", apiKey: "k", model: "m" },
      [
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
        { role: "assistant", content: "seen" },
      ],
    );
    expect(JSON.parse(init.body).messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
      { role: "assistant", content: "seen" },
    ]);
  });
});
