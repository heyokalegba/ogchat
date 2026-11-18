import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { getProject, readProjectFile, removeProjectFile } from "@/lib/server/projects";

type Context = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/projects/:id/files/:fileId
 * A project file as the model receives it: images as images, everything else
 * as plain text. Never served as HTML or script.
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id, fileId } = await params;
  const attachment = getProject(id)?.files.find((file) => file.id === fileId);
  const data = attachment ? readProjectFile(id, fileId) : null;
  if (!attachment || !data) return errorJson(404, "not_found", "File not found.");

  const image = attachment.kind === "image";
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": image ? attachment.mime : "text/plain; charset=utf-8",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        image ? attachment.name : `${attachment.name}.txt`,
      )}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** DELETE /api/projects/:id/files/:fileId  →  { project } */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id, fileId } = await params;
  const project = removeProjectFile(id, fileId);
  return project ? json({ project }) : errorJson(404, "not_found", "File not found.");
}
