import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postFolder } from "@/app/api/folders/route";
import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { GET as getSettings } from "@/app/api/settings/route";
import { canChooseFolder, checkFolder, chooseFolder, shortFolder } from "@/lib/server/folders";
import type { PublicSettings, Session, SessionMeta } from "@/lib/types";
import { useTempDataDir } from "./helpers";

useTempDataDir();

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-folder-"));
  made.push(dir);
  return dir;
}
/** A stand-in for the system's folder window: it answers at once, with what it is told to. */
function dialog(script: string): void {
  const file = path.join(temp(), "choose.sh");
  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  vi.stubEnv("OGCHAT_FOLDER_DIALOG", file);
}
const req = (method: string, url: string, body?: unknown, origin = "http://localhost:3000") =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("a folder of your own", () => {
  it("is taken as it is typed or pasted, and handed back in full", () => {
    const dir = temp();
    expect(checkFolder(dir)).toEqual({ folder: dir });
    expect(checkFolder(`  "${dir}/"  `)).toEqual({ folder: dir });
    expect(checkFolder(`${dir}/sub/..`)).toEqual({ folder: dir });
    expect(checkFolder(`file://${dir}`)).toEqual({ folder: dir });
    expect(checkFolder("~")).toEqual({ folder: os.homedir() });
    expect(shortFolder(path.join(os.homedir(), "projects/site"))).toBe("~/projects/site");
    expect(shortFolder("/opt/site")).toBe("/opt/site");
  });

  it("is refused, with the reason, when it is not a folder on this computer", () => {
    const dir = temp();
    const file = path.join(dir, "notes.txt");
    fs.writeFileSync(file, "x");
    const why = (value: unknown) => (checkFolder(value) as { error: string }).error;
    expect(why(path.join(dir, "missing"))).toMatch(/There is no folder at/);
    expect(why(file)).toMatch(/is a file, not a folder/);
    expect(why("projects/site")).toMatch(/whole path/);
    expect(why("   ")).toMatch(/Give the folder's path/);
    expect(why(`${dir}\0`)).toMatch(/not a folder's path/);
    expect(why(42)).toMatch(/given as its path/);
  });

  it("can be chosen in the system's own window, and cancelling chooses nothing", async () => {
    const dir = temp();
    // As macOS hands it back: with a slash on the end.
    dialog(`echo "${dir}/"`);
    expect(canChooseFolder()).toBe(true);
    expect(await chooseFolder()).toBe(dir);
    dialog("exit 1");
    expect(await chooseFolder()).toBeNull();
    // An answer that is not a folder is no folder.
    dialog(`echo "${dir}/missing"`);
    expect(await chooseFolder()).toBeNull();
  });
});

describe("the folders API", () => {
  const post = async (body: unknown, origin?: string) => {
    const res = await postFolder(req("POST", "/api/folders", body, origin));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("checks a path, opens the window when asked to, and answers this app alone", async () => {
    const dir = temp();
    expect(await post({ path: `${dir}/` })).toEqual({ status: 200, body: { folder: dir } });
    expect(await post({ path: path.join(dir, "missing") })).toMatchObject({
      status: 400,
      body: { error: { code: "bad_folder" } },
    });
    expect((await post({})).status).toBe(400);

    dialog(`echo "${dir}"`);
    expect(await post({ choose: true })).toEqual({ status: 200, body: { folder: dir } });
    dialog("exit 1");
    expect(await post({ choose: true })).toEqual({ status: 200, body: { folder: null } });
    // Another site's page cannot open windows here, nor ask what is on the disk.
    dialog(`echo "${dir}"`);
    expect((await post({ choose: true }, "https://elsewhere.example")).status).toBe(403);
    expect((await post({ path: dir }, "https://elsewhere.example")).status).toBe(403);

    const { settings } = (await (await getSettings(req("GET", "/api/settings"))).json()) as {
      settings: PublicSettings;
    };
    expect(settings.claudeCode.folderDialog).toBe(true);
  });
});

describe("a chat's folder", () => {
  it("is kept with the chat, in place of a repository, and cleared with null", async () => {
    const dir = temp();
    const other = temp();
    const made = (await (
      await createSession(req("POST", "/api/sessions", { folder: `${dir}/` }))
    ).json()) as { session: Session };
    expect(made.session).toMatchObject({ folder: dir, repo: null, branch: null });
    const id = made.session.id;
    const patch = async (body: unknown) => {
      const res = await patchSession(req("PATCH", `/api/sessions/${id}`, body), ctx(id));
      return { status: res.status, session: ((await res.json()) as { session: Session }).session };
    };
    expect((await patch({ folder: other })).session.folder).toBe(other);
    // A repository takes the folder's place, and a folder the repository's and its branch's.
    expect((await patch({ repo: "octo/widgets", branch: "develop" })).session).toMatchObject({
      folder: null,
      repo: "octo/widgets",
      branch: "develop",
    });
    expect((await patch({ folder: dir })).session).toMatchObject({
      folder: dir,
      repo: null,
      branch: null,
    });
    // Other things about where it works leave the folder alone.
    expect((await patch({ environmentId: "default" })).session.folder).toBe(dir);
    expect((await patch({ repo: null })).session.folder).toBe(dir);

    const listed = (
      (await (await listSessions(req("GET", "/api/sessions"))).json()) as {
        sessions: SessionMeta[];
      }
    ).sessions;
    expect(listed[0]).toMatchObject({ id, folder: dir });

    const bad = await patch({ folder: path.join(dir, "missing") });
    expect(bad.status).toBe(400);
    expect((await patch({ folder: null })).session).toMatchObject({ folder: null, repo: null });
    // The folder itself was never touched.
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("creating a chat with a folder that is not there is refused", async () => {
    const res = await createSession(
      req("POST", "/api/sessions", { folder: path.join(temp(), "missing") }),
    );
    expect(res.status).toBe(400);
  });
});
