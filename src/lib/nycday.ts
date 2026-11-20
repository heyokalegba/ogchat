import type { BrooklynDay } from "./daylight";

/**
 * The working day of a New York block: what happens on it by the clock and
 * the calendar, apart from who is out walking (life.ts) and whose lights
 * are on (citylights.ts).
 *
 * When the shops open and shut. Which nights the rubbish goes out and when
 * the truck comes for it. When cars have to be off the kerb for the sweeper.
 * Who comes by on business: the school bus, the letter carrier, the parcel
 * van, the ice cream truck. What people wear for the temperature. When the
 * Christmas lights are up, when there are pumpkins on the steps, when there
 * are fireworks. All of it is worked out from the date, so a day's visits
 * are the same however often it is asked, and tomorrow's are different.
 */

/** A repeatable number in [0, 1) for two whole numbers. */
export function chance(a: number, b: number): number {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x51ed270b, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ clothes

export type Wardrobe = "mild" | "cold" | "hot";

/** What people have on for the temperature: coats and hats under 9°C, shorts from 24°C. */
export function wardrobeFor(tempC: number): Wardrobe {
  return tempC < 9 ? "cold" : tempC >= 24 ? "hot" : "mild";
}

/**
 * How many people have an umbrella up, from 0 to 1, for how hard it is
 * coming down. Nobody bothers in snow that is only falling lightly.
 */
export function umbrellasFor(kind: string, force: string): number {
  if (kind === "storm") return 0.85;
  if (kind === "rain") return force === "light" ? 0.45 : force === "heavy" ? 0.85 : 0.72;
  if (kind === "snow") return force === "heavy" ? 0.35 : force === "light" ? 0 : 0.15;
  return 0;
}

// -------------------------------------------------------------------- shops

/**
 * Whether a shop is open. The bodega never shuts. The bakery opens before
 * dawn and is done by seven in the evening. The pizza place opens for lunch
 * and goes on past midnight, later at the weekend.
 */
export function shopOpen(shop: string, hour: number, weekday: number): boolean {
  if (shop === "bakery") {
    const sunday = weekday === 0;
    return hour >= (sunday ? 7 : 5.5) && hour < (sunday ? 16 : 19);
  }
  if (shop === "pizza") {
    // The small hours belong to the night before: Friday's and Saturday's run to three.
    const evening = hour < 6 ? (weekday + 6) % 7 : weekday;
    const shuts = evening === 5 || evening === 6 ? 3 : 1;
    return hour >= 11 || hour < shuts;
  }
  return true;
}

// ------------------------------------------------------- rubbish and sweeping

/** Collection is on Tuesday and Friday mornings. */
const COLLECTION_DAYS = [2, 5];

/** The minute of the day the sanitation truck comes down the block, on a collection day. */
export function truckMinute(dayId: number): number {
  return 6 * 60 + 10 + Math.floor(chance(dayId, 11) * 40);
}

/**
 * Whether the rubbish is out at the kerb: from six the evening before a
 * collection until the truck has been.
 */
export function rubbishOut(now: BrooklynDay): boolean {
  if (COLLECTION_DAYS.includes(now.weekday)) return now.minute < truckMinute(now.dayId);
  const tomorrow = (now.weekday + 1) % 7;
  return COLLECTION_DAYS.includes(tomorrow) && now.hour >= 18;
}

/**
 * Whether the kerb has to be clear for the street sweeper: alternate side
 * parking, the same two mornings, nine to half past ten.
 */
export function kerbClear(now: BrooklynDay): boolean {
  return COLLECTION_DAYS.includes(now.weekday) && now.hour >= 9 && now.hour < 10.5;
}

// ------------------------------------------------------------------- visits

export type VisitKind = "schoolbus" | "garbage" | "parcel" | "icecream" | "sweeper" | "mail";

export interface Visit {
  kind: VisitKind;
  /** The minute of the day it turns into the block. */
  minute: number;
}

/**
 * Everything that comes down the block on business on a given day, in order.
 * `tempC` and `wet` decide the ice cream truck, which only comes out on a
 * warm dry day in summer.
 */
export function visitsOn(now: BrooklynDay, tempC: number, wet: boolean): Visit[] {
  const { dayId, weekday, month } = now;
  const roll = (n: number) => chance(dayId, 100 + n);
  const visits: Visit[] = [];
  const workday = weekday >= 1 && weekday <= 5;

  // The school bus, there and back, in term time.
  if (workday && month !== 7 && month !== 8) {
    visits.push({ kind: "schoolbus", minute: 7 * 60 + 35 + Math.floor(roll(1) * 35) });
    visits.push({ kind: "schoolbus", minute: 14 * 60 + 45 + Math.floor(roll(2) * 30) });
  }
  if (COLLECTION_DAYS.includes(weekday)) {
    visits.push({ kind: "garbage", minute: truckMinute(dayId) });
    visits.push({ kind: "sweeper", minute: 9 * 60 + 8 + Math.floor(roll(3) * 50) });
  }
  // Parcels: every day but Sunday, a few times, more before the holidays.
  if (weekday !== 0) {
    const count = 3 + Math.floor(roll(4) * 3) + (month === 12 ? 2 : 0);
    for (let n = 0; n < count; n++) {
      visits.push({ kind: "parcel", minute: 9 * 60 + Math.floor(roll(10 + n) * 9 * 60) });
    }
    // And the post, once, around the middle of the day.
    visits.push({ kind: "mail", minute: 10 * 60 + 30 + Math.floor(roll(5) * 210) });
  }
  // Ice cream: summer afternoons and evenings, when it is warm and dry.
  if (month >= 5 && month <= 9 && tempC >= 20 && !wet) {
    const count = 1 + Math.floor(roll(6) * 3);
    for (let n = 0; n < count; n++) {
      visits.push({ kind: "icecream", minute: 13 * 60 + 30 + Math.floor(roll(20 + n) * 6.5 * 60) });
    }
  }
  return visits.sort((a, b) => a.minute - b.minute);
}

/** How much more than usual people are ordering in: lunch and dinner bring the couriers out. */
export function mealtime(hour: number): number {
  const peak = (at: number, wide: number) => Math.max(0, 1 - Math.abs(hour - at) / wide);
  return Math.max(peak(12.75, 1.5), peak(19.25, 2));
}

// ---------------------------------------------------------------- the calendar

export interface Season {
  /** Christmas lights are up: from the first of December to Epiphany. */
  christmas: boolean;
  /** Pumpkins on the steps: the second week of October to just after Halloween. */
  pumpkins: boolean;
}

export function calendarOf(now: BrooklynDay): Season {
  const { month, day } = now;
  return {
    christmas: month === 12 || (month === 1 && day <= 6),
    pumpkins: (month === 10 && day >= 8) || (month === 11 && day <= 2),
  };
}

/**
 * Whether there are fireworks: half an hour after dark on the Fourth of
 * July, and for the first twelve minutes of the year.
 */
export function fireworksAt(now: BrooklynDay): boolean {
  if (now.month === 7 && now.day === 4) return now.hour >= 21 + 25 / 60 && now.hour < 21 + 55 / 60;
  return now.month === 1 && now.day === 1 && now.hour < 0.2;
}

// --------------------------------------------------------------------- wind

export interface Wind {
  /** How hard it blows, 0 still to 1 a gale. */
  strength: number;
  /** Which way things are carried across the picture: -1 hard left to 1 hard right. */
  push: number;
}

/**
 * The wind as the scene feels it. `fromDegrees` is where it blows from, as
 * forecasts give it (270 is a west wind). The picture looks north-west across
 * the river, near enough, so a west wind carries things to the right.
 */
export function windOf(kph: number | null, fromDegrees: number | null): Wind {
  const strength = Math.min(1, Math.max(0, (kph ?? 10) / 45));
  const toward = (((fromDegrees ?? 270) + 180) * Math.PI) / 180;
  return { strength, push: Math.sin(toward) * strength };
}

/** No wind to speak of: a light air from the west. */
export const LIGHT_AIR: Wind = windOf(10, 270);
