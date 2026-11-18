import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  MAX_PROJECT_FILES,
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  MAX_PROJECT_NAME_CHARS,
} from "@/lib/limits";
import type { Attachment, Project } from "@/lib/types";
import { readFile, removeSessionFiles, saveFile, type IngestedFile } from "./files";
import { readJson, writeJsonAtomic } from "./fsjson";
import { filesDir, projectsDir } from "./paths";
import { isValidId, listSessions, moveSession } from "./store";

/**
 * Projects: one JSON file per project under <data>/projects. A project holds
 * a name, standing instructions and files; sessions point at it by id. Its
 * files are stored the same way attachments are, under the project's own id.
 */

interface ProjectFile {
  version: 1;
  id: string;
  name: string;
  instructions: string;
  files: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export class ProjectError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fileFor(id: string): string {
  return path.join(projectsDir(), `${id}.json`);
}

function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    isValidId(a.id) &&
    typeof a.name === "string" &&
    typeof a.mime === "string" &&
    typeof a.size === "number" &&
    (a.kind === "text" || a.kind === "image")
  );
}

function load(id: string): ProjectFile | null {
  if (!isValidId(id)) return null;
  let raw: unknown;
  try {
    raw = readJson(fileFor(id));
  } catch {
    return null; // missing or unreadable: there is no such project
  }
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (f.id !== id || typeof f.name !== "string") return null;
  if (typeof f.createdAt !== "string" || typeof f.updatedAt !== "string") return null;
  return {
    version: 1,
    id,
    name: f.name,
    instructions: typeof f.instructions === "string" ? f.instructions : "",
    files: Array.isArray(f.files) ? f.files.filter(isAttachment) : [],
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function save(file: ProjectFile): void {
  writeJsonAtomic(fileFor(file.id), file);
}

function toProject(file: ProjectFile, sessionCount: number): Project {
  const { id, name, instructions, files, createdAt, updatedAt } = file;
  return { id, name, instructions, files, createdAt, updatedAt, sessionCount };
}

function cleanName(input: unknown): string {
  const name = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new ProjectError(400, "bad_name", "A project needs a name.");
  return Array.from(name).slice(0, MAX_PROJECT_NAME_CHARS).join("");
}

function cleanInstructions(input: unknown): string {
  if (typeof input !== "string") {
    throw new ProjectError(400, "bad_instructions", "Instructions must be text.");
  }
  if (input.length > MAX_PROJECT_INSTRUCTIONS_CHARS) {
    throw new ProjectError(
      400,
      "instructions_too_long",
      `Instructions are too long (the limit is ${MAX_PROJECT_INSTRUCTIONS_CHARS.toLocaleString("en-US")} characters).`,
    );
  }
  return input.trim();
}

/** Every project, by name, with how many sessions each holds. */
export function listProjects(): Project[] {
  let names: string[];
  try {
    names = fs.readdirSync(projectsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const counts = new Map<string, number>();
  for (const session of listSessions()) {
    if (session.projectId) counts.set(session.projectId, (counts.get(session.projectId) ?? 0) + 1);
  }
  const out: Project[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = load(name.slice(0, -".json".length));
    if (file) out.push(toProject(file, counts.get(file.id) ?? 0));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt));
}

export function getProject(id: string): Project | null {
  const file = load(id);
  return file ? toProject(file, listSessions(undefined, id).length) : null;
}

export function projectExists(id: string): boolean {
  return load(id) !== null;
}

export function createProject(name: unknown): Project {
  const now = new Date().toISOString();
  const file: ProjectFile = {
    version: 1,
    id: randomUUID(),
    name: cleanName(name),
    instructions: "",
    files: [],
    createdAt: now,
    updatedAt: now,
  };
  save(file);
  return toProject(file, 0);
}

export function updateProject(
  id: string,
  patch: { name?: unknown; instructions?: unknown },
): Project | null {
  const file = load(id);
  if (!file) return null;
  if (patch.name !== undefined) file.name = cleanName(patch.name);
  if (patch.instructions !== undefined) file.instructions = cleanInstructions(patch.instructions);
  file.updatedAt = new Date().toISOString();
  save(file);
  return getProject(id);
}

/**
 * Deletes a project and its files. Its sessions are kept: they simply stop
 * belonging to a project.
 */
export function deleteProject(id: string): boolean {
  if (!load(id)) return false;
  for (const session of listSessions(undefined, id)) moveSession(session.id, null);
  fs.rmSync(fileFor(id), { force: true });
  removeSessionFiles(id);
  return true;
}

export function addProjectFiles(id: string, uploads: IngestedFile[]): Project | null {
  const file = load(id);
  if (!file) return null;
  if (file.files.length + uploads.length > MAX_PROJECT_FILES) {
    throw new ProjectError(
      400,
      "too_many_files",
      `A project holds at most ${MAX_PROJECT_FILES} files.`,
    );
  }
  for (const upload of uploads) {
    saveFile(id, upload.attachment.id, upload.data);
    file.files.push(upload.attachment);
  }
  file.updatedAt = new Date().toISOString();
  save(file);
  return getProject(id);
}

export function removeProjectFile(id: string, fileId: string): Project | null {
  const file = load(id);
  if (!file) return null;
  const kept = file.files.filter((entry) => entry.id !== fileId);
  if (kept.length === file.files.length) return null;
  file.files = kept;
  file.updatedAt = new Date().toISOString();
  save(file);
  // Project files sit beside session attachments, in a folder named for the project.
  if (isValidId(fileId)) fs.rmSync(path.join(filesDir(id), fileId), { force: true });
  return getProject(id);
}

/** A stored project file's bytes: image data, or text as UTF-8. */
export function readProjectFile(id: string, fileId: string): Buffer | null {
  return readFile(id, fileId);
}
