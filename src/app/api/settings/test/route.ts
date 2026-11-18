import { checkProvider } from "@/lib/provider/adapter";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { previewSettings, SettingsValidationError } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/test { baseUrl?, model?, apiKey? }  →  { check }
 *
 * Tests the provider settings as they would be if the given fields were
 * saved, without saving anything. Fields left out fall back to what is in
 * use now, so an empty body tests the current setup. It asks the provider for
 * its model list, then sends one tiny message. The key never comes back.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    const settings = previewSettings({
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
    });
    const check = await checkProvider({
      config: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
    });
    return json({ check, keySource: settings.keySource });
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return errorJson(400, "invalid_settings", err.message);
    }
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
