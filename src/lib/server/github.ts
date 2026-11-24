import type { ClaudeTool } from "@/lib/provider/claude";
import type { RepoChoice } from "@/lib/types";

/**
 * A GitHub repository, as Claude gets to use it.
 *
 * With a project tied to a repository and a GitHub token in settings, Claude
 * is given six tools: list a folder, read a file, search the code, write a
 * file, delete a file, open a pull request. They are plain calls to GitHub's
 * REST API made from this machine with your token.
 *
 * The rules are in the code, not left to the model:
 *  - Nothing is ever written to the repository's default branch. Every change
 *    goes to a branch of ogchat's own, named after the chat, made from the
 *    default branch the first time something is written.
 *  - A pull request is the only way those changes reach anywhere else, and
 *    merging it is yours to do on GitHub.
 *  - Paths are checked before they are used: nothing outside the repository,
 *    nothing under .git.
 *  - Only the one repository the project names can be touched.
 */

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;
/** As much of a file as Claude is handed at once. Longer files are cut, and it is told so. */
const MAX_READ_CHARS = 300_000;
const MAX_WRITE_CHARS = 1_000_000;

function apiBase(): string {
  return (process.env.OGCHAT_GITHUB_URL?.trim() || "https://api.github.com").replace(/\/+$/, "");
}

/** "owner/name" out of whatever was typed: that, or a github.com address. Null if neither. */
export function parseRepo(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(text) ? text : null;
}

/**
 * A path inside the repository, made safe to put in a URL. Throws on
 * anything that is not one: the model wrote it, so it is not trusted.
 */
export function repoPath(input: unknown, allowRoot = false): string {
  if (typeof input !== "string") throw new GitHubError("A path must be text.");
  const path = input.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (!path) {
    if (allowRoot) return "";
    throw new GitHubError("A path is needed.");
  }
  const parts = path.split("/");
  const bad =
    path.length > 400 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path) ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    parts[0] === ".git";
  if (bad) throw new GitHubError(`"${input}" is not a path inside the repository.`);
  return parts.map(encodeURIComponent).join("/");
}

interface Client {
  call(method: string, path: string, body?: unknown, accept?: string): Promise<Response>;
  json<T>(method: string, path: string, body?: unknown): Promise<T>;
}

