const MAX_TITLE = 48;

/** Short session title derived from the first user message. */
export function titleFromMessage(text: string): string {
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^(```|~~~)/.test(line)) ?? "";
  const clean = firstLine
    .replace(/^#+\s*/, "")
    .replace(/^[>\-*+]\s+/, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "untitled";
  const chars = Array.from(clean);
  if (chars.length <= MAX_TITLE) return clean;
  const cut = chars.slice(0, MAX_TITLE).join("");
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > MAX_TITLE * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, "")}…`;
}

export const MAX_TITLE_LENGTH = 120;

/** Normalizes a user-entered title; returns null when nothing usable is left. */
export function cleanTitle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const title = input.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return Array.from(title).slice(0, MAX_TITLE_LENGTH).join("");
}
