import { ChatRequestError, compressSession, contextOf, expandSession } from "@/lib/server/chat";
import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/:id/compress  →  { session, context }
 *
 * Has the model summarise the conversation so far and keeps the summary
 * with the session. From then on the summary is sent in place of the
 * messages it covers, which frees most of the context window. The messages
 * stay in the session. This waits for the model, so it can take a while.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    const session = await compressSession(id, request.signal);
    return json({ session, context: contextOf(session) });
  } catch (err) {
    if (err instanceof ChatRequestError) return errorJson(err.status, err.code, err.message);
    throw err;
  }
}

/** DELETE /api/sessions/:id/compress  →  { session, context }: the whole conversation is sent again. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    const session = expandSession(id);
    return json({ session, context: contextOf(session) });
  } catch (err) {
    if (err instanceof ChatRequestError) return errorJson(err.status, err.code, err.message);
    throw err;
  }
}
