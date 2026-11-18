import { cleanTitle } from "@/lib/title";
import type { SessionDetail } from "@/lib/types";
import { getGeneration, stopGeneration } from "@/lib/server/generations";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { deleteSession, getSession, renameSession, toMeta } from "@/lib/server/store";

type Context = { params: Promise<{ id: string }> };

const notFound = () => errorJson(404, "not_found", "Session not found.");

/** GET /api/sessions/:id  →  { session, generating, partial } */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  const session = getSession(id);
  if (!session) return notFound();
  const generation = getGeneration(id);
  const detail: SessionDetail = {
    session,
    generating: Boolean(generation),
    partial: generation?.partial ?? "",
  };
  return json(detail);
}

/** PATCH /api/sessions/:id { title }  →  { session } */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    const body = await readBody(request);
    const title = cleanTitle(body.title);
    if (!title) return errorJson(400, "bad_title", "Title must not be empty.");
    const session = renameSession(id, title);
    return session ? json({ session: toMeta(session) }) : notFound();
  } catch (err) {
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}

/** DELETE /api/sessions/:id  →  { ok: true } */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  stopGeneration(id);
  return deleteSession(id) ? json({ ok: true }) : notFound();
}
