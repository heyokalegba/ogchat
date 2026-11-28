import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * The desktop app's launcher: which server it shows in its window. It must
 * not go on showing a server from before an update, and it must not leave one
 * behind when the app quits.
 *
 * The servers here are small stand-ins that answer as ogchat does; the
 * launcher finds and stops them as it would the real one.
 */

interface Launcher {
  listener(port: number): { pid: number; cwd: string; started: number } | null;
  staleServer(projectDir: string, port: number): { pid: number } | null;
  startServer(projectDir: string): Promise<{ url: string; stop(): Promise<void> }>;
  stopProcess(pid: number, patience?: number): Promise<boolean>;
}

/** Stands in for `next start`: answers on the port it is given, and says which server it is. */
const STAND_IN = `
const http = require("node:http");
const port = Number(process.argv[process.argv.indexOf("-p") + 1]);
if (process.env.STUBBORN) process.on("SIGTERM", () => {});
http
  .createServer((req, res) => res.end(req.url === "/which" ? process.env.WHICH || "new" : "{}"))
  .listen(port, "127.0.0.1");
`;

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const which = async (url: string) => {
  try {
    return await (await fetch(`${url}/which`)).text();
  } catch {
    return null;
  }
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function until(check: () => boolean | Promise<boolean>, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("waited too long");
}

// The launcher tells whose server it is with lsof and ps, which Windows has not got.
describe.skipIf(process.platform === "win32")("the desktop app's server", () => {
  let root: string;
  let project: string;
  let elsewhere: string;
  let script: string;
  let stamp: string;
  let port: number;
  let url: string;
  let launcher: Launcher;
  const running: ChildProcess[] = [];

  /** A server as one left over would be: started on its own, from the folder given. */
  async function leftOver(cwd: string, env: Record<string, string> = {}) {
    const child = spawn(process.execPath, [script, "start", "-p", String(port)], {
      cwd,
      env: { ...process.env, WHICH: "old", ...env },
      stdio: "ignore",
    });
    running.push(child);
    await until(async () => (await which(url)) === "old");
    return child.pid!;
  }

  /** Marks the project as built this many seconds from now (before now, if negative). */
  const builtIn = (seconds: number) => {
    const at = new Date(Date.now() + seconds * 1000);
    fs.utimesSync(stamp, at, at);
  };

  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-desktop-")));
    project = path.join(root, "project");
    elsewhere = path.join(root, "elsewhere");
    script = path.join(project, "node_modules", "next", "dist", "bin", "next");
    stamp = path.join(project, ".next", "BUILD_ID");
    for (const dir of [path.dirname(script), path.dirname(stamp), elsewhere]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(script, STAND_IN);
    fs.writeFileSync(stamp, "build");
    port = await freePort();
    url = `http://127.0.0.1:${port}`;
    // The launcher reads its port once, as it is loaded.
    process.env.OGCHAT_PORT = String(port);
    delete process.env.OGCHAT_NODE;
    launcher = createRequire(import.meta.url)("../electron/server.cjs") as Launcher;
  });

  afterEach(async () => {
    delete process.env.STUBBORN;
    for (const child of running.splice(0)) child.kill("SIGKILL");
    await until(async () => (await which(url)) === null);
  });

  afterAll(() => {
    delete process.env.OGCHAT_PORT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("knows whose server is on a port, and whether it is from before the last build", async () => {
    expect(launcher.listener(port)).toBeNull();
    const pid = await leftOver(project);
    const found = launcher.listener(port)!;
    expect(found).toMatchObject({ pid, cwd: project });
    expect(Math.abs(found.started - Date.now())).toBeLessThan(60_000);

    builtIn(-3600);
    expect(launcher.staleServer(project, port)).toBeNull();
    builtIn(+3600);
    expect(launcher.staleServer(project, port)).toMatchObject({ pid });
    // Another folder's server is not this project's to judge, and nor is one never built.
    expect(launcher.staleServer(elsewhere, port)).toBeNull();
    fs.renameSync(stamp, `${stamp}.away`);
    expect(launcher.staleServer(project, port)).toBeNull();
    fs.renameSync(`${stamp}.away`, stamp);
  });

  it("replaces its own server from before the last build, on the same port", async () => {
    const old = await leftOver(project);
    builtIn(+3600);
    const server = await launcher.startServer(project);
    expect(server.url).toBe(url);
    expect(await which(url)).toBe("new");
    expect(alive(old)).toBe(false);

    await server.stop();
    expect(await which(url)).toBeNull();
    expect(launcher.listener(port)).toBeNull();
  }, 30_000);

  it("replaces one that will not go when asked", async () => {
    const old = await leftOver(project, { STUBBORN: "1" });
    builtIn(+3600);
    expect(await launcher.stopProcess(old, 300)).toBe(true);
    expect(alive(old)).toBe(false);
  }, 30_000);

  it("uses a server that is up to date, or is not its own, as it finds it", async () => {
    builtIn(-3600);
    const fresh = await leftOver(project);
    const first = await launcher.startServer(project);
    expect(first.url).toBe(url);
    await first.stop();
    expect(alive(fresh)).toBe(true);
    expect(await which(url)).toBe("old");
    running.splice(0)[0]!.kill("SIGKILL");
    await until(async () => (await which(url)) === null);

    builtIn(+3600);
    const other = await leftOver(elsewhere);
    const second = await launcher.startServer(project);
    expect(second.url).toBe(url);
    await second.stop();
    expect(alive(other)).toBe(true);
    expect(await which(url)).toBe("old");
  }, 30_000);

  it("stops the server it started, even one with something still going on", async () => {
    builtIn(-3600);
    process.env.STUBBORN = "1";
    const server = await launcher.startServer(project);
    expect(await which(url)).toBe("new");
    const { pid } = launcher.listener(port)!;

    await server.stop();
    expect(alive(pid)).toBe(false);
    expect(await which(url)).toBeNull();
  }, 30_000);
});
