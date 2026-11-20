/**
 * The season and the weather over Brooklyn.
 *
 * The season is the calendar's. The weather is New York's own: a reading
 * from a public weather service (see server/weatherfeed.ts), live for today
 * and from the record for a day in the past. This module turns a reading
 * into what the scene shows: what kind of weather, how covered the sky, how
 * hard it is coming down, whether snow is lying.
 *
 * When there is no reading (offline, or live weather switched off) the
 * weather is made up instead, by the clock rather than by chance at the
 * moment of asking: time is cut into three-hour stretches and each has its
 * weather, weighted by the season, with a tendency to carry on from the one
 * before. So made-up rain is still falling after a reload.
 */

export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"] as const;
export type SeasonName = (typeof SEASON_NAMES)[number];

export const WEATHERS = ["clear", "cloudy", "rain", "storm", "fog", "snow"] as const;
export type Weather = (typeof WEATHERS)[number];

/** The season in New York for a month of the year (0 = January). */
export function seasonOfMonth(month: number): SeasonName {
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

const monthInNewYork = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "numeric",
});

/** About how warm an afternoon is in each season, in °C: used when the real figure is not known. */
export const USUAL_TEMP_C: Record<SeasonName, number> = {
  spring: 13,
  summer: 27,
  autumn: 14,
  winter: 2,
};

/** The season in Brooklyn at a moment. */
export function seasonAt(ms: number): SeasonName {
  return seasonOfMonth(Number(monthInNewYork.format(new Date(ms))) - 1);
}

/** How likely each kind of weather is, season by season. Each row sums to 1. */
const ODDS: Record<SeasonName, readonly [Weather, number][]> = {
  spring: [
    ["clear", 0.45],
    ["cloudy", 0.27],
    ["rain", 0.23],
    ["fog", 0.02],
    ["storm", 0.03],
  ],
  summer: [
    ["clear", 0.54],
    ["cloudy", 0.2],
    ["rain", 0.14],
    ["storm", 0.11],
    ["fog", 0.01],
  ],
  autumn: [
    ["clear", 0.44],
    ["cloudy", 0.3],
    ["rain", 0.22],
    ["fog", 0.03],
    ["storm", 0.01],
  ],
  winter: [
    ["clear", 0.46],
    ["cloudy", 0.3],
    ["rain", 0.14],
    ["snow", 0.08],
    ["fog", 0.02],
  ],
};

const STRETCH_MS = 3 * 3_600_000;

