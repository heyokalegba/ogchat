import type { KeySource, PublicSettings } from "@/lib/types";
import { maskKey } from "@/lib/provider/redact";
import { readJson, writeJsonAtomic } from "./fsjson";
import { settingsFile } from "./paths";

/**
 * Provider settings. Resolution order, per field:
 *   1. the local settings file (<data>/settings.json, written by the settings panel)
 *   2. environment (.env.local): OGCHAT_API_BASE_URL, OGCHAT_API_KEY, OGCHAT_MODEL
 *   3. the defaults below
 *
 * The API key only ever leaves this module inside ResolvedSettings, which is
 * handed to the provider adapter. Everything bound for the browser goes
 * through publicSettings(), which carries the masked form only.
 */

export const DEFAULT_BASE_URL = "https://api.abliteration.ai/v1";
export const DEFAULT_MODEL = "abliterated-model-large";

export interface ResolvedSettings {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  keySource: KeySource | null;
}

interface StoredSettings {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface SettingsPatch {
  baseUrl?: unknown;
  model?: unknown;
  /** A string replaces the saved key; null or "" removes it; undefined leaves it alone. */
  apiKey?: unknown;
}

export class SettingsValidationError extends Error {}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStored(): StoredSettings {
  let raw: unknown;
  try {
    raw = readJson(settingsFile());
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  return { baseUrl: str(s.baseUrl), model: str(s.model), apiKey: str(s.apiKey) };
}

function writeStored(stored: StoredSettings): void {
  // Owner-only: this file can hold the API key.
  writeJsonAtomic(settingsFile(), stored, 0o600);
}

export function normalizeBaseUrl(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new SettingsValidationError("API base URL is required.");
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SettingsValidationError("API base URL must be a full URL, like https://host/v1.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SettingsValidationError("API base URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new SettingsValidationError("API base URL must not contain credentials.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

export function resolveSettings(): ResolvedSettings {
  const stored = readStored();
  const envKey = env("OGCHAT_API_KEY");
  return {
    baseUrl: stored.baseUrl ?? env("OGCHAT_API_BASE_URL") ?? DEFAULT_BASE_URL,
    model: stored.model ?? env("OGCHAT_MODEL") ?? DEFAULT_MODEL,
    apiKey: stored.apiKey ?? envKey,
    keySource: stored.apiKey ? "settings" : envKey ? "env" : null,
  };
}

export function publicSettings(): PublicSettings {
  const s = resolveSettings();
  return {
    baseUrl: s.baseUrl,
    model: s.model,
    apiKey: {
      set: Boolean(s.apiKey),
      masked: s.apiKey ? maskKey(s.apiKey) : null,
      source: s.keySource,
    },
    defaults: { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
  };
}

export function updateSettings(patch: SettingsPatch): PublicSettings {
  const stored = readStored();

  if (patch.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(patch.baseUrl);
    // A value equal to what env/defaults already give is not an override.
    const fallback = env("OGCHAT_API_BASE_URL") ?? DEFAULT_BASE_URL;
    if (baseUrl === fallback.replace(/\/+$/, "")) delete stored.baseUrl;
    else stored.baseUrl = baseUrl;
  }

  if (patch.model !== undefined) {
    const model = str(patch.model);
    if (!model) throw new SettingsValidationError("Model id is required.");
    if (model.length > 200) throw new SettingsValidationError("Model id is too long.");
    const fallback = env("OGCHAT_MODEL") ?? DEFAULT_MODEL;
    if (model === fallback) delete stored.model;
    else stored.model = model;
  }

  if (patch.apiKey !== undefined) {
    if (patch.apiKey === null || patch.apiKey === "") {
      delete stored.apiKey;
    } else if (typeof patch.apiKey === "string") {
      const key = patch.apiKey.trim();
      if (!key) {
        delete stored.apiKey;
      } else if (/\s/.test(key) || /[^\x21-\x7e]/.test(key)) {
        throw new SettingsValidationError(
          "That does not look like an API key. Paste the key only.",
        );
      } else if (key.length > 1000) {
        throw new SettingsValidationError("API key is too long.");
      } else {
        stored.apiKey = key;
      }
    } else {
      throw new SettingsValidationError("API key must be text.");
    }
  }

  writeStored(stored);
  return publicSettings();
}
