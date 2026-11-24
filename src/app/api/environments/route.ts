import { createEnvironment, EnvironmentError, listEnvironments } from "@/lib/server/environments";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/environments  →  { environments }: the default first, then the rest by name. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  return json({ environments: listEnvironments() });
}

/** POST /api/environments { name?, network?, setup?, vars? }  →  201 { environment } */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    return json({ environment: createEnvironment(await readBody(request)) }, 201);
  } catch (err) {
    if (err instanceof EnvironmentError) return errorJson(err.status, err.code, err.message);
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
