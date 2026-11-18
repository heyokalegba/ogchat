/** Small helpers shared by the API routes. Plain web Request/Response, no framework types. */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function errorJson(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export class BadRequest extends Error {}

/** Parses a JSON object body. An empty body counts as {}. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new BadRequest("Could not read the request body.");
  }
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BadRequest("Request body must be JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequest("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}