function client(token: string, signal?: AbortSignal): Client {
  const call = async (method: string, path: string, body?: unknown, accept?: string) => {
    let response: Response;
    try {
      response = await fetch(`${apiBase()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept ?? "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ogchat",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new GitHubError("GitHub could not be reached.");
    }
    return response;
  };
  const explain = async (response: Response): Promise<GitHubError> => {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") detail = body.message.slice(0, 200);
    } catch {
      // no detail to give
    }
    const status = response.status;
    if (status === 401) return new GitHubError("GitHub did not accept the token in settings.", 401);
    if (status === 403 || status === 404) {
      return new GitHubError(
        `GitHub says ${status === 404 ? "not found" : "not allowed"}${detail ? ` (${detail})` : ""}. The token may not cover this repository, or not with write access.`,
        status,
      );
    }
    return new GitHubError(`GitHub answered ${status}${detail ? `: ${detail}` : ""}.`, status);
  };
  return {
    call,
    async json<T>(method: string, path: string, body?: unknown): Promise<T> {
      const response = await call(method, path, body);
      if (!response.ok) throw await explain(response);
      return (await response.json()) as T;
    },
  };
}

/** Whether a token works, and whether it can see a repository: for the settings panel. */
export async function checkGitHub(
  token: string | null,
  repo?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (!token) return { ok: false, detail: "No GitHub token is set." };
  try {
    const gh = client(token);
    const user = await gh.json<{ login: string }>("GET", "/user");
    if (!repo) return { ok: true, detail: `Signed in to GitHub as ${user.login}.` };
    const found = await gh.json<{ full_name: string; permissions?: { push?: boolean } }>(
      "GET",
      `/repos/${repo}`,
    );
    return {
      ok: true,
      detail: `${found.full_name}: ${found.permissions?.push ? "can read and write" : "can read only"}, as ${user.login}.`,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "GitHub check failed." };
  }
}

/** A branch name that is safe to hand to GitHub and to git. Null if it is not one. */
export function parseBranch(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  const ok =
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(name) &&
    !name.includes("..") &&
    !name.includes("//") &&
    !name.endsWith("/") &&
    !name.endsWith(".lock");
  return ok ? name : null;
}

/** The repositories the token can reach, most recently pushed first. */
export async function listRepos(token: string): Promise<RepoChoice[]> {
  const gh = client(token);
  const found: RepoChoice[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh.json<
      { full_name: string; private: boolean; default_branch: string; archived?: boolean }[]
    >("GET", `/user/repos?per_page=100&sort=pushed&page=${page}`);
    for (const repo of batch) {
      if (!repo.archived && parseRepo(repo.full_name)) {
        found.push({
          name: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
        });
      }
    }
    if (batch.length < 100) break;
  }
  return found;
}

/** A repository's branches (the first hundred), and which one is its default. */
export async function listBranches(
  token: string,
  repo: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  const gh = client(token);
  const [about, branches] = await Promise.all([
    gh.json<{ default_branch: string }>("GET", `/repos/${repo}`),
    gh.json<{ name: string }[]>("GET", `/repos/${repo}/branches?per_page=100`),
  ]);
  const names = branches.map((b) => b.name).filter((name) => !name.startsWith("ogchat/"));
  return {
    defaultBranch: about.default_branch,
    branches: [about.default_branch, ...names.filter((n) => n !== about.default_branch)],
  };
}

/** The branch a chat's changes go to. */
export function workBranch(sessionId: string): string {
  return `ogchat/${sessionId.slice(0, 8)}`;
}

const text = (value: unknown): value is string => typeof value === "string";
const need = (input: unknown, ...fields: string[]): string | null => {
  if (!input || typeof input !== "object") return "The input must be an object.";
  const given = input as Record<string, unknown>;
  for (const field of fields) {
    if (!text(given[field])) return `"${field}" is missing or is not text.`;
  }
  return null;
};

/**
 * The tools for one repository in one chat. `token` stays here: it is sent
 * to GitHub and to nobody else, and is never part of what a tool returns.
 */
export function githubTools(options: {
  token: string;
  repo: string;
  sessionId: string;
  /** The branch the chat's work starts from; the repository's default if not given. */
  baseBranch?: string | null;
}): ClaudeTool[] {
  const { token, repo } = options;
  const branch = workBranch(options.sessionId);
  // Found out once a chat, when first needed.
  let base: string | null = options.baseBranch ?? null;
  let branched: boolean | null = null;

  const defaultBranch = async (gh: Client) => {
    base ??= (await gh.json<{ default_branch: string }>("GET", `/repos/${repo}`)).default_branch;
    return base;
  };
  const hasBranch = async (gh: Client) => {
    if (branched === null) {
      const response = await gh.call("GET", `/repos/${repo}/git/ref/heads/${branch}`);
      branched = response.ok;
    }
    return branched;
  };
  /** Where to read from: this chat's branch once it exists, so Claude sees its own changes. */
  const readRef = async (gh: Client) => ((await hasBranch(gh)) ? branch : await defaultBranch(gh));
  const ensureBranch = async (gh: Client) => {
    if (await hasBranch(gh)) return;
    const from = await defaultBranch(gh);
    const head = await gh.json<{ object: { sha: string } }>(
      "GET",
      `/repos/${repo}/git/ref/heads/${encodeURIComponent(from)}`,
    );
    await gh.json("POST", `/repos/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: head.object.sha,
    });
    branched = true;
  };
  /** The blob id of a file on this chat's branch, or null if it is not there. */
  const shaOf = async (gh: Client, path: string) => {
    const response = await gh.call(
      "GET",
      `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new GitHubError(`GitHub answered ${response.status}.`, response.status);
    const found = (await response.json()) as { sha?: string; type?: string };
    if (Array.isArray(found) || found.type !== "file") {
      throw new GitHubError("That path is a folder, not a file.");
    }
    return found.sha ?? null;
  };

  const tool = (
    name: string,
    description: string,
    properties: Record<string, { type: string; description: string }>,
    required: string[],
    describe: (input: Record<string, unknown>) => string,
    run: (gh: Client, input: Record<string, unknown>) => Promise<string>,
  ): ClaudeTool => ({
    definition: {
      name,
      description,
      input_schema: { type: "object", properties, required, additionalProperties: false },
    },
    check: (input) => need(input, ...required),
    describe,
    run: (input, signal) => run(client(token, signal), input),
  });

  return [
    tool(
      "list_files",
      `List the files and folders in a folder of the GitHub repository ${repo}. Give "" for the top level.`,
      {
        path: {
          type: "string",
          description: 'Folder path inside the repository, "" for the root.',
        },
      },
      ["path"],
      (input) => `listing ${input.path || "the top of the repository"}`,
      async (gh, input) => {
        const path = repoPath(input.path, true);
        const ref = await readRef(gh);
        const entries = await gh.json<{ name: string; type: string; size: number }[] | object>(
          "GET",
          `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
        );
        if (!Array.isArray(entries)) return "That path is a file, not a folder. Use read_file.";
        if (entries.length === 0) return "(empty folder)";
        return entries
          .sort((a, b) =>
            a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
          )
          .map((e) => (e.type === "dir" ? `${e.name}/` : `${e.name}  (${e.size} bytes)`))
          .join("\n");
      },
    ),
    tool(
      "read_file",
      `Read a text file from the GitHub repository ${repo}. Returns the whole file, or says so if it had to be cut.`,
      { path: { type: "string", description: "File path inside the repository." } },
      ["path"],
      (input) => `reading ${String(input.path)}`,
      async (gh, input) => {
        const path = repoPath(input.path);
        const ref = await readRef(gh);
        const response = await gh.call(
          "GET",
          `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
          undefined,
          "application/vnd.github.raw+json",
        );
        if (response.status === 404) return "There is no file at that path.";
        if (!response.ok)
          throw new GitHubError(`GitHub answered ${response.status}.`, response.status);
        const body = await response.text();
        if (body.includes("\u0000")) return "That is a binary file; it cannot be read as text.";
        if (body.length <= MAX_READ_CHARS) return body;
        return `${body.slice(0, MAX_READ_CHARS)}\n\n[The file is ${body.length} characters long; only the first ${MAX_READ_CHARS} are shown.]`;
      },
    ),
    tool(
      "search_code",
      `Search the code of the GitHub repository ${repo} for words or symbols. Searches the default branch only. Returns matching file paths.`,
      { query: { type: "string", description: "Words or a symbol to look for." } },
      ["query"],
      (input) => `searching for ${String(input.query).slice(0, 60)}`,
      async (gh, input) => {
        const query = String(input.query)
          .replace(/\b(repo|org|user):\S+/gi, "")
          .trim()
          .slice(0, 200);
        if (!query) return "Give something to search for.";
        const found = await gh.json<{ total_count: number; items: { path: string }[] }>(
          "GET",
          `/search/code?q=${encodeURIComponent(`${query} repo:${repo}`)}&per_page=30`,
        );
        if (found.items.length === 0) return "No matches.";
        const paths = [...new Set(found.items.map((item) => item.path))];
        return `${found.total_count} match${found.total_count === 1 ? "" : "es"}, in:\n${paths.join("\n")}`;
      },
    ),
    tool(
      "write_file",
      `Create or replace a file in the GitHub repository ${repo}. The change is committed to the branch ${branch}, never to the default branch. Give the complete new contents of the file.`,
      {
        path: { type: "string", description: "File path inside the repository." },
        content: { type: "string", description: "The whole file as it should be." },
        message: { type: "string", description: "A one-line commit message." },
      },
      ["path", "content", "message"],
      (input) => `writing ${String(input.path)}`,
      async (gh, input) => {
        const path = repoPath(input.path);
        const content = String(input.content);
        if (content.length > MAX_WRITE_CHARS)
          throw new GitHubError("That file is too large to write.");
        await ensureBranch(gh);
        const sha = await shaOf(gh, path);
        await gh.json("PUT", `/repos/${repo}/contents/${path}`, {
          message: String(input.message).split("\n")[0]!.slice(0, 200) || "Update file",
          content: Buffer.from(content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        });
        return `${sha ? "Updated" : "Created"} ${String(input.path)} on branch ${branch}.`;
      },
    ),
    tool(
      "edit_file",
      `Change part of a file in the GitHub repository ${repo} without sending the whole file: give the exact text to replace and what to put in its place. The text must appear in the file exactly once, so include enough of the surrounding lines to make it unique. Committed to the branch ${branch}. Prefer this to write_file for a change to an existing file.`,
      {
        path: { type: "string", description: "File path inside the repository." },
        old_text: {
          type: "string",
          description: "The exact text to replace, as it is in the file now.",
        },
        new_text: { type: "string", description: "What to put in its place." },
        message: { type: "string", description: "A one-line commit message." },
      },
      ["path", "old_text", "new_text", "message"],
      (input) => `editing ${String(input.path)}`,
      async (gh, input) => {
        const path = repoPath(input.path);
        const from = String(input.old_text);
        if (!from) return "Give the text to replace.";
        const ref = await readRef(gh);
        const response = await gh.call(
          "GET",
          `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
          undefined,
          "application/vnd.github.raw+json",
        );
        if (response.status === 404) return "There is no file at that path.";
        if (!response.ok)
          throw new GitHubError(`GitHub answered ${response.status}.`, response.status);
        const body = await response.text();
        const count = body.split(from).length - 1;
        if (count === 0)
          return "That text is not in the file. Read the file again and copy the text exactly, spaces and line breaks included.";
        if (count > 1)
          return `That text appears ${count} times in the file. Include more of the lines around it so that it is unique.`;
        const content = body.replace(from, () => String(input.new_text));
        if (content.length > MAX_WRITE_CHARS)
          throw new GitHubError("That file is too large to write.");
        await ensureBranch(gh);
        const sha = await shaOf(gh, path);
        await gh.json("PUT", `/repos/${repo}/contents/${path}`, {
          message: String(input.message).split("\n")[0]!.slice(0, 200) || "Edit file",
          content: Buffer.from(content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        });
        return `Edited ${String(input.path)} on branch ${branch}.`;
      },
    ),
    tool(
      "delete_file",
      `Delete a file from the GitHub repository ${repo}, on the branch ${branch} only.`,
      {
        path: { type: "string", description: "File path inside the repository." },
        message: { type: "string", description: "A one-line commit message." },
      },
      ["path", "message"],
      (input) => `deleting ${String(input.path)}`,
      async (gh, input) => {
        const path = repoPath(input.path);
        await ensureBranch(gh);
        const sha = await shaOf(gh, path);
        if (!sha) return "There is no file at that path to delete.";
        await gh.json("DELETE", `/repos/${repo}/contents/${path}`, {
          message: String(input.message).split("\n")[0]!.slice(0, 200) || "Delete file",
          sha,
          branch,
        });
        return `Deleted ${String(input.path)} on branch ${branch}.`;
      },
    ),
    tool(
      "open_pull_request",
      `Open a pull request on ${repo} from the branch ${branch} into the default branch, so the changes written in this chat can be reviewed and merged. Only use this when the user has asked for a pull request or agreed to one.`,
      {
        title: { type: "string", description: "The pull request's title." },
        body: { type: "string", description: "What changed and why, in Markdown." },
      },
      ["title", "body"],
      () => "opening a pull request",
      async (gh, input) => {
        if (!(await hasBranch(gh)))
          return "Nothing has been written in this chat yet, so there is nothing to open a pull request for.";
        const into = await defaultBranch(gh);
        const response = await gh.call("POST", `/repos/${repo}/pulls`, {
          title: String(input.title).slice(0, 250),
          body: String(input.body).slice(0, 60_000),
          head: branch,
          base: into,
        });
        if (response.ok) {
          const made = (await response.json()) as { html_url: string; number: number };
          return `Opened pull request #${made.number}: ${made.html_url}`;
        }
        if (response.status === 422) {
          // Usually: there is one already. Point at it instead of failing.
          const owner = repo.split("/")[0];
          const open = await gh.json<{ html_url: string; number: number }[]>(
            "GET",
            `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`,
          );
          if (open[0])
            return `There is already an open pull request for this branch, #${open[0].number}: ${open[0].html_url}. New commits on the branch are part of it.`;
          return "GitHub would not open the pull request: there may be no changes on the branch yet.";
        }
        throw new GitHubError(
          `GitHub answered ${response.status} when opening the pull request.`,
          response.status,
        );
      },
    ),
  ];
}

/** What Claude is told about the repository it has been given, ahead of the conversation. */
export function repoBriefing(repo: string, sessionId: string, baseBranch?: string | null): string {
  return [
    `You are connected to the GitHub repository ${repo} through the tools list_files, read_file, search_code, edit_file, write_file, delete_file and open_pull_request.`,
    baseBranch
      ? `This chat works from the branch ${baseBranch}: that is what you read until you have written something, and what a pull request goes into.`
      : "",
    "Look before you answer: read the files a question is about instead of guessing at them, and read a file before you change it.",
    `Anything you write or delete is committed straight away to the branch ${workBranch(sessionId)}. You cannot write to any other branch. To change an existing file use edit_file with the exact text to replace; use write_file for a new file or a complete rewrite, and give it the whole file.`,
    "Make only the changes that were asked for. Say plainly which files you changed.",
    "Open a pull request only when the user asks for one or agrees to it; merging it is theirs to do.",
    "Earlier turns of this conversation carry only what was said, not the files you read: read a file again if you need its contents.",
  ]
    .filter(Boolean)
    .join("\n");
}
