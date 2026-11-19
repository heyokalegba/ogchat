/**
 * The sky over Brooklyn at a given moment: where the sun and moon are, which
 * of the four lights the backdrop should be in, and what the clock on the
 * wall there says. Pure functions of a timestamp, so they can be tested and
 * so the scene can be set to any time and left to run on from it.
 */

export const BROOKLYN = { latitude: 40.6782, longitude: -73.9442, timeZone: "America/New_York" };

export type SkyState = "day" | "golden" | "dusk" | "night";

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** 2000-01-01 12:00 UTC, the epoch the solar formulas count days from. */
const J2000 = Date.UTC(2000, 0, 1, 12);

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** Wraps an angle in degrees to (-180, 180]. */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export interface Sun {
  /** Degrees above the horizon; negative when it is down. */
  elevation: number;
  /** Degrees from due south: negative before solar noon, positive after. */
  hourAngle: number;
  /** The hour angle at which the sun sets today (and, negated, rises). */
  setAngle: number;
  /** Degrees north of the celestial equator; it sets the season. */
  declination: number;
}

/** The sun's position, to within about a degree (the low-precision almanac formulas). */
export function sunAt(ms: number, place = BROOKLYN): Sun {
  const d = (ms - J2000) / DAY_MS;
  const anomaly = (357.529 + 0.98560028 * d) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * d;
  const longitude =
    (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const tilt = (23.439 - 0.00000036 * d) * RAD;
  const rightAscension = Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude));
  const declination = Math.asin(Math.sin(tilt) * Math.sin(longitude));
  const siderealHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const hourAngle = wrap(siderealHours * 15 + place.longitude - rightAscension / RAD);
  const lat = place.latitude * RAD;
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle * RAD),
  );
  const setAngle = Math.acos(clamp(-Math.tan(lat) * Math.tan(declination), -1, 1)) / RAD;
  return { elevation: elevation / RAD, hourAngle, setAngle, declination: declination / RAD };
}

const SYNODIC_DAYS = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** Where the moon is in its cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(ms: number): number {
  const cycles = (ms - NEW_MOON) / (SYNODIC_DAYS * DAY_MS);
  return ((cycles % 1) + 1) % 1;
}

export interface SkyBlend {
  /** The backdrop shows `from`, with `to` faded in over it by `mix` (0..1). */
  from: SkyState;
  to: SkyState;
  mix: number;
  /** 0 in daylight, 1 once it is properly dark: drives stars, halos and how lit the windows are. */
  night: number;
  /** The sun is in the east, so the glow on the horizon belongs on the other side. */
  morning: boolean;
}

/** Which light the scene is in, from how high the sun is. Twilight is a blend, not a switch. */
export function skyBlend(sun: Pick<Sun, "elevation" | "hourAngle">): SkyBlend {
  const e = sun.elevation;
  const base = { night: clamp((2 - e) / 12), morning: sun.hourAngle < 0 };
  if (e >= 8) return { from: "day", to: "day", mix: 0, ...base };
  if (e >= 1) return { from: "day", to: "golden", mix: (8 - e) / 7, ...base };
  if (e >= -5) return { from: "golden", to: "dusk", mix: (1 - e) / 6, ...base };
  if (e >= -13) return { from: "dusk", to: "night", mix: (-5 - e) / 8, ...base };
  return { from: "night", to: "night", mix: 0, ...base };
}

export interface SkyView {
  blend: SkyBlend;
  /** Positions are percentages of the scene, measured to the centre of the disc. */
  sun: { x: number; y: number; low: number; up: boolean };
  moon: { x: number; y: number; frame: number; opacity: number; up: boolean };
  elevation: number;
}

/** How far down the scene the horizon sits, and how much of it one degree of height covers. */
const HORIZON_Y = 80;
const Y_PER_DEGREE = 0.95;

