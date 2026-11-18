import { cleanTitle } from "@/lib/title";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { createSession, listSessions } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** GET /api/sessions?q=  →  { sessions } most recently active first. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const query = new URL(request.url).searchParams.get("q") ?? undefined;
  return json({ sessions: listSessions(query) });
}

/** POST /api/sessions { title? }  →  201 { session } */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    const title = body.title === undefined ? null : cleanTitle(body.title);
    if (body.title !== undefined && !title) {
      return errorJson(400, "bad_title", "Title must not be empty.");
    }
    return json({ session: createSession(title) }, 201);
  } catch (err) {
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
