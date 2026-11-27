import { cleanTitle } from "@/lib/title";
import type { SessionDetail } from "@/lib/types";
import { contextOf } from "@/lib/server/chat";
import { getGeneration, stopGeneration } from "@/lib/server/generations";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { projectExists } from "@/lib/server/projects";
import {
  deleteSession,
  getSession,
  isValidId,
  moveSession,
  renameSession,
  isEffort,
  setSessionModel,
  setSessionReasoning,
  setSessionWork,
  toMeta,
} from "@/lib/server/store";
import { cleanSessionModel } from "@/lib/server/settings";
import { parseWork } from "@/lib/server/work";

type Context = { params: Promise<{ id: string }> };

const notFound = () => errorJson(404, "not_found", "Session not found.");

/** GET /api/sessions/:id  →  { session, generating, partial, thinking, ranOn, context } */
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
    thinking: generation?.thinking ?? "",
    ranOn: generation?.ranOn ?? null,
    context: contextOf(session),
  };
  return json(detail);
}

/**
 * PATCH /api/sessions/:id { title?, projectId?, model?, reasoning? }  →  { session }
 * `projectId` files the session under a project; null takes it out of one.
 * `model` is { provider, model }, the model this chat uses; null goes back to
 * the one in settings. `reasoning` is this chat's thinking level, or null for
 * the level in settings. `repo`, `branch` and `environmentId` say where the chat
 * works; null or "" clears one.
 */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    const body = await readBody(request);
    let session = getSession(id);
    if (!session) return notFound();
    if (body.projectId !== undefined) {
      const projectId = body.projectId;
      if (projectId !== null && !(isValidId(projectId) && projectExists(projectId))) {
        return errorJson(400, "bad_project", "That project does not exist.");
      }
      session = moveSession(id, projectId) ?? session;
    }
    if (body.model !== undefined) {
      const model = body.model === null ? null : cleanSessionModel(body.model);
      if (body.model !== null && !model) {
        return errorJson(400, "bad_model", "That is not a model a chat can be set to.");
      }
      session = setSessionModel(id, model) ?? session;
    }
    if (body.reasoning !== undefined) {
      if (body.reasoning !== null && !isEffort(body.reasoning)) {
        return errorJson(400, "bad_reasoning", "That is not a thinking level.");
      }
      session =
        setSessionReasoning(id, isEffort(body.reasoning) ? body.reasoning : null) ?? session;
    }
    const work = parseWork(body);
    if (typeof work === "string") return errorJson(400, "bad_work", work);
    const placed = Object.keys(work).length > 0;
    if (placed) session = setSessionWork(id, work) ?? session;
    const only =
      body.projectId === undefined &&
      body.model === undefined &&
      body.reasoning === undefined &&
      !placed;
    if (body.title !== undefined || only) {
      const title = cleanTitle(body.title);
      if (!title) return errorJson(400, "bad_title", "Title must not be empty.");
      session = renameSession(id, title) ?? session;
    }
    return json({ session: toMeta(session) });
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
