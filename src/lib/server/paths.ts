import path from "node:path";

/**
 * Root of everything ogchat persists: sessions, settings and the API key.
 * Defaults to ./data in the project (gitignored); override with OGCHAT_DATA_DIR.
 */
export function dataDir(): string {
  const override = process.env.OGCHAT_DATA_DIR?.trim();
  return override
    ? path.resolve(/* turbopackIgnore: true */ override)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}

export function sessionsDir(): string {
  return path.join(dataDir(), "sessions");
}

/** One JSON file per project: <data>/projects/<id>.json. Their files live with the attachments. */
export function projectsDir(): string {
  return path.join(dataDir(), "projects");
}

export function settingsFile(): string {
  return path.join(dataDir(), "settings.json");
}

/** Uploaded attachments: <data>/files/<sessionId>/<attachmentId>. */
export function filesDir(sessionId: string): string {
  return path.join(dataDir(), "files", sessionId);
}
