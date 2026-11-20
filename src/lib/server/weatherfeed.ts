import path from "node:path";
import { BROOKLYN, brooklynDate, dateInRange } from "@/lib/daylight";
import type { DayRecord, Reading } from "@/lib/weather";
import { readJson, writeJsonAtomic } from "./fsjson";
import { dataDir } from "./paths";

/**
 * New York's weather, from Open-Meteo (open-meteo.com): a public weather
 * service that needs no account and no key.
 *
 * This is the one thing besides your model provider that ogchat reaches out
 * to, and only when the scene is set to live weather. The request carries
 * nothing of yours: it asks for the weather at a fixed point in Brooklyn and
 * nothing else. What comes back is kept under data/weather, so a past day is
 * asked for once and then read from disk.
 *
 * Two things are fetched:
 *  - the weather right now (looked at again every ten minutes), and
 *  - the weather hour by hour on a day in the past, from the service's
 *    record of what its forecast models had for that day, falling back to
 *    its reanalysis archive.
 */

export class WeatherUnavailable extends Error {}

const NOW_FOR_MS = 10 * 60_000;
const RECENT_FOR_MS = 3 * 3_600_000;
/** After this many days the record of a day is taken as settled and kept for good. */
const SETTLED_DAYS = 5;
/** How far back the forecast service itself still answers for. */
const FORECAST_REACH_DAYS = 85;
const TIMEOUT_MS = 9_000;
const DAY_MS = 86_400_000;

const PLACE =
  `latitude=${BROOKLYN.latitude.toFixed(2)}&longitude=${BROOKLYN.longitude.toFixed(2)}` +
  `&timezone=${encodeURIComponent(BROOKLYN.timeZone)}`;
const CURRENT =
  "weather_code,cloud_cover,precipitation,snowfall,wind_speed_10m,wind_direction_10m,temperature_2m";
const HOURLY = `${CURRENT},snow_depth`;
/** The least that makes weather. Asked for alone if the service refuses the full list. */
const BARE = "weather_code,cloud_cover,temperature_2m";

/** Where to ask. OGCHAT_WEATHER_URL points all three at one place, for trials and tests. */
function hosts() {
  const override = process.env.OGCHAT_WEATHER_URL?.trim().replace(/\/+$/, "");
  if (override) return { now: override, past: override, archive: override };
  return {
    now: "https://api.open-meteo.com",
    past: "https://historical-forecast-api.open-meteo.com",
    archive: "https://archive-api.open-meteo.com",
  };
}

async function ask(url: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new WeatherUnavailable("The weather service could not be reached.");
  }
  if (!response.ok) {
    throw new WeatherUnavailable(`The weather service answered ${response.status}.`);
  }
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    // falls through
  }
  throw new WeatherUnavailable("The weather service sent something that was not weather.");
}

