import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { deleteProject, getProject, ProjectError, updateProject } from "@/lib/server/projects";

type Context = { params: Promise<{ id: string }> };

const notFound = () => errorJson(404, "not_found", "Project not found.");

/** GET /api/projects/:id  →  { project } */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const project = getProject((await params).id);
  return project ? json({ project }) : notFound();
}

/** PATCH /api/projects/:id { name?, instructions? }  →  { project } */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    const body = await readBody(request);
    const project = updateProject(id, { name: body.name, instructions: body.instructions });
    return project ? json({ project }) : notFound();
  } catch (err) {
    if (err instanceof ProjectError) return errorJson(err.status, err.code, err.message);
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}

/**
 * DELETE /api/projects/:id  →  { ok: true }
 * The project's sessions are kept and become chats on their own.
 */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  return deleteProject((await params).id) ? json({ ok: true }) : notFound();
}
