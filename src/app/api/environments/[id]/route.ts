import { deleteEnvironment, EnvironmentError, updateEnvironment } from "@/lib/server/environments";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/environments/:id { name?, network?, setup?, vars? }  →  { environment } */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    return json({ environment: updateEnvironment(id, await readBody(request)) });
  } catch (err) {
    if (err instanceof EnvironmentError) return errorJson(err.status, err.code, err.message);
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}

/** DELETE /api/environments/:id  →  { ok: true }. Chats that used it go back to the default. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  return deleteEnvironment(id)
    ? json({ ok: true })
    : errorJson(404, "not_found", "That environment does not exist.");
}
