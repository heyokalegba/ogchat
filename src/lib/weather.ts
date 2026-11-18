/**
 * The season and the weather over Brooklyn.
 *
 * The season is the calendar's. The weather is made up, since ogchat talks
 * to nothing but your model provider, but it is made up by the clock rather
 * than by chance at the moment of asking: time is cut into three-hour
 * stretches and each stretch has its weather, weighted by the season, with a
 * tendency to carry on from the stretch before. So the rain that is falling
 * is still falling after a reload, and winter gets snow where summer gets
 * thunder.
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

/** The season in Brooklyn at a moment. */
export function seasonAt(ms: number): SeasonName {
  return seasonOfMonth(Number(monthInNewYork.format(new Date(ms))) - 1);
}

/** How likely each kind of weather is, season by season. Each row sums to 1. */
const ODDS: Record<SeasonName, readonly [Weather, number][]> = {
  spring: [
    ["clear", 0.4],
    ["cloudy", 0.25],
    ["rain", 0.25],
    ["fog", 0.07],
    ["storm", 0.03],
  ],
  summer: [
    ["clear", 0.52],
    ["cloudy", 0.2],
    ["rain", 0.14],
    ["storm", 0.11],
    ["fog", 0.03],
  ],
  autumn: [
    ["clear", 0.36],
    ["cloudy", 0.3],
    ["rain", 0.22],
    ["fog", 0.11],
    ["storm", 0.01],
  ],
  winter: [
    ["clear", 0.36],
    ["cloudy", 0.29],
    ["snow", 0.25],
    ["fog", 0.07],
    ["rain", 0.03],
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

/** How much the weather keeps people indoors: 0 not at all, 1 nobody about. */
export function shelter(weather: Weather): number {
  return { clear: 0, cloudy: 0, fog: 0.15, snow: 0.4, rain: 0.5, storm: 0.85 }[weather];
}

/** Whether the sky is covered: no sun, moon or stars to be seen, a flatter light. */
export function overcast(weather: Weather): number {
  return { clear: 0, cloudy: 0.45, fog: 0.5, snow: 0.6, rain: 0.7, storm: 0.9 }[weather];
}
