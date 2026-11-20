import type { ProviderContentPart, ProviderMessage } from "@/lib/provider/adapter";
import type { Attachment, ChatMessage, ContextUse, Project, Session } from "@/lib/types";
import { fileSize, readFile } from "./files";

/**
 * Turns a stored session into the messages sent to the provider: the
 * history, with each attachment folded into the message it was sent with.
 * Once a conversation has been compressed, its summary goes in place of the
 * messages it covers.
 */

function fence(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

function fileBlock(attachment: Attachment, text: string | null): string {
  if (text === null) return `Attached file: ${attachment.name} (no longer available)`;
  const mark = fence(text);
  const note = attachment.truncated ? " (truncated)" : "";
  return `Attached file: ${attachment.name}${note}\n${mark}\n${text}\n${mark}`;
}

function toProviderMessage(sessionId: string, message: ChatMessage): ProviderMessage {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return { role: message.role, content: message.content };

  const blocks: string[] = [];
  const images: ProviderContentPart[] = [];
  for (const attachment of attachments) {
    const data = readFile(sessionId, attachment.id);
    if (attachment.kind === "image") {
      if (data) {
        images.push({
          type: "image_url",
          image_url: { url: `data:${attachment.mime};base64,${data.toString("base64")}` },
        });
      } else {
        blocks.push(`Attached image: ${attachment.name} (no longer available)`);
      }
    } else {
      blocks.push(fileBlock(attachment, data ? data.toString("utf8") : null));
    }
  }

  const text = [message.content, ...blocks].filter((part) => part.trim()).join("\n\n");
  if (images.length === 0) return { role: message.role, content: text };
  // Plain strings stay plain for maximum compatibility; the parts form is
  // used only when there is an image to carry.
  return {
    role: message.role,
    content: text ? [{ type: "text", text }, ...images] : images,
  };
}

/**
 * What a project adds ahead of a conversation: its name and instructions and
 * the text of its files as part of the system message, and its images, if it
 * has any, as a message of their own for models that can see.
 */
function projectContext(project: Project): { text: string; images: ProviderContentPart[] } {
  const parts = [`This conversation is part of the project "${project.name}".`];
  if (project.instructions.trim()) parts.push(project.instructions.trim());
  const images: ProviderContentPart[] = [];
  for (const file of project.files) {
    const data = readFile(project.id, file.id);
    if (file.kind === "image") {
      if (data) {
        images.push({
          type: "image_url",
          image_url: { url: `data:${file.mime};base64,${data.toString("base64")}` },
        });
      }
      continue;
    }
    const text = data ? data.toString("utf8") : null;
    if (text === null) continue;
    const mark = fence(text);
    parts.push(
      `Project file: ${file.name}${file.truncated ? " (truncated)" : ""}\n${mark}\n${text}\n${mark}`,
    );
  }
  return { text: parts.join("\n\n"), images };
}

/** The messages that are still sent as themselves: all of them, or those after the summary. */
export function liveMessages(session: Session): ChatMessage[] {
  const covered = session.summary
    ? session.messages.findIndex((m) => m.id === session.summary?.upTo)
    : -1;
  return covered === -1 ? session.messages : session.messages.slice(covered + 1);
}

/** How the summary of a compressed conversation is put to the model. */
function summaryNote(session: Session): string {
  const covered = session.summary
    ? session.messages.some((m) => m.id === session.summary?.upTo)
    : false;
  if (!session.summary || !covered) return "";
  return (
    "The earlier part of this conversation was compressed to save room. " +
    "This summary stands in for it; carry on from it as if you remembered the whole exchange.\n\n" +
    `<summary>\n${session.summary.text}\n</summary>`
  );
}

/** Characters of ordinary text per token, near enough for a meter. Erring on the full side. */
const CHARS_PER_TOKEN = 3.6;
/** What a picture costs, give or take: providers charge by size, around this much. */
const TOKENS_PER_IMAGE = 1_100;
/** The wrapping every message carries: its role and its separators. */
const TOKENS_PER_MESSAGE = 4;

/**
 * How full the context window is with this session as it would be sent now.
 * An estimate from the length of the text: nothing is read from disk but the
 * sizes of attached files, so it is cheap enough to ask after every turn.
 */
export function measureContext(
  session: Session,
  systemPrompt: string,
  project: Project | null,
  limit: number,
): ContextUse {
  let chars = systemPrompt.trim().length + summaryNote(session).length;
  let images = 0;
  let messages = 1;
  const attached = (owner: string, attachment: Attachment) => {
    if (attachment.kind === "image") images += 1;
    else chars += fileSize(owner, attachment.id) + attachment.name.length + 24;
  };
  if (project) {
    chars += project.name.length + project.instructions.length + 48;
    for (const file of project.files) attached(project.id, file);
  }
  for (const message of liveMessages(session)) {
    messages += 1;
    chars += message.content.length;
    for (const attachment of message.attachments ?? []) attached(session.id, attachment);
  }
  const tokens =
    Math.ceil(chars / CHARS_PER_TOKEN) + images * TOKENS_PER_IMAGE + messages * TOKENS_PER_MESSAGE;
  return { tokens, limit };
}

/** Roughly how many tokens one message for the provider takes. */
export function tokensOf(message: ProviderMessage): number {
  if (typeof message.content === "string") {
    return Math.ceil(message.content.length / CHARS_PER_TOKEN) + TOKENS_PER_MESSAGE;
  }
  let tokens = TOKENS_PER_MESSAGE;
  for (const part of message.content) {
    tokens +=
      part.type === "text" ? Math.ceil(part.text.length / CHARS_PER_TOKEN) : TOKENS_PER_IMAGE;
  }
  return tokens;
}

/**
 * The messages for one turn. The system message comes first when there is
 * anything to put in it: the system prompt from settings, then the project
 * the session belongs to.
 */
export function buildProviderMessages(
  session: Session,
  systemPrompt = "",
  project: Project | null = null,
): ProviderMessage[] {
  const history = liveMessages(session).map((message) => toProviderMessage(session.id, message));
  const context = project ? projectContext(project) : null;
  const system = [systemPrompt.trim(), context?.text ?? "", summaryNote(session)]
    .filter(Boolean)
    .join("\n\n");
  const lead: ProviderMessage[] = system ? [{ role: "system", content: system }] : [];
  if (context?.images.length) {
    lead.push({
      role: "user",
      content: [{ type: "text", text: "Reference images for this project:" }, ...context.images],
    });
  }
  return [...lead, ...history];
}
