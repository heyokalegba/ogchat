import { cleanTitle } from "@/lib/title";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { projectExists } from "@/lib/server/projects";
import { cleanSessionModel } from "@/lib/server/settings";
import { createSession, isEffort, isValidId, listSessions } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions?q=&project=  →  { sessions } most recently active first.
 * `project` is a project id, or "none" for the chats that belong to no project.
 */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const search = new URL(request.url).searchParams;
  const query = search.get("q") ?? undefined;
  const project = search.get("project");
  if (project && project !== "none" && !isValidId(project)) {
    return errorJson(400, "bad_project", "That is not a project id.");
  }
  return json({ sessions: listSessions(query, project) });
}

/** POST /api/sessions { title?, projectId?, model?, reasoning? }  →  201 { session } */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    const title = body.title === undefined ? null : cleanTitle(body.title);
    if (body.title !== undefined && !title) {
      return errorJson(400, "bad_title", "Title must not be empty.");
    }
    const projectId = body.projectId ?? null;
    if (projectId !== null && !(isValidId(projectId) && projectExists(projectId))) {
      return errorJson(400, "bad_project", "That project does not exist.");
    }
    const model = body.model == null ? null : cleanSessionModel(body.model);
    if (body.model != null && !model) {
      return errorJson(400, "bad_model", "That is not a model a chat can be set to.");
    }
    if (body.reasoning != null && !isEffort(body.reasoning)) {
      return errorJson(400, "bad_reasoning", "That is not a thinking level.");
    }
    const reasoning = isEffort(body.reasoning) ? body.reasoning : null;
    return json({ session: createSession(title, projectId, model, reasoning) }, 201);
  } catch (err) {
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
