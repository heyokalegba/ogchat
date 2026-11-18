import { stopGeneration } from "@/lib/server/generations";
import { guard } from "@/lib/server/guard";
import { json } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/:id/stop  →  { stopped }
 * Halts the reply in progress. Text received so far is kept as a partial reply.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  return json({ stopped: stopGeneration(id) });
}
