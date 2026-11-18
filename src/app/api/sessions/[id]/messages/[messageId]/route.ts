import { getGeneration } from "@/lib/server/generations";
import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { getSession, pruneSessionFiles, truncateFrom } from "@/lib/server/store";

type Context = { params: Promise<{ id: string; messageId: string }> };

/**
 * DELETE /api/sessions/:id/messages/:messageId  →  { session }
 * Removes a user message together with everything after it.
 */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id, messageId } = await params;

  const session = getSession(id);
  if (!session) return errorJson(404, "not_found", "Session not found.");
  if (getGeneration(id)) {
    return errorJson(409, "busy", "This session is generating a reply. Stop it first.");
  }
  const target = session.messages.find((m) => m.id === messageId);
  if (!target) return errorJson(404, "not_found", "Message not found.");
  if (target.role !== "user") {
    return errorJson(400, "bad_message", "Only your own messages can be deleted.");
  }
  const updated = truncateFrom(id, messageId);
  pruneSessionFiles(id);
  return updated ? json({ session: updated }) : errorJson(404, "not_found", "Message not found.");
}
