import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, Role, Session, SessionMeta } from "@/lib/types";
import { titleFromMessage } from "@/lib/title";
import { readJson, writeJsonAtomic } from "./fsjson";
import { sessionsDir } from "./paths";

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
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
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
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    messages: f.messages,
  };
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
  writeJsonAtomic(fileFor(file.id), file);
}

function toSession(file: SessionFile): Session {
  return {
    id: file.id,
    title: file.title,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    messageCount: file.messages.length,
    messages: file.messages,
  };
}

export function toMeta(session: SessionMeta): SessionMeta {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
  };
}

function newestFirst(a: SessionMeta, b: SessionMeta): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);
}

/** All sessions, most recently active first. `query` filters on title and message text. */
export function listSessions(query?: string): SessionMeta[] {
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
    if (
      needle &&
      !file.title.toLowerCase().includes(needle) &&
      !file.messages.some((m) => m.content.toLowerCase().includes(needle))
    ) {
      continue;
    }
    out.push(toMeta(toSession(file)));
  }
  return out.sort(newestFirst);
}

export function createSession(title?: string | null): Session {
  const now = stamp();
  const file: SessionFile = {
    version: 1,
    id: randomUUID(),
    title: title ?? DEFAULT_TITLE,
    titleLocked: Boolean(title),
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

export function deleteSession(id: string): boolean {
  if (!isValidId(id)) return false;
  try {
    fs.unlinkSync(fileFor(id));
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
  };
  if (input.role === "user" && !file.titleLocked && !file.messages.some((m) => m.role === "user")) {
    file.title = titleFromMessage(input.content);
  }
  file.messages.push(message);
  file.updatedAt = now;
  save(file);
  return { session: toSession(file), message };
}

/** Removes the given message and everything after it. */
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
