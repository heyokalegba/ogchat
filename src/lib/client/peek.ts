import { MAX_TEXT_CHARS } from "@/lib/limits";

/**
 * Looking inside a file that is attached but not sent yet, so a paste can be
 * read and changed before it goes. The server decides what a file is from its
 * content when it arrives; this is the same reading, done early, in the browser.
 */

/** Text longer than this is shown but not edited: a box that large is too slow to type in. */
export const MAX_EDIT_CHARS = 2_000_000;

export type Peek =
  /** `over` is true when the text is longer than what is sent, so the end will be cut off. */
  | { kind: "text"; text: string; editable: boolean; over: boolean }
  | { kind: "image" }
  | { kind: "pdf" }
  /** Not text, a picture or a PDF: the server will refuse it. */
  | { kind: "other" };

export async function peekFile(file: File): Promise<Peek> {
  if (file.type.startsWith("image/")) return { kind: "image" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (pdf.every((byte, i) => bytes[i] === byte)) return { kind: "pdf" };
  if (bytes.includes(0)) return { kind: "other" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { kind: "other" };
  }
  if (text.length > MAX_EDIT_CHARS) {
    return { kind: "text", text: text.slice(0, MAX_TEXT_CHARS), editable: false, over: true };
  }
  return { kind: "text", text, editable: true, over: isOver(text) };
}

/** Whether the server would cut this text off. It counts characters, not UTF-16 units. */
export function isOver(text: string): boolean {
  return text.length > MAX_TEXT_CHARS && Array.from(text).length > MAX_TEXT_CHARS;
}

/** The same attachment with new text in it: its name and type stay as they were. */
export function editedFile(file: File, text: string): File {
  return new File([text], file.name, { type: file.type || "text/plain" });
}
