import { guard } from "@/lib/server/guard";
import { json } from "@/lib/server/http";
import { getWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

/** GET /api/world  →  { world: { builtAt } }: the day this street was first opened. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  return json({ world: getWorld() });
}
