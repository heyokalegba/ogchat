import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Attachment,
  ChatMessage,
  Role,
  Session,
  SessionMeta,
  SessionModel,
  SessionSummary,
} from "@/lib/types";
import { PROVIDER_CHOICES, REASONING_EFFORTS, type ReasoningEffort } from "@/lib/types";
import { titleFromMessage } from "@/lib/title";
import { pruneFiles, removeSessionFiles } from "./files";
import { readJson, writeJsonAtomic } from "./fsjson";
import { sessionsDir } from "./paths";
import { removeWorkspace } from "./workspace";

/**
 * Session persistence: one JSON file per session under <data>/sessions.
 * Everything is synchronous on purpose. This is a single-user local app, and
 * synchronous read-modify-write keeps concurrent requests from interleaving.
 */

export const DEFAULT_TITLE = "new session";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES: readonly Role[] = ["system", "user", "assistant"];

interface SessionFile {
  version: 1;
  id: string;
  title: string;
  /** True once the user has renamed the session; auto-titling then stays out of the way. */
  titleLocked: boolean;
  /** The project this session is filed under, if any. */
  projectId?: string;
  /** The model this chat uses, if it has one of its own. */
  model?: SessionModel;
  /** How hard it thinks, if this chat has a level of its own. */
  reasoning?: ReasoningEffort;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Set once the early part of the conversation has been compressed. */
  summary?: SessionSummary;
}

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

let lastStamp = 0;
/** ISO timestamp that is strictly increasing within this process, so ordering is stable. */
function stamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

function fileFor(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.content === "string" &&
    typeof m.createdAt === "string" &&
    ROLES.includes(m.role as Role)
  );
}

function parseFile(value: unknown, id: string): SessionFile | null {
  if (!value || typeof value !== "object") return null;
  const f = value as Record<string, unknown>;
  if (f.id !== id || typeof f.title !== "string") return null;
  if (typeof f.createdAt !== "string" || typeof f.updatedAt !== "string") return null;
  if (!Array.isArray(f.messages) || !f.messages.every(isMessage)) return null;
  return {
    version: 1,
    id,
    title: f.title,
    titleLocked: f.titleLocked === true,
    ...(isValidId(f.projectId) ? { projectId: f.projectId } : {}),
    ...(isModel(f.model) ? { model: { provider: f.model.provider, model: f.model.model } } : {}),
    ...(isEffort(f.reasoning) ? { reasoning: f.reasoning } : {}),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    messages: f.messages,
    ...(isSummary(f.summary) ? { summary: f.summary } : {}),
  };
}

export function isEffort(value: unknown): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly unknown[]).includes(value);
}

function isModel(value: unknown): value is SessionModel {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    (PROVIDER_CHOICES as readonly unknown[]).includes(m.provider) &&
    typeof m.model === "string" &&
    m.model.length > 0 &&
    m.model.length <= 200
  );
}

function isSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.text === "string" && typeof s.upTo === "string" && typeof s.at === "string";
}

function load(id: string): SessionFile | null {
  if (!isValidId(id)) return null;
  try {
    return parseFile(readJson(fileFor(id)), id);
  } catch {
    // Unreadable or corrupt file: treat as missing rather than taking the app down.
    return null;
  }
}

function save(file: SessionFile): void {
  // A summary stands for the messages up to one of them. If that message has
  // gone (deleted, or cut off by an edit further back), the summary describes a
  // conversation that no longer happened, and goes with it.
  if (file.summary && !file.messages.some((m) => m.id === file.summary?.upTo)) {
    delete file.summary;
  }
  writeJsonAtomic(fileFor(file.id), file);
}

function toSession(file: SessionFile): Session {
  return {
    id: file.id,
    title: file.title,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    messageCount: file.messages.length,
    projectId: file.projectId ?? null,
    model: file.model ?? null,
    reasoning: file.reasoning ?? null,
    messages: file.messages,
    ...(file.summary ? { summary: file.summary } : {}),
  };
}

export function toMeta(session: SessionMeta): SessionMeta {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    projectId: session.projectId ?? null,
    model: session.model ?? null,
    reasoning: session.reasoning ?? null,
  };
}

function newestFirst(a: SessionMeta, b: SessionMeta): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);
}

/**
 * All sessions, most recently active first. `query` filters on title and
 * message text; `project` keeps one project's sessions, or with "none" the
 * ones that belong to no project.
 */
