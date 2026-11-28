import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A folder of your own for a chat to work in.
 *
 * A chat on Claude Code is usually given a folder that ogchat keeps for it: a
 * clone of a repository, or an empty one. It can be pointed at a folder that
 * is already on this computer instead, and then Claude Code reads and edits
 * the files where they are. ogchat only checks that the folder is there and
 * starts the program in it; what the program may do there is its permission
 * level in settings.
 */

const MAX_PATH_CHARS = 1024;

function expand(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * A folder as it was typed or pasted: its full path if it is a folder on this
 * computer, otherwise what is wrong with it, in words to show.
 */
export function checkFolder(value: unknown): { folder: string } | { error: string } {
  if (typeof value !== "string") return { error: "A folder is given as its path." };
  // Pasted from Terminal or Finder: quotes around it, or a file:// address.
  let typed = value.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (/^file:\/\//i.test(typed)) {
    try {
      typed = decodeURIComponent(new URL(typed).pathname);
    } catch {
      return { error: "That is not a folder's path." };
    }
  }
  if (!typed) return { error: "Give the folder's path." };
  if (typed.length > MAX_PATH_CHARS || typed.includes("\0")) {
    return { error: "That is not a folder's path." };
  }
  const full = expand(typed);
  if (!path.isAbsolute(full)) {
    return { error: "Give the folder's whole path, starting with / or ~/." };
  }
  const folder = path.resolve(full);
  try {
    if (!fs.statSync(folder).isDirectory()) {
      return { error: `${folder} is a file, not a folder.` };
    }
  } catch {
    return { error: `There is no folder at ${folder} on this computer.` };
  }
  return { folder };
}

/** A path with the home folder written as ~, for where space is short. */
export function shortFolder(folder: string): string {
  const home = os.homedir();
  return folder === home
    ? "~"
    : folder.startsWith(`${home}${path.sep}`)
      ? `~${folder.slice(home.length)}`
      : folder;
}

/** What opens the system's own "choose a folder" window: a stand-in for trials, or macOS's. */
function dialog(): { command: string; args: string[] } | null {
  const stand = process.env.OGCHAT_FOLDER_DIALOG?.trim();
  if (stand) return { command: stand, args: [] };
  if (process.platform !== "darwin" || !fs.existsSync("/usr/bin/osascript")) return null;
  return {
    command: "/usr/bin/osascript",
    args: [
      "-e",
      "activate",
      "-e",
      'POSIX path of (choose folder with prompt "Choose a folder for this chat to work in")',
    ],
  };
}

/** Whether this computer can show a window to choose a folder in. Elsewhere the path is typed. */
export function canChooseFolder(): boolean {
  return dialog() !== null;
}

/**
 * Opens the system's window for choosing a folder, on this computer's screen,
 * and waits for it. Resolves to the folder, or to null if it was cancelled.
 */
export function chooseFolder(signal?: AbortSignal): Promise<string | null> {
  const how = dialog();
  if (!how) return Promise.reject(new Error("There is no folder window on this system."));
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ how.command, how.args, {
      stdio: ["ignore", "pipe", "ignore"],
      signal,
      // Left open and forgotten: it is closed for you after ten minutes.
      timeout: 600_000,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out = (out + chunk.toString("utf8")).slice(0, MAX_PATH_CHARS * 2);
    });
    child.on("error", (error) => {
      if (signal?.aborted) resolve(null);
      else reject(error);
    });
    child.on("close", (code) => {
      // Cancel is not a failure: there is simply no folder.
      if (code !== 0 || !out.trim()) return resolve(null);
      const checked = checkFolder(out.trim());
      resolve("folder" in checked ? checked.folder : null);
    });
  });
}