/** A repeatable number in [0, 1) for a pair of integers. */
function chanceOf(a: number, b: number): number {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x51ed270b, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function drawn(stretch: number, season: SeasonName): Weather {
  let roll = chanceOf(stretch, 7);
  for (const [weather, share] of ODDS[season]) {
    roll -= share;
    if (roll < 0) return weather;
  }
  return "clear";
}

/** The weather at a moment, in a season. */
export function weatherAt(ms: number, season: SeasonName): Weather {
  const stretch = Math.floor(ms / STRETCH_MS);
  // Weather lingers: about two stretches in five simply carry on from the one before.
  return chanceOf(stretch, 8) < 0.4 ? drawn(stretch - 1, season) : drawn(stretch, season);
}

/**
 * One reading of the weather in New York, as the weather service gives it.
 * Any figure but the code can be missing.
 */
export interface Reading {
  /** New York local time the reading is for: "2026-11-19T10:15". */
  time: string;
  /** WMO weather code: 0 clear, 3 overcast, 45 fog, 61 rain, 71 snow, 95 thunderstorm... */
  code: number;
  /** Cloud cover in percent. */
  cloud: number | null;
  /** Rain and melted snow in the last hour, millimetres. */
  precipMm: number | null;
  /** Snow fallen in the last hour, centimetres. */
  snowCm: number | null;
  /** Snow lying on the ground, metres. */
  snowDepthM: number | null;
  windKph: number | null;
  visibilityM: number | null;
  tempC: number | null;
}

/** A day of readings from the record, one for each hour of the New York day (some may be missing). */
export interface DayRecord {
  /** "2025-01-06" */
  date: string;
  hours: (Reading | null)[];
}

/** What the scene is told about the weather. */
export interface Conditions {
  kind: Weather;
  /** How covered the sky is: 0 clear, 1 solid cloud. */
  cover: number;
  /** How hard it is raining or snowing. */
  force: "light" | "steady" | "heavy";
  /** Snow is lying on the ground. */
  snowLying: boolean;
}

const WMO: Record<number, [Weather, Conditions["force"], string]> = {
  0: ["clear", "steady", "clear sky"],
  1: ["clear", "steady", "mainly clear"],
  2: ["cloudy", "steady", "partly cloudy"],
  3: ["cloudy", "steady", "overcast"],
  45: ["fog", "steady", "fog"],
  48: ["fog", "steady", "freezing fog"],
  51: ["rain", "light", "light drizzle"],
  53: ["rain", "light", "drizzle"],
  55: ["rain", "steady", "heavy drizzle"],
  56: ["rain", "light", "freezing drizzle"],
  57: ["rain", "steady", "freezing drizzle"],
  61: ["rain", "light", "light rain"],
  63: ["rain", "steady", "rain"],
  65: ["rain", "heavy", "heavy rain"],
  66: ["rain", "light", "freezing rain"],
  67: ["rain", "heavy", "heavy freezing rain"],
  71: ["snow", "light", "light snow"],
  73: ["snow", "steady", "snow"],
  75: ["snow", "heavy", "heavy snow"],
  77: ["snow", "light", "snow grains"],
  80: ["rain", "light", "light showers"],
  81: ["rain", "steady", "showers"],
  82: ["rain", "heavy", "violent showers"],
  85: ["snow", "light", "snow showers"],
  86: ["snow", "heavy", "heavy snow showers"],
  95: ["storm", "steady", "thunderstorm"],
  96: ["storm", "heavy", "thunderstorm with hail"],
  99: ["storm", "heavy", "thunderstorm with heavy hail"],
};

/** Snow counts as lying once the record has a centimetre of it on the ground. */
const LYING_M = 0.01;

/** How covered the sky is under each kind of weather when no figure for it is to hand. */
const USUAL_COVER: Record<Weather, number> = {
  clear: 0.1,
  cloudy: 0.8,
  fog: 0.7,
  rain: 0.95,
  storm: 1,
  snow: 0.95,
};

/** What the scene should show for a reading. A code this does not know counts as cloud. */
export function conditionsOf(reading: Reading): Conditions {
  const [kind, force] = WMO[reading.code] ?? ["cloudy", "steady"];
  const measured = reading.cloud === null ? null : Math.min(1, Math.max(0, reading.cloud / 100));
  // Whatever is falling is falling from something: rain under a "clear" sky still covers it.
  const least = kind === "clear" || kind === "cloudy" || kind === "fog" ? 0 : 0.8;
  return {
    kind,
    cover: Math.max(least, measured ?? USUAL_COVER[kind]),
    force,
    snowLying: (reading.snowDepthM ?? 0) >= LYING_M,
  };
}

/** The scene's conditions for a kind of weather chosen by hand or made up. */
export function conditionsFor(kind: Weather, snowLying = false): Conditions {
  return { kind, cover: USUAL_COVER[kind], force: "steady", snowLying };
}

/**
 * The made-up weather at a moment, for when there is no reading. In winter
 * snow lies for about a day after it last fell.
 */
export function inventedAt(ms: number, season: SeasonName): Conditions {
  const kind = weatherAt(ms, season);
  let lying = false;
  if (season === "winter") {
    for (let back = 0; back <= 8 && !lying; back++) {
      lying = weatherAt(ms - back * STRETCH_MS, season) === "snow";
    }
  }
  return conditionsFor(kind, lying);
}

const fahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

/** "light rain", for a reading's code. */
export function nameOf(reading: Reading): string {
  return WMO[reading.code]?.[2] ?? "cloud";
}

/** "light rain · 48°F (9°C) · wind 9 mph": a reading in words. */
export function describeReading(reading: Reading): string {
  const parts = [nameOf(reading)];
  if (reading.tempC !== null) {
    parts.push(`${fahrenheit(reading.tempC)}°F (${Math.round(reading.tempC)}°C)`);
  }
  if (reading.windKph !== null) parts.push(`wind ${Math.round(reading.windKph / 1.609)} mph`);
  if ((reading.snowDepthM ?? 0) >= LYING_M) {
    parts.push(`${Math.max(1, Math.round((reading.snowDepthM ?? 0) * 39.37))} in of snow lying`);
  }
  return parts.join(" · ");
}

/** The reading for an hour of a day from the record, or the nearest hour that has one. */
export function readingAtHour(day: DayRecord, hour: number): Reading | null {
  for (let away = 0; away < 24; away++) {
    const found = day.hours[hour - away] ?? day.hours[hour + away];
    if (found) return found;
  }
  return null;
}

/** How much the weather keeps people indoors: 0 not at all, 1 nobody about. */
export function shelterOf(c: Conditions): number {
  const more = c.force === "heavy" ? 0.2 : c.force === "light" ? -0.2 : 0;
  const base = { clear: 0, cloudy: 0, fog: 0.15, snow: 0.4, rain: 0.5, storm: 0.85 }[c.kind];
  return base === 0 ? 0 : Math.min(0.95, Math.max(0.1, base + more));
}

/**
 * How covered the sky looks: 0 an open sky, towards 1 no sun, moon or stars
 * to be seen and a flatter light. Broken cloud leaves most of the sky open.
 */
export function greyOf(c: Conditions): number {
  if (c.kind === "clear") return c.cover * 0.3;
  if (c.kind === "cloudy") return c.cover < 0.6 ? c.cover * 0.5 : 0.3 + (c.cover - 0.6);
  const more = c.force === "heavy" ? 0.1 : c.force === "light" ? -0.1 : 0;
  return { fog: 0.5, snow: 0.6, rain: 0.7, storm: 0.9 }[c.kind] + (c.kind === "fog" ? 0 : more);
}
