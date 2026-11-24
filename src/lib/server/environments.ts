import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Environment } from "@/lib/types";
import { readJson, writeJsonAtomic } from "./fsjson";
import { dataDir } from "./paths";

/**
 * Environments: named set-ups for the folder Claude runs commands in.
 *
 * An environment says three things about a chat's workspace:
 *  - a setup script, run once when the workspace is first used (and again
 *    if the script is changed): install the dependencies, say;
 *  - variables its commands are given;
 *  - whether its commands may use the network.
 *
 * A chat picks one; a chat that picks none gets the default: no setup, no
 * variables, network allowed. They are kept in <data>/environments.json, in
 * a file only you can read, since a variable may well be a key.
 */

export class EnvironmentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const DEFAULT_ENVIRONMENT: Environment = {
  id: "default",
  name: "Default",
  network: "full",
  setup: "",
  vars: {},
};

const MAX_ENVIRONMENTS = 40;
const MAX_SETUP_CHARS = 20_000;
const MAX_VARS = 60;
const MAX_VALUE_CHARS = 4_000;
/** Names a command's surroundings depend on: not for an environment to change. */
const RESERVED = new Set(["HOME", "TMPDIR", "PATH", "CI", "TERM"]);

function file(): string {
  return path.join(dataDir(), "environments.json");
}

function isEnvironment(value: unknown): value is Environment {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    /^[0-9a-f-]{36}$/.test(e.id) &&
    typeof e.name === "string" &&
    (e.network === "full" || e.network === "none") &&
    typeof e.setup === "string" &&
    !!e.vars &&
    typeof e.vars === "object" &&
    Object.values(e.vars).every((v) => typeof v === "string")
  );
}

function load(): Environment[] {
  try {
    const raw = readJson(file()) as { environments?: unknown } | null;
    return Array.isArray(raw?.environments) ? raw.environments.filter(isEnvironment) : [];
  } catch {
    return [];
  }
}

function save(list: Environment[]): void {
  writeJsonAtomic(file(), { version: 1, environments: list }, 0o600);
}

/** Every environment, the default first, the rest by name. */
export function listEnvironments(): Environment[] {
  return [DEFAULT_ENVIRONMENT, ...load().sort((a, b) => a.name.localeCompare(b.name))];
}

/** The environment a chat names, or the default if it names none or one that has gone. */
export function environmentFor(id: string | null | undefined): Environment {
  return (id && load().find((e) => e.id === id)) || DEFAULT_ENVIRONMENT;
}

export function isEnvironmentId(id: unknown): id is string {
  return typeof id === "string" && load().some((e) => e.id === id);
}

function clean(input: Record<string, unknown>, base: Environment): Environment {
  const next = { ...base };
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > 60) {
      throw new EnvironmentError(
        400,
        "bad_name",
        "An environment needs a name, 60 characters at most.",
      );
    }
    next.name = name;
  }
  if (input.network !== undefined) {
    if (input.network !== "full" && input.network !== "none") {
      throw new EnvironmentError(400, "bad_network", 'Network is "full" or "none".');
    }
    next.network = input.network;
  }
  if (input.setup !== undefined) {
    if (typeof input.setup !== "string" || input.setup.length > MAX_SETUP_CHARS) {
      throw new EnvironmentError(400, "bad_setup", "The setup script is too long.");
    }
    next.setup = input.setup.replace(/\r\n/g, "\n").trim();
  }
  if (input.vars !== undefined) {
    if (!input.vars || typeof input.vars !== "object" || Array.isArray(input.vars)) {
      throw new EnvironmentError(400, "bad_vars", "Variables are a set of names and values.");
    }
    const entries = Object.entries(input.vars as Record<string, unknown>);
    if (entries.length > MAX_VARS) {
      throw new EnvironmentError(400, "bad_vars", `At most ${MAX_VARS} variables.`);
    }
    const vars: Record<string, string> = {};
    for (const [name, value] of entries) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(name)) {
        throw new EnvironmentError(
          400,
          "bad_vars",
          `"${name.slice(0, 40)}" is not a variable name.`,
        );
      }
      if (RESERVED.has(name)) {
        throw new EnvironmentError(
          400,
          "bad_vars",
          `${name} is set by ogchat and cannot be changed.`,
        );
      }
      if (typeof value !== "string" || value.length > MAX_VALUE_CHARS || /[\0\n\r]/.test(value)) {
        throw new EnvironmentError(
          400,
          "bad_vars",
          `The value of ${name} must be one line of text.`,
        );
      }
      vars[name] = value;
    }
    next.vars = vars;
  }
  return next;
}

export function createEnvironment(input: Record<string, unknown>): Environment {
  const list = load();
  if (list.length >= MAX_ENVIRONMENTS) {
    throw new EnvironmentError(400, "too_many", "That is as many environments as ogchat keeps.");
  }
  const made = clean(
    { name: "New environment", ...input },
    { ...DEFAULT_ENVIRONMENT, id: randomUUID() },
  );
  save([...list, made]);
  return made;
}

export function updateEnvironment(id: string, input: Record<string, unknown>): Environment {
  const list = load();
  const at = list.findIndex((e) => e.id === id);
  if (at < 0) throw new EnvironmentError(404, "not_found", "That environment does not exist.");
  const next = clean(input, list[at]!);
  list[at] = next;
  save(list);
  return next;
}

/** Deletes an environment. Chats that used it fall back to the default. */
export function deleteEnvironment(id: string): boolean {
  const list = load();
  const rest = list.filter((e) => e.id !== id);
  if (rest.length === list.length) return false;
  save(rest);
  return true;
}