/** Everything the backdrop needs to draw the sky at a moment. */
export function readSky(ms: number, place = BROOKLYN): SkyView {
  const sun = sunAt(ms, place);
  const blend = skyBlend(sun);

  // The sun crosses from the left edge at sunrise to the right edge at sunset.
  const across = clamp(sun.hourAngle / sun.setAngle, -1.3, 1.3);

  // The moon trails the sun by its phase: new moon rides with it, full moon opposite.
  const phase = moonPhase(ms);
  const moonAngle = wrap(sun.hourAngle - phase * 360);
  const lat = place.latitude * RAD;
  const moonDeclination = sun.declination * Math.cos(phase * 2 * Math.PI) * RAD;
  const moonElevation =
    Math.asin(
      Math.sin(lat) * Math.sin(moonDeclination) +
        Math.cos(lat) * Math.cos(moonDeclination) * Math.cos(moonAngle * RAD),
    ) / RAD;
  const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2; // how much of the disc is lit

  return {
    blend,
    elevation: sun.elevation,
    sun: {
      x: 50 + across * 44,
      y: HORIZON_Y - sun.elevation * Y_PER_DEGREE,
      low: clamp((14 - sun.elevation) / 12),
      up: sun.elevation > -9,
    },
    moon: {
      x: 50 + clamp(moonAngle / 90, -1.3, 1.3) * 44,
      y: HORIZON_Y - moonElevation * Y_PER_DEGREE,
      frame: Math.round(phase * 8) % 8,
      // Pale by day, bright at night; a new moon is not there to see.
      opacity: lit < 0.04 ? 0 : 0.3 + 0.7 * blend.night,
      up: moonElevation > -6,
    },
  };
}

export interface WallClock {
  /** Minutes since midnight, Brooklyn time. */
  minutes: number;
  /** "7:42 pm" */
  label: string;
  /** "Wednesday" */
  weekday: string;
}

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BROOKLYN.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "long",
});
const labelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BROOKLYN.timeZone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** What a clock in Brooklyn reads at a moment, whatever time zone the viewer is in. */
export function brooklynClock(ms: number): WallClock {
  const parts = Object.fromEntries(partsFormat.formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    label: labelFormat.format(ms).replace(/\s+/g, " ").toLowerCase(),
    weekday: parts.weekday ?? "",
  };
}

/** "9:30 am" for minutes since midnight. */
export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(m / 60);
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(m % 60).padStart(2, "0")} ${suffix}`;
}

/**
 * The scene's clock is the real clock plus an offset. It cannot be stopped:
 * setting a time only changes the offset, and time runs on from there.
 *
 * This returns the offset that makes the Brooklyn clock read `targetMinutes`
 * right now, taking the shorter way round the dial (so 11 pm set at 1 am goes
 * two hours back, not twenty-two forward).
 */
export function offsetForClockTime(realNowMs: number, targetMinutes: number): number {
  let delta = targetMinutes - brooklynClock(realNowMs).minutes;
  if (delta > 720) delta -= 1440;
  if (delta <= -720) delta += 1440;
  return delta * 60_000;
}

/** "real time", "2 h 10 min ahead", "45 min behind". */
export function describeOffset(offsetMs: number): string {
  const minutes = Math.round(Math.abs(offsetMs) / 60_000);
  if (minutes === 0) return "real time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const span = [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
  return `${span} ${offsetMs > 0 ? "ahead" : "behind"}`;
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BROOKLYN.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The Brooklyn calendar and clock at a moment, as numbers. */
function wallParts(ms: number) {
  const parts = Object.fromEntries(dateFormat.formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const two = (n: number) => String(n).padStart(2, "0");

/** The date in Brooklyn at a moment: "2026-11-19". */
export function brooklynDate(ms: number): string {
  const { year, month, day } = wallParts(ms);
  return `${year}-${two(month)}-${two(day)}`;
}

/** The hour of the day in Brooklyn at a moment, 0 to 23. */
export function brooklynHour(ms: number): number {
  return wallParts(ms).hour;
}

/** The first day the scene can be set back to. */
export const FIRST_DATE = "2025-01-01";

/** Whether `date` is a real day ("YYYY-MM-DD") from the first one up to today in Brooklyn. */
export function dateInRange(date: string, nowMs: number): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(stamp).toISOString().slice(0, 10) !== date) return false; // no 30th of February
  return date >= FIRST_DATE && date <= brooklynDate(nowMs);
}

/**
 * The moment on another day when a clock in Brooklyn reads what it reads at
 * `ms`: the same time of day, on `date`. Daylight saving is taken into
 * account, so 3 pm stays 3 pm across the change.
 */
export function atBrooklynDate(ms: number, date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const wall = wallParts(ms);
  // The wall time wanted, read as if it were UTC; then take off New York's offset there.
  const wanted = Date.UTC(year, month - 1, day, wall.hour, wall.minute, wall.second);
  const offsetAt = (at: number) => {
    const w = wallParts(at);
    return (
      Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) -
      Math.floor(at / 1000) * 1000
    );
  };
  let moment = wanted - offsetAt(wanted);
  moment = wanted - offsetAt(moment);
  return moment + (((ms % 1000) + 1000) % 1000);
}