export function listSessions(query?: string, project?: string | null): SessionMeta[] {
  let names: string[];
  try {
    names = fs.readdirSync(sessionsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const needle = query?.trim().toLowerCase() ?? "";
  const out: SessionMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = load(name.slice(0, -".json".length));
    if (!file) continue;
    if (project === "none" ? file.projectId : project && file.projectId !== project) continue;
    if (
      needle &&
      !file.title.toLowerCase().includes(needle) &&
      !file.messages.some(
        (m) =>
          m.content.toLowerCase().includes(needle) ||
          m.attachments?.some((a) => a.name.toLowerCase().includes(needle)),
      )
    ) {
      continue;
    }
    out.push(toMeta(toSession(file)));
  }
  return out.sort(newestFirst);
}

export function createSession(
  title?: string | null,
  projectId?: string | null,
  model?: SessionModel | null,
  reasoning?: ReasoningEffort | null,
): Session {
  const now = stamp();
  const file: SessionFile = {
    version: 1,
    id: randomUUID(),
    title: title ?? DEFAULT_TITLE,
    titleLocked: Boolean(title),
    ...(projectId ? { projectId } : {}),
    ...(model ? { model } : {}),
    ...(reasoning ? { reasoning } : {}),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  save(file);
  return toSession(file);
}

export function getSession(id: string): Session | null {
  const file = load(id);
  return file ? toSession(file) : null;
}

/** Renames a session. Does not count as activity, so it keeps its place in the list. */
export function renameSession(id: string, title: string): Session | null {
  const file = load(id);
  if (!file) return null;
  file.title = title;
  file.titleLocked = true;
  save(file);
  return toSession(file);
}

/** Sets the model a session uses, or with null goes back to the one in settings. Not activity. */
export function setSessionModel(id: string, model: SessionModel | null): Session | null {
  const file = load(id);
  if (!file) return null;
  if (model) file.model = model;
  else delete file.model;
  save(file);
  return toSession(file);
}

/** Sets how hard a session's model thinks, or with null goes back to the level in settings. */
export function setSessionReasoning(id: string, reasoning: ReasoningEffort | null): Session | null {
  const file = load(id);
  if (!file) return null;
  if (reasoning) file.reasoning = reasoning;
  else delete file.reasoning;
  save(file);
  return toSession(file);
}

/** Files a session under a project, or with null takes it out of its project. */
export function moveSession(id: string, projectId: string | null): Session | null {
  const file = load(id);
  if (!file) return null;
  if (projectId) file.projectId = projectId;
  else delete file.projectId;
  save(file);
  return toSession(file);
}

export function deleteSession(id: string): boolean {
  if (!isValidId(id)) return false;
  try {
    fs.unlinkSync(fileFor(id));
    removeSessionFiles(id);
    removeWorkspace(id);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export interface NewMessage {
  role: Role;
  content: string;
  partial?: boolean;
  attachments?: Attachment[];
  web?: boolean;
  thinking?: string;
}

/**
 * Appends a message. The first user message also names the session, unless
 * the user already renamed it. Returns null when the session no longer exists.
 */
export function appendMessage(
  id: string,
  input: NewMessage,
): { session: Session; message: ChatMessage } | null {
  const file = load(id);
  if (!file) return null;
  const now = stamp();
  const message: ChatMessage = {
    id: randomUUID(),
    role: input.role,
    content: input.content,
    createdAt: now,
    ...(input.partial ? { partial: true } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.web ? { web: true } : {}),
    ...(input.thinking?.trim() ? { thinking: input.thinking } : {}),
  };
  if (input.role === "user" && !file.titleLocked && !file.messages.some((m) => m.role === "user")) {
    file.title = titleFromMessage(input.content || input.attachments?.[0]?.name || "");
  }
  file.messages.push(message);
  file.updatedAt = now;
  save(file);
  return { session: toSession(file), message };
}

/**
 * Records a summary that stands for the conversation up to `upTo`, or with
 * null removes the one there is, so the whole conversation is sent again.
 */
export function setSummary(
  id: string,
  summary: { text: string; upTo: string } | null,
): Session | null {
  const file = load(id);
  if (!file) return null;
  if (summary) file.summary = { text: summary.text, upTo: summary.upTo, at: stamp() };
  else delete file.summary;
  save(file);
  return toSession(file);
}

/**
 * Removes the given message and everything after it. Attachment files are left
 * in place; call pruneSessionFiles once the session is in its final state.
 */
export function truncateFrom(id: string, messageId: string): Session | null {
  const file = load(id);
  if (!file) return null;
  const index = file.messages.findIndex((m) => m.id === messageId);
  if (index === -1) return null;
  file.messages = file.messages.slice(0, index);
  file.updatedAt = stamp();
  save(file);
  return toSession(file);
}

/** Deletes attachment files that no remaining message refers to. */
export function pruneSessionFiles(id: string): void {
  const file = load(id);
  if (!file) return;
  const keep = new Set<string>();
  for (const message of file.messages) {
    for (const attachment of message.attachments ?? []) keep.add(attachment.id);
  }
  pruneFiles(id, keep);
}