const numberOr = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** One reading out of a set of named figures (the service's "current" block, or one hour). */
function reading(time: unknown, at: (name: string) => unknown): Reading | null {
  const code = numberOr(at("weather_code"));
  if (typeof time !== "string" || code === null) return null;
  return {
    time,
    code,
    cloud: numberOr(at("cloud_cover")),
    precipMm: numberOr(at("precipitation")),
    snowCm: numberOr(at("snowfall")),
    snowDepthM: numberOr(at("snow_depth")),
    windKph: numberOr(at("wind_speed_10m")),
    windFrom: numberOr(at("wind_direction_10m")),
    visibilityM: numberOr(at("visibility")),
    tempC: numberOr(at("temperature_2m")),
  };
}

/** The service's hourly block (parallel lists under one name each) as readings in order. */
function hourly(body: Record<string, unknown>): Reading[] {
  const block = body.hourly;
  if (!block || typeof block !== "object") return [];
  const lists = block as Record<string, unknown>;
  const times = Array.isArray(lists.time) ? lists.time : [];
  const found: Reading[] = [];
  times.forEach((time, i) => {
    const one = reading(time, (name) => {
      const list = lists[name];
      return Array.isArray(list) ? list[i] : undefined;
    });
    if (one) found.push(one);
  });
  return found;
}

// ------------------------------------------------------------------ right now

interface Kept<T> {
  at: number;
  value: T;
}

const memory = globalThis as {
  __ogchatWeather?: {
    now?: Kept<Reading>;
    asking?: Promise<Reading>;
    days: Map<string, Promise<DayRecord>>;
  };
};
function state() {
  memory.__ogchatWeather ??= { days: new Map() };
  return memory.__ogchatWeather;
}

async function fetchNow(): Promise<Reading> {
  // The hourly lists are asked for as well, because snow on the ground and
  // visibility are hourly figures; the hour that matches "now" supplies them.
  const base = `${hosts().now}/v1/forecast?${PLACE}`;
  let body: Record<string, unknown>;
  try {
    body = await ask(
      `${base}&current=${CURRENT}&hourly=snow_depth,visibility,weather_code&forecast_days=1`,
    );
  } catch {
    // Refused or failed: once more, asking for the bare minimum.
    body = await ask(`${base}&current=${BARE}`);
  }
  const block = body.current;
  const figures = block && typeof block === "object" ? (block as Record<string, unknown>) : null;
  const current = figures ? reading(figures.time, (name) => figures[name]) : null;
  if (!current) throw new WeatherUnavailable("The weather service sent no current weather.");
  const hour = hourly(body).find((h) => h.time.slice(0, 13) === current.time.slice(0, 13));
  return {
    ...current,
    snowDepthM: current.snowDepthM ?? hour?.snowDepthM ?? null,
    visibilityM: current.visibilityM ?? hour?.visibilityM ?? null,
  };
}

/** The weather in New York now. Asked for at most once every ten minutes. */
export async function weatherNow(nowMs = Date.now()): Promise<Reading> {
  const s = state();
  if (s.now && nowMs - s.now.at < NOW_FOR_MS) return s.now.value;
  s.asking ??= fetchNow()
    .then((value) => {
      s.now = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      s.asking = undefined;
    });
  try {
    return await s.asking;
  } catch (error) {
    // A reading up to an hour old is better than none while the service is away.
    if (s.now && nowMs - s.now.at < 3_600_000) return s.now.value;
    throw error;
  }
}

// ---------------------------------------------------------------- a past day

interface DayFile extends DayRecord {
  savedAt: string;
  /** Old enough when saved that the record will not change: never asked for again. */
  settled: boolean;
  source: string;
}

function dayFile(date: string): string {
  return path.join(dataDir(), "weather", `${date}.json`);
}

function readDay(date: string, nowMs: number): DayRecord | null {
  try {
    const raw = readJson(dayFile(date)) as Partial<DayFile> | null;
    if (!raw || raw.date !== date || !Array.isArray(raw.hours) || raw.hours.length !== 24)
      return null;
    const fresh = raw.settled || nowMs - Date.parse(raw.savedAt ?? "") < RECENT_FOR_MS;
    return fresh ? { date, hours: raw.hours as DayRecord["hours"] } : null;
  } catch {
    return null;
  }
}

function daysAgo(date: string, nowMs: number): number {
  return Math.round((Date.parse(brooklynDate(nowMs)) - Date.parse(date)) / DAY_MS);
}

async function fetchDay(date: string, nowMs: number): Promise<DayRecord> {
  const span = `start_date=${date}&end_date=${date}`;
  const { now, past, archive } = hosts();
  const sources: [string, string][] = [
    ["historical-forecast", `${past}/v1/forecast?${PLACE}&${span}&hourly=${HOURLY},visibility`],
  ];
  if (daysAgo(date, nowMs) <= FORECAST_REACH_DAYS) {
    sources.push(["forecast", `${now}/v1/forecast?${PLACE}&${span}&hourly=${HOURLY},visibility`]);
  }
  sources.push(["archive", `${archive}/v1/archive?${PLACE}&${span}&hourly=${HOURLY}`]);
  // Last resorts: the same records asked for the bare minimum, in case one
  // of them will not answer for a figure on the full list.
  sources.push(
    ["historical-forecast", `${past}/v1/forecast?${PLACE}&${span}&hourly=${BARE}`],
    ["archive", `${archive}/v1/archive?${PLACE}&${span}&hourly=${BARE}`],
  );

  let problem: unknown = null;
  for (const [source, url] of sources) {
    try {
      const hours: DayRecord["hours"] = Array.from({ length: 24 }, () => null);
      for (const one of hourly(await ask(url))) {
        if (one.time.slice(0, 10) !== date) continue;
        const hour = Number(one.time.slice(11, 13));
        if (hour >= 0 && hour < 24) hours[hour] = one;
      }
      // A day with most of its hours missing is no record; try the next source.
      if (hours.filter(Boolean).length < 18) continue;
      const file: DayFile = {
        date,
        hours,
        savedAt: new Date().toISOString(),
        settled: daysAgo(date, nowMs) >= SETTLED_DAYS,
        source,
      };
      writeJsonAtomic(dayFile(date), file);
      return { date, hours };
    } catch (error) {
      problem = error;
    }
  }
  throw problem instanceof WeatherUnavailable
    ? problem
    : new WeatherUnavailable(`The weather service has no record for ${date}.`);
}

/** Whether `date` is a day the record can be asked about. */
export function recordable(date: string, nowMs = Date.now()): boolean {
  return dateInRange(date, nowMs);
}

/** The weather hour by hour on a day in New York, from disk if it has been asked for before. */
export async function weatherOn(date: string, nowMs = Date.now()): Promise<DayRecord> {
  const kept = readDay(date, nowMs);
  if (kept) return kept;
  const days = state().days;
  let asking = days.get(date);
  if (!asking) {
    asking = fetchDay(date, nowMs).finally(() => days.delete(date));
    days.set(date, asking);
  }
  return asking;
}
