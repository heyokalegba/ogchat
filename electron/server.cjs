/**
 * Runs ogchat's own server for the desktop app.
 *
 * The app is a window around the same local server the browser uses. This
 * file finds the project, makes sure it is built, starts `next start` on a
 * port of its own and says when it is answering.
 * No Electron APIs in here, so it can be exercised with plain node.
 */
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

/**
 * The desktop app's own port, so its saved look does not depend on what else
 * is running. OGCHAT_PORT moves it, for trying the app beside one in use.
 */
const FIRST_PORT = Number(process.env.OGCHAT_PORT) || 3311;

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The program that runs the server, and what it needs in its environment.
 *
 * It must not be the app's own program. Electron can run as plain Node, but
 * on a Mac a second copy of the app's program shows up in the Dock as an
 * icon of its own, and since it never opens a window that icon bounces for
 * as long as the server runs. So, in order:
 *
 *  1. A real Node: the one the app was built with (OGCHAT_NODE, noted at
 *     build time), or the one npm is running under. Node is a command-line
 *     program and never appears in the Dock.
 *  2. Electron's helper program run as Node. The helper is the part of the
 *     app that is marked as having no Dock icon.
 *  3. The app's own program run as Node: the last resort, and all there is
 *     outside a Mac.
 */
function runtime() {
  for (const node of [process.env.OGCHAT_NODE, process.env.npm_node_execpath]) {
    if (node && isFile(node)) return { command: node, env: {} };
  }
  const asNode = process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
  if (process.platform === "darwin" && process.versions.electron) {
    const name = path.basename(process.execPath);
    const helper = path.join(
      path.dirname(process.execPath),
      "..",
      "Frameworks",
      `${name} Helper.app`,
      "Contents",
      "MacOS",
      `${name} Helper`,
    );
    if (isFile(helper)) return { command: helper, env: asNode };
  }
  return { command: process.execPath, env: asNode };
}

/** Runs a Node script with the program `runtime` picks. */
function runNode(args, cwd, onLine) {
  const { command, env } = runtime();
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const feed = (chunk) => {
    for (const line of String(chunk).split("\n")) if (line.trim()) onLine?.(line.trim());
  };
  child.stdout.on("data", feed);
  child.stderr.on("data", feed);
  return child;
}

function nextBin(projectDir) {
  return path.join(projectDir, "node_modules", "next", "dist", "bin", "next");
}

/** What stands in the way of running the project at `projectDir`, in plain words, or null. */
function problemWith(projectDir) {
  if (!fs.existsSync(path.join(projectDir, "package.json"))) {
    return `The ogchat project was not found at ${projectDir}. If you moved it, build the app again from its new place (npm run mac).`;
  }
  if (!fs.existsSync(nextBin(projectDir))) {
    return `ogchat's packages are not installed. In Terminal, run:  cd "${projectDir}" && npm install`;
  }
  return null;
}

/** Newest modification time under a folder, skipping what never needs a rebuild. */
function newest(dir) {
  let latest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : fs.statSync(full).mtimeMs);
  }
  return latest;
}

/** Whether the project has to be built before it can be served: never built, or changed since. */
function needsBuild(projectDir) {
  const stamp = path.join(projectDir, ".next", "BUILD_ID");
  if (!fs.existsSync(stamp)) return true;
  const built = fs.statSync(stamp).mtimeMs;
  const sources = ["src", "public"]
    .map((name) => path.join(projectDir, name))
    .filter(fs.existsSync);
  const files = ["package.json", "next.config.ts"].map((name) => path.join(projectDir, name));
  return (
    sources.some((dir) => newest(dir) > built) ||
    files.some((file) => fs.existsSync(file) && fs.statSync(file).mtimeMs > built)
  );
}

