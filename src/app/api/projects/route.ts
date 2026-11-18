import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { createProject, listProjects, ProjectError } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** GET /api/projects  →  { projects } by name, each with its instructions, files and session count. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  return json({ projects: listProjects() });
}

/** POST /api/projects { name }  →  201 { project } */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    return json({ project: createProject(body.name) }, 201);
  } catch (err) {
    if (err instanceof ProjectError) return errorJson(err.status, err.code, err.message);
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
