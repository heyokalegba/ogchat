import { readFile } from "@/lib/server/files";
import { guard } from "@/lib/server/guard";
import { errorJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/store";

type Context = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/sessions/:id/files/:fileId
 * Serves an attachment back to the transcript: images as images, everything
 * else as plain text. Nothing here is ever served as HTML or script.
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id, fileId } = await params;

  const session = getSession(id);
  const attachment = session?.messages
    .flatMap((message) => message.attachments ?? [])
    .find((candidate) => candidate.id === fileId);
  const data = attachment ? readFile(id, fileId) : null;
  if (!attachment || !data) return errorJson(404, "not_found", "File not found.");

  const type = attachment.kind === "image" ? attachment.mime : "text/plain; charset=utf-8";
  const shownName = attachment.kind === "image" ? attachment.name : `${attachment.name}.txt`;
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(shownName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
