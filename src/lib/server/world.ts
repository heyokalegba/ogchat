import { readJson, writeJsonAtomic } from "./fsjson";
import { dataDir } from "./paths";
import path from "node:path";

/**
 * The street's own history. For now that is one date: the day it was first
 * opened, which is what its wear and tear is counted from. It is kept with
 * the rest of the data, so the browser and the desktop app agree on how old
 * the street is, and so it survives clearing a browser's storage.
 */

export interface World {
  /** When this installation first showed its street, as an ISO timestamp. */
  builtAt: string;
}

function file(): string {
  return path.join(dataDir(), "world.json");
}

/** Reads the street's history, starting it now if this is the first time it is asked for. */
export function getWorld(): World {
  try {
    const raw = readJson(file()) as { builtAt?: unknown } | null;
    if (raw && typeof raw.builtAt === "string" && !Number.isNaN(Date.parse(raw.builtAt))) {
      return { builtAt: raw.builtAt };
    }
  } catch {
    // no history yet, or an unreadable one: begin again from today
  }
  const world: World = { builtAt: new Date().toISOString() };
  writeJsonAtomic(file(), world);
  return world;
}
