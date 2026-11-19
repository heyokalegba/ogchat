import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { recordable, weatherNow, weatherOn, WeatherUnavailable } from "@/lib/server/weatherfeed";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather                  →  { now: Reading }: New York's weather at this moment
 * GET /api/weather?date=2025-01-06  →  { day: { date, hours } }: that day, hour by hour
 *
 * Both come from a public weather service (see server/weatherfeed.ts) and
 * are only asked for when the scene is set to live weather.
 */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const date = new URL(request.url).searchParams.get("date");
  try {
    if (date === null) return json({ now: await weatherNow() });
    if (!recordable(date)) {
      return errorJson(400, "bad_date", "Pick a day from 1 January 2025 up to today.");
    }
    return json({ day: await weatherOn(date) });
  } catch (error) {
    if (error instanceof WeatherUnavailable) {
      return errorJson(502, "weather_unavailable", error.message);
    }
    throw error;
  }
}
