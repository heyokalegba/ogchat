import type { ProviderContentPart, ProviderMessage } from "@/lib/provider/adapter";
import type { Attachment, ChatMessage, Session } from "@/lib/types";
import { readFile } from "./files";

/**
 * Turns a stored session into the messages sent to the provider: the full
 * history, with each attachment folded into the message it was sent with.
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

export function buildProviderMessages(session: Session): ProviderMessage[] {
  return session.messages.map((message) => toProviderMessage(session.id, message));
}