/** Builds the project. Resolves when done; rejects with the tail of the build's output. */
function build(projectDir, onLine) {
  return new Promise((resolve, reject) => {
    const all = [];
    const child = runNode([nextBin(projectDir), "build"], projectDir, (line) => {
      // Without the colour codes a terminal would use, which a dialog shows as noise.
      all.push(line.replace(/\u001b\[[0-9;]*m/g, ""));
      onLine?.(line);
    });
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      // The whole output goes to a file; the dialog shows the lines that say what failed,
      // which are rarely the last ones, and then the end of it.
      const log = path.join(projectDir, "build-error.log");
      try {
        fs.writeFileSync(log, all.join("\n"));
      } catch {
        // the dialog will have to do
      }
      const telling = all.filter((line) =>
        /error|failed|cannot|not found|unexpected|ENOENT|EACCES|EMFILE|ENOSPC|killed|heap/i.test(
          line,
        ),
      );
      const shown = [...new Set([...telling.slice(0, 14), ...all.slice(-8)])].join("\n");
      reject(
        new Error(
          `The build failed (exit code ${code}).\n\n${shown}\n\nThe full output is in ${log}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** Whether ogchat is answering at this address. */
function answers(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/settings`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What a command prints, or "" where it cannot be run or says nothing. */
function said(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
  } catch {
    return "";
  }
}

function realPath(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

/**
 * The process listening on a port of this computer: its id, the folder it
 * runs in and when it started. Null where that cannot be told (no `lsof`, as
 * on Windows, or nothing is listening).
 */
function listener(port) {
  const pid = Number(said("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]).split("\n")[0]);
  return about(pid);
}

function about(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const cwd = said("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  const started = Date.parse(said("ps", ["-o", "lstart=", "-p", String(pid)]));
  if (!cwd || !Number.isFinite(started)) return null;
  return { pid, cwd, started };
}

/**
 * The process to replace, if the ogchat answering on `port` is this project's
 * own server from before the project was last built.
 *
 * A server goes on serving the build it started with. One left running from
 * before an update (the app did not get to stop it, or it was started some
 * other way) would otherwise be taken for "already running" and shown in the
 * window: the old ogchat, however many times the app is opened again.
 *
 * Only a server run from this very folder is ever judged, and only by times
 * the computer itself gives: anything else answering here is left alone.
 */
function staleServer(projectDir, port) {
  const running = listener(port);
  if (!running || realPath(running.cwd) !== realPath(projectDir)) return null;
  let built;
  try {
    built = fs.statSync(path.join(projectDir, ".next", "BUILD_ID")).mtimeMs;
  } catch {
    return null;
  }
  // `ps` gives the start to the second, so a server started just as the build ended is not old.
  return running.started + 2000 < built ? running : null;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stops a process: asks first, and after a while no longer asks. True once it is gone. */
async function stopProcess(pid, patience = 3000) {
  const gone = async (ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
      if (!alive(pid)) return true;
    }
    return !alive(pid);
  };
  try {
    process.kill(pid, "SIGTERM");
    if (await gone(patience)) return true;
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone, or not ours to stop
  }
  return gone(2000);
}

/** Whether this process was started by the one given, however far back. */
function startedBy(pid) {
  for (let at = process.ppid, n = 0; Number.isInteger(at) && at > 1 && n < 40; n++) {
    if (at === pid) return true;
    at = Number(said("ps", ["-o", "ppid=", "-p", String(at)]));
  }
  return false;
}

/**
 * Stops this project's servers on the app's ports, and resolves with the ids
 * of the ones it stopped. The project's build calls this as it begins (see
 * next.config.ts).
 *
 * A build puts new files where a running server's were, so that server is
 * done for either way: it would go on answering with the old ogchat, or with
 * half of each. Stopping it here is also what lets any copy of the app, even
 * one built long ago, show an update after no more than quitting and opening
 * it again: the app builds, the old server goes, and the app, finding none,
 * starts one.
 *
 * Servers run from another folder are left alone, as are ports that are not
 * the app's, and the server this build was itself started from (a chat that
 * builds ogchat inside ogchat would otherwise end its own reply).
 */
async function stopServers(projectDir) {
  const last = FIRST_PORT + 19;
  const pids = said("lsof", ["-nP", "-t", `-iTCP:${FIRST_PORT}-${last}`, "-sTCP:LISTEN"]);
  const stopped = [];
  for (const pid of new Set(pids.split("\n").map(Number))) {
    const running = about(pid);
    if (!running || realPath(running.cwd) !== realPath(projectDir)) continue;
    if (pid === process.pid || startedBy(pid)) continue;
    if (await stopProcess(pid)) stopped.push(pid);
  }
  return stopped;
}

/**
 * Stops the server this app started, and resolves once it has gone. A server
 * with a reply still streaming does not always leave when asked, and one that
 * outlives the app is the old ogchat the next launch would find.
 */
function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const force = setTimeout(() => child.kill("SIGKILL"), 2500);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill();
  });
}

/**
 * Starts the server and resolves with { url, stop } once it answers. `stop`
 * resolves when the server has gone.
 *
 * If an ogchat is already answering on the app's port (a second window, say),
 * that one is used and `stop` does nothing. Unless it is this project's own
 * server from before the last build: that one is stopped and a new one is
 * started in its place.
 */
async function startServer(projectDir, onLine) {
  let port = FIRST_PORT;
  for (; port < FIRST_PORT + 20; port++) {
    if (await answers(`http://127.0.0.1:${port}`)) {
      const old = staleServer(projectDir, port);
      if (!old) return { url: `http://127.0.0.1:${port}`, stop: async () => {} };
      onLine?.(`replacing the server from before the last build (process ${old.pid})`);
      await stopProcess(old.pid);
    }
    if (await portFree(port)) break;
  }
  const url = `http://127.0.0.1:${port}`;
  const tail = [];
  const child = runNode(
    [nextBin(projectDir), "start", "-H", "127.0.0.1", "-p", String(port)],
    projectDir,
    (line) => {
      tail.push(line);
      if (tail.length > 30) tail.shift();
      onLine?.(line);
    },
  );
  let exited = false;
  child.on("exit", () => (exited = true));
  child.on("error", (error) => {
    tail.push(String(error && error.message ? error.message : error));
    exited = true;
  });
  for (let n = 0; n < 120; n++) {
    if (exited) throw new Error(`The server stopped.\n\n${tail.join("\n")}`);
    if (await answers(url)) return { url, stop: () => stopChild(child) };
    await sleep(250);
  }
  await stopChild(child);
  throw new Error(`The server did not start in time.\n\n${tail.join("\n")}`);
}

module.exports = {
  build,
  listener,
  needsBuild,
  problemWith,
  runtime,
  staleServer,
  startServer,
  startedBy,
  stopProcess,
  stopServers,
};
