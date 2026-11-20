import { BROOKLYN } from "./daylight";

/**
 * Which windows have a light on.
 *
 * The pictures of the city show every window dark. This decides, for a
 * given moment, which of them are lit, from who is behind each one:
 *
 *  - An office floor is lit while it is staffed and goes dark when it
 *    empties, a floor at a time, mostly between six and nine in the
 *    evening. One window in thirty or so stays on for somebody working
 *    late. The lobby stays lit, and so does the odd floor that never
 *    sleeps. On a working night the cleaners go up the building floor by
 *    floor, each floor lit for as long as they are on it. At the weekend
 *    most of it never comes on.
 *  - A flat lights up as it gets dark and its people get home, and goes
 *    dark when they go to bed: most around eleven, later before a day off,
 *    a few night owls, one or two up till morning. Now and then somebody
 *    gets up in the night and a light is on for ten minutes. Before dawn
 *    the early risers put theirs on.
 *
 * Everything is worked out from the night it is, so the same windows are lit
 * if you look away and back, and a different city is lit tomorrow. Nothing
 * here is random at the moment of asking, which also makes it testable.
 */

/** A layer's windows, as scripts/make-art.mjs writes them. */
export interface WindowSet {
  /** Five numbers a window: x, y, width, height, building. */
  readonly at: readonly number[];
  /** A letter for each building: "o" offices, "f" flats. */
  readonly kinds: string;
}

