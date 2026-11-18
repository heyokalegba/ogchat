/** Attachment limits, shared by the browser (early feedback) and the server (enforcement). */

export const MAX_FILES_PER_MESSAGE = 8;
/** Largest single upload the server will look at. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Text beyond this many characters per file is cut off (and marked as truncated). */
export const MAX_TEXT_CHARS = 200_000;
export const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Projects: how many files one can hold, and how long its name and instructions can be. */
export const MAX_PROJECT_FILES = 20;
export const MAX_PROJECT_NAME_CHARS = 80;
export const MAX_PROJECT_INSTRUCTIONS_CHARS = 20_000;

/**
 * A paste longer than this goes onto the message as a text attachment
 * instead of into the box, the way a pasted file would.
 */
export const PASTE_AS_FILE_CHARS = 2_000;
