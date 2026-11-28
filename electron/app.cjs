/**
 * What the app runs first: it finds the launcher and hands over to it.
 *
 * The launcher (main.cjs and server.cjs) is taken from the project the app
 * runs, where there is one, and not from the copy inside the app. So a fix
 * to the launcher arrives with the rest of an update, the next time the app
 * is opened, and the app itself does not have to be built again for it. The
 * copy inside the app is what is used when the project's cannot be loaded.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Where the project is: said in the environment, or written into the app when it was built. */
function projectDir() {
  if (process.env.OGCHAT_PROJECT_DIR) return process.env.OGCHAT_PROJECT_DIR;
  try {
    const note = path.join(process.resourcesPath, "ogchat.json");
    return JSON.parse(fs.readFileSync(note, "utf8")).projectDir || null;
  } catch {
    return null; // not packaged: the launcher beside this file is the project's own
  }
}

const own = path.join(__dirname, "main.cjs");
const dir = projectDir();
const theirs = dir ? path.join(dir, "electron", "main.cjs") : null;

if (theirs && theirs !== own && fs.existsSync(theirs)) {
  try {
    require(theirs);
  } catch (err) {
    console.error(`ogchat: the project's launcher could not be loaded; using the app's own.`, err);
    require(own);
  }
} else {
  require(own);
}