/** A moment, as the windows live by it. */
export interface Night {
  /** Which night this is: a count of days, changing at noon rather than midnight. */
  id: number;
  /** Hours since that noon: 0 at midday, 12 at midnight, 15 at three in the morning. */
  n: number;
  /** The day that noon belongs to is a working day (Monday to Friday). */
  worked: boolean;
  /** Tomorrow is a working day: people go to bed on time, and offices open in the morning. */
  workTomorrow: boolean;
  /** How dark it is out, 0 broad daylight to 1 night. Nobody has a light on that cannot be seen. */
  dark: number;
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BROOKLYN.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The night a moment belongs to, by the clock in Brooklyn. */
export function nightAt(ms: number, dark: number): Night {
  const p = Object.fromEntries(partsFormat.formatToParts(ms).map((x) => [x.type, x.value]));
  const hour = (Number(p.hour) % 24) + Number(p.minute) / 60;
  // The calendar day in Brooklyn, as a count of days; before noon belongs to the day before.
  const day = Math.round(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000);
  const id = hour < 12 ? day - 1 : day;
  const weekday = (((id + 4) % 7) + 7) % 7; // 1 January 1970 was a Thursday
  return {
    id,
    n: hour < 12 ? hour + 12 : hour - 12,
    worked: weekday >= 1 && weekday <= 5,
    workTomorrow: weekday <= 4, // Sunday to Thursday
    dark: Math.min(1, Math.max(0, dark)),
  };
}

/** A repeatable number in [0, 1) for three whole numbers. */
function roll(a: number, b: number, c: number): number {
  let t =
    (Math.imul(a | 0, 0x9e3779b1) ^
      Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^
      Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35)) >>>
    0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A layer's windows laid out for asking about: who is in which building, on which floor. */
export interface Prepared {
  count: number;
  x: Int16Array;
  y: Int16Array;
  w: Int16Array;
  h: Int16Array;
  building: Int16Array;
  office: Uint8Array;
  /** The floor a window is on, counted up from the lowest one in its building. */
  floor: Int16Array;
  /** How many floors each building has. */
  floors: Int16Array;
}

export function prepare(set: WindowSet): Prepared {
  const count = Math.floor(set.at.length / 5);
  const out: Prepared = {
    count,
    x: new Int16Array(count),
    y: new Int16Array(count),
    w: new Int16Array(count),
    h: new Int16Array(count),
    building: new Int16Array(count),
    office: new Uint8Array(count),
    floor: new Int16Array(count),
    floors: new Int16Array(set.kinds.length),
  };
  const rows: Set<number>[] = Array.from({ length: set.kinds.length }, () => new Set());
  for (let i = 0; i < count; i++) {
    out.x[i] = set.at[i * 5]!;
    out.y[i] = set.at[i * 5 + 1]!;
    out.w[i] = set.at[i * 5 + 2]!;
    out.h[i] = set.at[i * 5 + 3]!;
    const b = set.at[i * 5 + 4]!;
    out.building[i] = b;
    out.office[i] = set.kinds[b] === "o" ? 1 : 0;
    rows[b]?.add(out.y[i]!);
  }
  // Floors count up from the street: the largest y in a building is its ground floor.
  const order = rows.map((set) => [...set].sort((a, b) => b - a));
  order.forEach((list, b) => (out.floors[b] = list.length));
  for (let i = 0; i < count; i++) {
    out.floor[i] = order[out.building[i]!]!.indexOf(out.y[i]!);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function officeLit(p: Prepared, i: number, night: Night, salt: number): boolean {
  const b = p.building[i]!;
  const f = p.floor[i]!;
  const floors = p.floors[b]!;
  const win = (k: number) => roll(night.id, salt * 131 + 50 + k, i);
  const flr = (k: number) => roll(night.id, salt * 977 + b * 31 + k, f);
  if (night.dark < 0.25 + 0.2 * win(6)) return false;

  // The lobby, and the odd floor that never sleeps.
  if (f === 0 && win(4) < 0.75) return true;
  if (flr(3) < 0.04 && win(4) < 0.6) return true;

  // A desk somebody uses, lit while its floor is staffed.
  const desk = win(1) < 0.8;
  const empties = night.worked
    ? flr(1) < 0.08
      ? 11 + flr(2) * 2.5 // a floor that works late
      : 5.8 + flr(2) * flr(2) * 3.4 // home between about six and nine
    : flr(1) < 0.12
      ? 5 + flr(2) * 3 // somebody came in at the weekend
      : -1;
  if (desk && night.n < empties) return true;
  // The morning after: the floor fills again.
  if (desk && night.workTomorrow && night.n >= 19.3 + flr(4) * 1.6) return true;

  // Somebody working late, on their own.
  if (win(2) < (night.worked ? 0.03 : 0.006) && night.n < 10 + win(3) * 4.5) return true;

  // The cleaners, going up the building a floor at a time.
  if (night.worked && floors >= 5) {
    const start = 8 + roll(night.id, salt * 613 + 1, b) * 2.2;
    const each = clamp(5 / floors, 0.1, 0.33);
    const at = (night.n - start) / each;
    if (at >= f && at < f + 1 && win(5) < 0.85) return true;
  }
  return false;
}

function flatLit(i: number, night: Night, salt: number): boolean {
  const u = (k: number) => roll(night.id, salt * 131 + k, i);
  const free = !night.workTomorrow;
  const dark = night.dark >= 0.3 + 0.45 * u(3);

  // Up in the night for ten minutes.
  if (night.dark > 0.6 && roll(night.id * 144 + Math.floor(night.n * 6), salt + 7, i) < 0.0035) {
    return true;
  }
  if (!dark) return false;

  // An early riser, lit from when they get up until it is light.
  if (u(10) < (free ? 0.1 : 0.28) && night.n >= 17 + u(11) * 2.3 + (free ? 1.5 : 0)) return true;

  // Somebody is in tonight, and this is a room they use.
  if (u(1) >= (free ? 0.72 : 0.84) || u(2) >= 0.62) return false;
  const arrives = u(4) < 0.3 ? 0 : 4.5 + u(5) * 4;
  const owl = u(6);
  const bed =
    owl < 0.025
      ? 24 // up all night
      : owl < 0.08
        ? 14 + u(7) * 2.5 // a night owl: two to half past four
        : 11.2 + (free ? 1.1 : 0) + (u(7) + u(8) + u(9) - 1.5) * 1.7;
  return night.n >= arrives && night.n < bed;
}

/**
 * Which of a layer's windows are lit at a moment: one byte a window, 1 for
 * lit. `salt` keeps one layer's nights apart from another's.
 */
export function litWindows(p: Prepared, night: Night, salt = 0): Uint8Array {
  const lit = new Uint8Array(p.count);
  if (night.dark <= 0.2) return lit; // broad daylight: nothing shows
  for (let i = 0; i < p.count; i++) {
    lit[i] = (p.office[i] ? officeLit(p, i, night, salt) : flatLit(i, night, salt)) ? 1 : 0;
  }
  return lit;
}

/** How dark it is out, from how high the sun is and how covered the sky: 0 day, 1 night. */
export function darkness(sunElevation: number, grey = 0): number {
  const bySun = clamp((6 - sunElevation) / 12, 0, 1);
  // Under a heavy sky lights come on in the afternoon, though it never counts as night.
  return Math.max(bySun, clamp(grey, 0, 1) * 0.55);
}

/** How strongly lit windows show, for how dark it is: nothing at midday, everything by dusk. */
export function glowFor(dark: number): number {
  return clamp((dark - 0.15) / 0.45, 0, 1);
}
