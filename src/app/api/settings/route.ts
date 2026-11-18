import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { publicSettings, SettingsValidationError, updateSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** GET /api/settings  →  { settings }. The key is reported masked, never in full. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  return json({ settings: publicSettings() });
}

/**
 * PUT /api/settings { baseUrl?, model?, apiKey? }  →  { settings }
 * apiKey: a string saves a new key, null removes the saved one, omitted leaves it.
 */
export async function PUT(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    const settings = updateSettings({
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
    });
    return json({ settings });
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return errorJson(400, "invalid_settings", err.message);
    }
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
