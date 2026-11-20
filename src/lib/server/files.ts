import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { formatBytes, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_TEXT_CHARS } from "@/lib/limits";
import type { Attachment } from "@/lib/types";
import { filesDir } from "./paths";

/**
 * Attachments. A file is inspected once, on upload, and stored in the form
 * the model will receive it:
 *
 *   images            the original bytes        (sent as an image part)
 *   text files        their UTF-8 text          (inlined into the prompt)
 *   PDFs              the text extracted from them
 *
 * What a file is gets decided from its content, not its name or declared
 * type. Anything else (archives, office documents, audio…) is refused with a
 * plain message rather than passed along as noise.
 */

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class FileRejected extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface IncomingFile {
  name: string;
  bytes: Uint8Array;
}

export interface IngestedFile {
  attachment: Attachment;
  /** What gets written to disk: image bytes, or text as UTF-8. */
  data: Uint8Array;
}

function cleanName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return Array.from(clean || "file")
    .slice(0, 200)
    .join("");
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function imageMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function pdfText(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    throw new FileRejected(422, "unreadable_file", `"${name}" could not be read as a PDF.`);
  }
}

function textAttachment(name: string, mime: string, size: number, text: string): IngestedFile {
  const chars = Array.from(text);
  const truncated = chars.length > MAX_TEXT_CHARS;
  const kept = truncated ? chars.slice(0, MAX_TEXT_CHARS).join("") : text;
  return {
    attachment: {
      id: randomUUID(),
      name,
      mime,
      size,
      kind: "text",
      ...(truncated ? { truncated: true } : {}),
    },
    data: new TextEncoder().encode(kept),
  };
}

/** Inspects an upload and turns it into something a model can take. Stores nothing. */
export async function ingestFile(file: IncomingFile): Promise<IngestedFile> {
  const name = cleanName(file.name);
  const { bytes } = file;
  const size = bytes.byteLength;

  if (size === 0) throw new FileRejected(400, "empty_file", `"${name}" is empty.`);
  if (size > MAX_FILE_BYTES) {
    throw new FileRejected(
      413,
      "file_too_large",
      `"${name}" is ${formatBytes(size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} per file.`,
    );
  }

  const image = imageMime(bytes);
  if (image) {
    if (size > MAX_IMAGE_BYTES) {
      throw new FileRejected(
        413,
        "file_too_large",
        `"${name}" is ${formatBytes(size)}. Images can be up to ${formatBytes(MAX_IMAGE_BYTES)}.`,
      );
    }
    return {
      attachment: { id: randomUUID(), name, mime: image, size, kind: "image" },
      data: bytes,
    };
  }

  if (isPdf(bytes)) {
    const text = (await pdfText(bytes, name)).trim();
    if (!text) {
      throw new FileRejected(
        422,
        "unreadable_file",
        `"${name}" has no text to extract. It may be a scan; try an image of the page instead.`,
      );
    }
    return textAttachment(name, "application/pdf", size, text);
  }

  const text = decodeText(bytes);
  if (text !== null) return textAttachment(name, "text/plain", size, text);

  throw new FileRejected(
    415,
    "unsupported_file",
    `"${name}" is not a file ogchat can read. Attach text files, PDFs or images (PNG, JPEG, GIF, WebP).`,
  );
}

function fileFor(sessionId: string, attachmentId: string): string | null {
  if (!ID_RE.test(sessionId) || !ID_RE.test(attachmentId)) return null;
  return path.join(filesDir(sessionId), attachmentId);
}

export function saveFile(sessionId: string, attachmentId: string, data: Uint8Array): void {
  const file = fileFor(sessionId, attachmentId);
  if (!file) throw new Error("invalid attachment id");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

export function readFile(sessionId: string, attachmentId: string): Buffer | null {
  const file = fileFor(sessionId, attachmentId);
  if (!file) return null;
  try {
    // A runtime data path, not a project file: keep the bundler from tracing it.
    return fs.readFileSync(/* turbopackIgnore: true */ file);
  } catch {
    return null;
  }
}

/** How many bytes a stored file holds, without reading it. 0 when it is not there. */
export function fileSize(sessionId: string, attachmentId: string): number {
  const file = fileFor(sessionId, attachmentId);
  if (!file) return 0;
  try {
    return fs.statSync(/* turbopackIgnore: true */ file).size;
  } catch {
    return 0;
  }
}

/** Deletes stored files of a session that no message refers to any more. */
export function pruneFiles(sessionId: string, keep: Set<string>): void {
  if (!ID_RE.test(sessionId)) return;
  const dir = filesDir(sessionId);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!keep.has(name)) fs.rmSync(path.join(dir, name), { force: true });
  }
  if (keep.size === 0) fs.rmSync(dir, { recursive: true, force: true });
}

export function removeSessionFiles(sessionId: string): void {
  if (!ID_RE.test(sessionId)) return;
  fs.rmSync(filesDir(sessionId), { recursive: true, force: true });
}
