import type { ProviderContentPart, ProviderMessage } from "@/lib/provider/adapter";
import type { Attachment, ChatMessage, Project, Session } from "@/lib/types";
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
  const history = session.messages.map((message) => toProviderMessage(session.id, message));
  const context = project ? projectContext(project) : null;
  const system = [systemPrompt.trim(), context?.text ?? ""].filter(Boolean).join("\n\n");
  const lead: ProviderMessage[] = system ? [{ role: "system", content: system }] : [];
  if (context?.images.length) {
    lead.push({
      role: "user",
      content: [{ type: "text", text: "Reference images for this project:" }, ...context.images],
    });
  }
  return [...lead, ...history];
}
