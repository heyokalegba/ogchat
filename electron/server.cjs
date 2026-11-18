/**
 * Runs ogchat's own server for the desktop app.
 *
 * The app is a window around the same local server the browser uses. This
 * file finds the project, makes sure it is built, starts `next start` on a
 * port of its own and says when it is answering. It uses whatever Node is
 * running it: Electron's own, so the Mac needs no separate Node at run time.
 * No Electron APIs in here, so it can be exercised with plain node.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

/** The desktop app's own port, so its saved look does not depend on what else is running. */
const FIRST_PORT = 3311;

/** Runs a Node script with the Node that is running us (Electron's, when inside the app). */
function runNode(args, cwd, onLine) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NEXT_TELEMETRY_DISABLED: "1" },
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
    const tail = [];
    const child = runNode([nextBin(projectDir), "build"], projectDir, (line) => {
      tail.push(line);
      if (tail.length > 30) tail.shift();
      onLine?.(line);
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`The build failed.\n\n${tail.join("\n")}`)),
    );
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

/**
 * Starts the server and resolves with { url, stop } once it answers. If an
 * ogchat is already answering on the app's port (a second window, say), that
 * one is used and `stop` does nothing.
 */
async function startServer(projectDir, onLine) {
  let port = FIRST_PORT;
  for (; port < FIRST_PORT + 20; port++) {
    if (await answers(`http://127.0.0.1:${port}`)) {
      return { url: `http://127.0.0.1:${port}`, stop() {} };
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
  for (let n = 0; n < 120; n++) {
    if (exited) throw new Error(`The server stopped.\n\n${tail.join("\n")}`);
    if (await answers(url)) return { url, stop: () => child.kill() };
    await sleep(250);
  }
  child.kill();
  throw new Error(`The server did not start in time.\n\n${tail.join("\n")}`);
}

module.exports = { build, needsBuild, problemWith, startServer };
