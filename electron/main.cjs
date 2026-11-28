/**
 * ogchat as a desktop app.
 *
 * A window of its own around the local server: on launch it builds the
 * project if it has changed, starts the server on the app's own port, and
 * shows it. Quitting the app stops the server. Everything stays where it was:
 * chats and settings in the project's data folder, the key in .env.local.
 */
const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { build, needsBuild, problemWith, startServer } = require("./server.cjs");

/** What was written into the app when it was built: where the project is, and which Node built it. */
function noted() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "ogchat.json"), "utf8"));
  } catch {
    return {}; // not packaged
  }
}

/** The project this app runs: beside us in development, written down at build time otherwise. */
function projectDir() {
  return process.env.OGCHAT_PROJECT_DIR || noted().projectDir || path.resolve(__dirname, "..");
}

// The server runs under the Node the app was built with, when it is still there (see server.cjs).
if (!process.env.OGCHAT_NODE && noted().node) process.env.OGCHAT_NODE = noted().node;

let server = null;
let quitting = false;

/** A small page shown while the app gets ready, in the app's own colours. */
function splash(message) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;
    place-items:center;background:#151b2e;color:#ebe4d4;font:600 15px ui-monospace,Menlo,monospace">
    <div><div style="font-size:34px;font-weight:700">ogchat<span style="display:inline-block;width:.5em;
    height:.9em;margin-left:6px;background:#c0563e;vertical-align:-.08em"></span></div>
    <p style="opacity:.75">${message}</p></div></body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * Links out of a chat open in the browser. The app's own pages may open in
 * the app: an attachment, or a chat dragged out into a window of its own,
 * which gets the size and place it asked for and behaves like the first
 * window (its own links go out to the browser too).
 */
function keepLinksOut(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (server && url.startsWith(server.url)) {
      // An attachment is served as bare text, which brings no colours of its
      // own: black letters on whatever the window is. So its window is white.
      // (On the app's night blue the text could not be read.)
      const bareFile = /\/api\/(sessions|projects)\/[^/]+\/files\//.test(url);
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          minWidth: 480,
          minHeight: 420,
          title: "ogchat",
          backgroundColor: bareFile ? "#ffffff" : "#151b2e",
          webPreferences: { contextIsolation: true, sandbox: true },
        },
      };
    }
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}
app.on("web-contents-created", (_event, contents) => keepLinksOut(contents));

async function open() {
  const dir = projectDir();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 520,
    title: "ogchat",
    backgroundColor: "#151b2e",
    // The window is left to sleep when it is covered, as any app's is. Keeping
    // it awake (backgroundThrottling: false) made the whole scene flicker on
    // a Mac, so that is not done.
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  keepLinksOut(window.webContents);

  const fail = (message) => {
    dialog.showErrorBox("ogchat could not start", message);
    app.quit();
  };

  const problem = problemWith(dir);
  if (problem) return fail(problem);
  try {
    if (needsBuild(dir)) {
      await window.loadURL(splash("getting ready: this takes a minute after an update"));
      await build(dir);
    } else {
      await window.loadURL(splash("starting"));
    }
    server = await startServer(dir);
    if (quitting) return server.stop();
    await window.loadURL(server.url);
  } catch (err) {
    return fail(String(err && err.message ? err.message : err));
  }

  // For checking the app from a script: say what loaded, save a picture, and quit.
  if (process.env.OGCHAT_SMOKE) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const image = await window.webContents.capturePage();
    fs.writeFileSync(process.env.OGCHAT_SMOKE, image.toPNG());
    console.log(`smoke: loaded ${window.webContents.getURL()} titled "${window.getTitle()}"`);
    app.quit();
  }
}

app.whenReady().then(open);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  quitting = true;
  server?.stop();
});
