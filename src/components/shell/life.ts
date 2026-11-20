/**
 * Who is out on the street, and what they do there.
 *
 * This file decides; it draws nothing. It casts a "party" (someone alone, a
 * couple, a dog and its walker, a runner, a parent with a pram, a group of
 * friends) and writes its script: walk here, wait a while, walk on. The
 * backdrop plays the script with CSS transitions, so there is no per-frame
 * work in script at all, only a decision every second or so about whether
 * somebody new should turn up.
 *
 * All distances are pixels of the 640x360 scene.
 */

/** How the sprite sheets are cut up. Mirrors PEOPLE in art/index.ts. */
export interface LifeMeta {
  frames: number;
  walkFrames: number;
  person: { w: number; h: number; rows: number };
  prop: { w: number; h: number; rows: number };
  /** Anyone on wheels or with a ball: cyclists, skaters, kids dribbling. */
  wheel: { w: number; h: number; rows: number };
  /** [first row, count] for each kind of character; single rows for the props. */
  cast: {
    cyclists: readonly [number, number];
    skaters: readonly [number, number];
    ballers: readonly [number, number];
    adults: readonly [number, number];
    children: readonly [number, number];
    runners: readonly [number, number];
    dogs: readonly [number, number];
    pram: number;
    lead: number;
    /** People living rough, and what they have with them: a cart of cans, a bedroll. */
    rough?: readonly [number, number];
    cart?: number;
    bundle?: number;
  };
}

/** Where a scene lets people be. A scene has a pavement or roofs, not both. */
export interface LifeConfig {
  kind: string;
  /** Pavement: the rows feet may fall on, nearest the viewer and farthest. */
  near: number;
  far: number;
  /** Pavement: where people come into the picture and where they leave it. */
  from: number;
  to: number;
  /** The row cyclists' wheels run on, out in the road. 0 where there is no road. */
  road: number;
  /** Things a dog stops at, and places people tend to stop, by x. */
  sniff: readonly number[];
  linger: readonly number[];
  roofs: readonly { x: number; w: number; top: number }[];
  /** Doorsteps to sit on: the middle of each, and the row its bottom step is on. */
  stoops: readonly { x: number; y: number }[];
  /** Stretches of empty kerb where a cab can be flagged down, by x. */
  hail: readonly number[];
  /** The cab: its size, the row it drives on and the row it stops on. Null where no cab comes. */
  cab: { w: number; h: number; lane: number; kerb: number } | null;
  /** The police car that comes by now and then: its size, its row, and where its light bar is. */
  patrol?: {
    w: number;
    h: number;
    lane: number;
    bar: { x: number; y: number; w: number; h: number };
  } | null;
}

export interface Member {
  sheet: "people" | "props" | "wheels";
  row: number;
  /** Left edge of the sprite's cell, from the party's middle, when facing right. */
  dx: number;
  /** Feet, relative to the party's line: negative is farther from the viewer. */
  dy: number;
  /** Seconds for one walk cycle, and how far into it this member starts (0-1). */
  cadence: number;
  phase: number;
  /** Seconds for one cycle of standing about. */
  idle: number;
  /**
   * Where this member goes when the party sits down, as a move from where
   * they stand. Members without one stay on their feet.
   */
  seat?: { dx: number; dy: number };
}

export type Step =
  | { kind: "walk"; to: number; seconds: number }
  | { kind: "wait"; seconds: number }
  /** Sitting on a doorstep: each member moves to their seat, and back when it ends. */
  | { kind: "sit"; seconds: number }
  /** At the kerb with an arm up, flagging down a cab. */
  | { kind: "hail"; seconds: number }
  /** Stopped, an arm in the air, holding forth to nobody. Facing whichever way they were going. */
  | { kind: "rant"; seconds: number }
  /** Off the kerb and into the cab: down `drop` rows, and out of sight behind it. */
  | { kind: "board"; drop: number; seconds: number }
  /** Roofs only: up through the hatch (0) or back down out of sight (`depth`). */
  | { kind: "climb"; to: number; seconds: number };

export interface Party {
  id: number;
  /** People in the party. Dogs and prams do not count. */
  heads: number;
  /** Index into the scene's roofs, or null on the pavement. */
  roof: number | null;
  /** Out in the road, past the parked cars, rather than on the pavement. */
  road: boolean;
  /** Here for a barbecue: sent home if the barbecue is called off. */
  guest?: boolean;
  /** Somebody sleeping out on a doorstep: there is never more than one. */
  sleeper?: boolean;
  /** Where the party's middle starts; feet row; how far below the roof line it starts. */
  x: number;
  y: number;
  lift: number;
  members: Member[];
  steps: Step[];
}

export type Rand = () => number;

/** Never more people than this in the picture, however large a group turns up. */
export const MAX_HEADS = 20;

const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a);
const whole = (rand: Rand, a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const row = (rand: Rand, [first, count]: readonly [number, number]) =>
  first + Math.floor(rand() * count);

/** A value read off a line drawn through points [x, y], x ascending. Flat beyond the ends. */
function along(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0]!;
  const last = points.at(-1)!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/**
 * How busy a residential block in Brooklyn is through a working day, by the
 * hour: 1 is an ordinary busy pavement. Dead in the small hours, a rush to
 * school and the subway, a lull while everyone is at work, lunch, school
 * letting out, the walk home (the busiest it gets), and a slow evening.
 */
const WORKDAY: readonly (readonly [number, number])[] = [
  [0, 0.14],
  [2, 0.06],
  [4.5, 0.05],
  [5.5, 0.22],
  [7, 0.8],
  [8.5, 1.05],
  [9.5, 0.6],
  [11.5, 0.5],
  [12.5, 0.8],
  [14, 0.6],
  [15.25, 0.95],
  [16.5, 0.9],
  [18, 1.25],
  [19.5, 1.0],
  [21, 0.7],
  [22.5, 0.4],
  [24, 0.14],
];

/** The same block on a day off: a late start, a long full afternoon, a later night. */
const DAY_OFF: readonly (readonly [number, number])[] = [
  [0, 0.4],
  [2, 0.18],
  [4.5, 0.06],
  [7, 0.2],
  [9, 0.6],
  [11, 1.05],
  [15, 1.2],
  [18, 1.05],
  [21, 0.8],
  [24, 0.4],
];

/** What the cold and the heat do to it: full between a mild day and a warm one. */
const BY_TEMPERATURE: readonly (readonly [number, number])[] = [
  [-12, 0.3],
  [-4, 0.45],
  [3, 0.65],
  [10, 0.88],
  [16, 1],
  [28, 1],
  [33, 0.8],
  [38, 0.55],
];

/**
 * How busy the pavement should be, as New York does it: by the hour and the
 * day of the week, by how cold or hot it is, and by the weather.
 *
 * `hour` is the time of day in Brooklyn, 0 to 24, fractions and all;
 * `weekday` counts from Sunday as 0; `tempC` is the temperature, or null when
 * it is not known; `shelter` is how much the weather keeps people in (0 to 1).
 * The answer is around 1 for an ordinary busy hour and near 0 at four in the
 * morning in January.
 */
export function bustleAt(hour: number, weekday: number, tempC: number | null, shelter = 0): number {
  const h = ((hour % 24) + 24) % 24;
  const off = weekday === 0 || weekday === 6;
  let level = along(off ? DAY_OFF : WORKDAY, h);
  // Friday night runs late, like the night before any day off; Sunday night does not.
  if (weekday === 5 && h >= 19) level = Math.max(level, along(DAY_OFF, h));
  if (weekday === 0 && h >= 19) level = Math.min(level, along(WORKDAY, h));
  const weather = 1 - 0.8 * Math.min(1, Math.max(0, shelter));
  return level * (tempC === null ? 1 : along(BY_TEMPERATURE, tempC)) * weather;
}

/** How much traffic a working day has, by the hour: 1 is the rush. It never quite stops. */
const TRAFFIC_WORKDAY: readonly (readonly [number, number])[] = [
  [0, 0.28],
  [2, 0.14],
  [4.5, 0.12],
  [5.5, 0.3],
  [7, 0.85],
  [8.5, 1],
  [10, 0.72],
  [15, 0.75],
  [16.5, 1],
  [18.5, 1],
  [20, 0.7],
  [22, 0.5],
  [24, 0.28],
];

/** And a day off: no rush, a steady afternoon, more about late at night. */
const TRAFFIC_DAY_OFF: readonly (readonly [number, number])[] = [
  [0, 0.42],
  [2.5, 0.22],
  [5, 0.12],
  [8, 0.35],
  [11, 0.75],
  [14, 0.85],
  [19, 0.8],
  [22, 0.6],
  [24, 0.42],
];

/**
 * How much traffic is on the road, from 0 (none) to 1 (all of it): the rush
 * hours full, the middle of the day steady, and at three in the morning the
 * odd cab. Bad weather takes a little off; it does not empty the road the
 * way it empties the pavement.
 */
export function trafficAt(hour: number, weekday: number, shelter = 0): number {
  const h = ((hour % 24) + 24) % 24;
  const off = weekday === 0 || weekday === 6;
  let level = along(off ? TRAFFIC_DAY_OFF : TRAFFIC_WORKDAY, h);
  if (weekday === 5 && h >= 19) level = Math.max(level, along(TRAFFIC_DAY_OFF, h));
  if (weekday === 0 && h >= 19) level = Math.min(level, along(TRAFFIC_WORKDAY, h));
  return level * (1 - 0.3 * Math.min(1, Math.max(0, shelter)));
}

/**
 * How far into the night the windows are, on a clock that runs from the
 * evening through to the morning (21 is nine at night, 26 is two in the
 * morning). 0: an evening, everyone's lights on. 1: the small hours, a few
 * left. It comes back down before dawn as the early risers get up.
 */
const LATE_WORKNIGHT: readonly (readonly [number, number])[] = [
  [21, 0],
  [22.5, 0.2],
  [24, 0.55],
  [25.5, 0.85],
  [26.5, 1],
  [28.5, 1],
  [29.5, 0.8],
  [30.5, 0.5],
  [31.5, 0.2],
  [32, 0],
];

/** The night before a day off: later to bed, later to rise. */
const LATE_FREE_NIGHT: readonly (readonly [number, number])[] = [
  [22, 0],
  [23.5, 0.18],
  [25, 0.45],
  [26.5, 0.78],
  [27.5, 1],
  [30, 1],
  [31.5, 0.75],
  [33, 0.4],
  [34, 0.15],
  [34.5, 0],
];

/**
 * How many of the city's windows have gone dark: 0 on an evening, 1 in the
 * small hours. Friday and Saturday nights run later.
 */
export function lateAt(hour: number, weekday: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Before noon belongs to the night that began the evening before.
  const evening = h < 12 ? (weekday + 6) % 7 : weekday;
  const free = evening === 5 || evening === 6;
  return along(free ? LATE_FREE_NIGHT : LATE_WORKNIGHT, h < 12 ? h + 24 : h);
}

/**
 * Whether a thing with this place in the order (a number from 0 to 1, fixed
 * for each vehicle) is out when traffic is at `level`. At 1 everything is.
 */
export function onTheRoad(place: number, level: number): boolean {
  return place < level;
}

/** A fixed place in the order, from 0 to 1, for the `n`th thing of the `group`th set. */
export function placeOf(group: number, n: number): number {
  let t = (Math.imul(group + 1, 0x9e3779b1) ^ Math.imul(n + 0x51ed270b, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Whether it is an hour at which children, prams and ball games are off the street. */
export function pastBedtime(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 21.5 || h < 6.5;
}

/**
 * How many people the street should have on it just now: three to five on an
 * ordinary busy pavement, scaled by how busy it is. A fraction of a person
 * is a chance of one, so a quiet street is sometimes empty and sometimes not.
 */
export function wantedHeads(rand: Rand, bustle: number): number {
  const exact = whole(rand, 3, 5) * Math.max(0, bustle);
  return Math.floor(exact) + (rand() < exact - Math.floor(exact) ? 1 : 0);
}

// ---------------------------------------------------------------- formations

type Kind =
  | "solo"
  | "couple"
  | "dog"
  | "runner"
  | "child"
  | "pram"
  | "friends"
  | "cyclist"
  | "skater"
  | "baller"
  /** Somebody pushing a cart of cans and bottles to the redemption centre. */
  | "canner"
  /** Somebody walking up and down, stopping to hold forth to nobody. */
  | "pacer";

/** How often each kind of party turns up on the street. */
const STREET_MIX: readonly [Kind, number][] = [
  ["solo", 0.3],
  ["couple", 0.15],
  ["dog", 0.15],
  ["cyclist", 0.11],
  ["runner", 0.06],
  ["child", 0.06],
  ["friends", 0.06],
  ["pram", 0.04],
  ["skater", 0.035],
  ["baller", 0.035],
  // Part of any New York street, and not often.
  ["canner", 0.022],
  ["pacer", 0.014],
];

function pickKind(rand: Rand, mix: readonly [Kind, number][], room: number): Kind {
  let roll = rand() * mix.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [kind, weight] of mix) {
    roll -= weight;
    if (roll <= 0) return room >= headsOf(kind) ? kind : "solo";
  }
  return "solo";
}

function headsOf(kind: Kind): number {
  return kind === "couple" || kind === "child" ? 2 : kind === "friends" ? 3 : 1;
}

interface Formation {
  heads: number;
  /** Pixels a second. */
  speed: number;
  members: Member[];
  /** Half the formation's width, so it can start and finish wholly out of sight. */
  reach: number;
  dog: boolean;
}

/** A person's stride covers about this many pixels per walk cycle. */
const STRIDE = { adult: 8, child: 5.5, runner: 13, dog: 6 };
/** Seconds for one turn of the pedals, one kick of a skateboard, one bounce of a ball. */
const TEMPO = { cyclist: 0.55, skater: 1.3, baller: 0.62 };

function form(rand: Rand, meta: LifeMeta, kind: Kind, size = 0): Formation {
  const { cast, person, prop } = meta;
  const members: Member[] = [];
  /** Pixels covered per walk cycle, per member. Nothing for a pram or a lead. */
  const strides = new Map<Member, number>();
  let speed = between(rand, 7.5, 10);
  const add = (
    sheet: Member["sheet"],
    sprite: number,
    dx: number,
    dy: number,
    stride: number,
  ): void => {
    const member: Member = {
      sheet,
      row: sprite,
      dx,
      dy,
      cadence: 1, // settled below, once the speed is known
      phase: rand(),
      idle: between(rand, 1.4, 2.6),
    };
    strides.set(member, stride);
    members.push(member);
  };
  const adult = (dx: number, dy = 0) => add("people", row(rand, cast.adults), dx, dy, STRIDE.adult);
  const child = (dx: number, dy = 0) =>
    add("people", row(rand, cast.children), dx, dy, STRIDE.child);
  const dogAhead = (dx: number, lead: boolean) => {
    const sprite = row(rand, cast.dogs);
    const big = sprite - cast.dogs[0] >= cast.dogs[1] / 2;
    // The lead runs from the walker's hand to the dog's collar.
    if (lead) add("props", cast.lead, dx + 6, 0, 0);
    add("props", sprite, dx + (big ? 8 : 10) + (lead ? 0 : 2), 0, STRIDE.dog);
  };
  /** Somebody living rough: one of their own rows, or any adult where a sheet has none. */
  const rough = (dx: number) =>
    add("people", row(rand, cast.rough ?? cast.adults), dx, 0, STRIDE.adult);
  let dog = false;
  let heads = 1;

  switch (kind) {
    case "canner":
      rough(0);
      add("props", cast.cart ?? cast.pram, 6, 0, 0);
      speed = between(rand, 3.4, 4.6); // a full cart is heavy
      break;
    case "pacer":
      rough(0);
      speed = between(rand, 7, 10);
      break;
    case "solo":
      adult(0);
      break;
    case "runner":
      add("people", row(rand, cast.runners), 0, 0, STRIDE.runner);
      speed = between(rand, 17, 21);
      break;
    case "cyclist":
      add("wheels", row(rand, cast.cyclists), 0, 0, 0);
      speed = between(rand, 27, 36);
      members[0]!.cadence = TEMPO.cyclist;
      break;
    case "skater":
      add("wheels", row(rand, cast.skaters), 0, 0, 0);
      speed = between(rand, 13, 17);
      members[0]!.cadence = TEMPO.skater;
      break;
    case "baller":
      add("wheels", row(rand, cast.ballers), 0, 0, 0);
      speed = between(rand, 5.5, 7);
      members[0]!.cadence = TEMPO.baller;
      // the ball keeps time whether they are walking or not
      members[0]!.idle = TEMPO.baller;
      break;
    case "couple":
      adult(0, -1);
      adult(6, 0);
      heads = 2;
      speed = between(rand, 6.5, 8.5);
      break;
    case "dog":
      adult(0);
      dogAhead(0, true);
      dog = true;
      speed = between(rand, 7, 9.5);
      break;
    case "child":
      adult(0, -1);
      child(rand() < 0.5 ? 6 : -5, 0);
      heads = 2;
      speed = between(rand, 5.5, 7);
      break;
    case "pram":
      adult(0);
      add("props", cast.pram, 6, 0, 0);
      speed = between(rand, 6, 7.5);
      break;
    case "friends": {
      // People walking together: loosely abreast, a child or a dog among the larger groups.
      heads = Math.max(3, size);
      speed = between(rand, 5.5, 7.5);
      let x = 0;
      for (let n = 0; n < heads; n++) {
        const small = heads > 3 && rand() < 0.12;
        (small ? child : adult)(x, -whole(rand, 0, 3));
        x += between(rand, 4, 7.5);
      }
      if (heads > 4 && rand() < 0.35) {
        dogAhead(x - 6, false);
        dog = true;
      }
      break;
    }
  }

  // Centre the formation on the party's middle.
  const widthOf = (m: Member) =>
    m.sheet === "people" ? person.w : m.sheet === "props" ? prop.w : meta.wheel.w;
  const left = Math.min(...members.map((m) => m.dx));
  const right = Math.max(...members.map((m) => m.dx + widthOf(m)));
  const middle = (left + right) / 2;
  for (const m of members) {
    const stride = strides.get(m) ?? 0;
    m.dx = Math.round((m.dx - middle) * 10) / 10;
    // Feet land where the ground is: a longer stride or a slower walk means a slower cycle.
    if (stride) m.cadence = Math.round((stride / speed) * 100) / 100;
  }
  // The nearest are drawn last.
  members.sort((a, b) => a.dy - b.dy);
  return { heads, speed, members, reach: (right - left) / 2, dog };
}

// ---------------------------------------------------------------- the pavement

export interface CastOptions {
  /** Start somewhere along the pavement instead of at its end (for filling an empty street). */
  midway?: boolean;
  /** A group of this many friends instead of the usual mix. */
  group?: number;
  /** No more people than this. */
  room?: number;
  /** Already sitting on a doorstep when first seen. */
  seated?: boolean;
  /** Past bedtime: no children, prams or ball games; whoever would have been is somebody alone. */
  late?: boolean;
  /** Too cold or too wet to sit out: nobody stops on a doorstep. */
  noSitting?: boolean;
  /** Send exactly this kind of party, whatever the mix says. For previews and tests. */
  only?: string;
}

/** Places on a doorstep, from its middle: how far across, and how many steps up. */
const SEATS: readonly { dx: number; up: number }[] = [
  { dx: 0, up: 1 },
  { dx: -5, up: 0 },
  { dx: 5, up: 0 },
  { dx: -3, up: 2 },
  { dx: 3, up: 2 },
  { dx: 0, up: 3 },
];

/** How likely each kind of party is to sit down on a doorstep it passes. */
const SITS: Partial<Record<Kind, number>> = {
  solo: 0.14,
  couple: 0.22,
  child: 0.15,
  dog: 0.12,
  friends: 0.5,
};

/**
 * Gives each person in a party a seat on the doorstep at `stoop`, measured
 * from where the party stands (its middle at the doorstep's, its feet on row
 * `y`). The farthest sit highest, so nobody sits in front of somebody else's
 * face. More people than seats: the rest stay standing. Dogs lie down where
 * they are.
 */
function seatMembers(
  members: Member[],
  meta: LifeMeta,
  stoop: { x: number; y: number },
  y: number,
): void {
  const sitters = members.filter((m) => m.sheet === "people");
  const seats = SEATS.slice(0, sitters.length).sort((a, b) => b.up - a.up);
  [...sitters]
    .sort((a, b) => a.dy - b.dy)
    .forEach((member, index) => {
      const seat = seats[index];
      if (!seat) return;
      // The figure stands a little right of its cell's middle.
      const left = seat.dx - Math.floor(meta.person.w / 2) - 1;
      member.seat = { dx: left - member.dx, dy: stoop.y - seat.up * 2 - (y + member.dy) };
    });
  for (const member of members) {
    const isDog = member.sheet === "props" && member.row < meta.cast.dogs[0] + meta.cast.dogs[1];
    if (isDog) member.seat = { dx: 0, dy: 0 };
  }
}

let serial = 0;
/** Ids only have to be unique among the parties alive at one time. */
const nextId = () => (serial = (serial + 1) % 1_000_000);

/** Someone to walk the length of the pavement, perhaps stopping on the way. */
export function castWalkers(
  rand: Rand,
  meta: LifeMeta,
  life: LifeConfig,
  options: CastOptions = {},
): Party {
  const room = options.room ?? MAX_HEADS;
  let kind: Kind = options.group ? "friends" : pickKind(rand, STREET_MIX, room);
  if (options.only && STREET_MIX.some(([name]) => name === options.only)) {
    kind = options.only as Kind;
  }
  if (kind === "cyclist" && !life.road) kind = "solo";
  if (options.late && ["child", "pram", "baller", "skater"].includes(kind)) kind = "solo";
  // The ones found sitting on a doorstep are neighbours, alone or in company.
  if (options.seated) {
    kind = pick(rand, room >= 3 ? ["solo", "couple", "solo", "friends"] : ["solo"]);
  }
  const shape = form(rand, meta, kind, Math.min(options.group ?? 0, room));
  const rightward = rand() < 0.5;
  const start = (rightward ? life.from : life.to) + (rightward ? -1 : 1) * shape.reach;
  const end = (rightward ? life.to : life.from) + (rightward ? 1 : -1) * shape.reach;
  const x = options.midway ? between(rand, life.from + 40, life.to - 40) : start;

  if (kind === "pacer") {
    // Up the street in fits and starts: a stretch forward, a stop to say their
    // piece, a few steps back the way they came, and on again.
    const steps: Step[] = [];
    const way = rightward ? 1 : -1;
    let at = x;
    const walk = (to: number) => {
      steps.push({ kind: "walk", to, seconds: Math.abs(to - at) / shape.speed });
      at = to;
    };
    for (let n = 0; n < 12 && (end - at) * way > 90; n++) {
      walk(at + way * between(rand, 40, 110));
      steps.push({ kind: "rant", seconds: between(rand, 2.5, 6) });
      if (rand() < 0.65) {
        walk(at - way * between(rand, 14, 45));
        steps.push({ kind: rand() < 0.5 ? "rant" : "wait", seconds: between(rand, 1.5, 4) });
      }
    }
    walk(end);
    return {
      id: nextId(),
      heads: 1,
      roof: null,
      road: false,
      x,
      y: whole(rand, life.far + 3, life.near),
      lift: 0,
      members: shape.members,
      steps,
    };
  }

  // Stops along the way, in the order they will be reached.
  const stops: number[] = [];
  const hurried = kind === "runner" || kind === "cyclist" || kind === "skater";
  const pauses = hurried
    ? 0
    : shape.dog || kind === "baller" || kind === "canner"
      ? 0.6
      : kind === "friends"
        ? 0.5
        : 0.3;
  if (rand() < pauses) {
    const spots = shape.dog ? life.sniff : life.linger;
    const ahead = spots.filter((spot) => (rightward ? spot > x + 12 : spot < x - 12));
    const count = ahead.length > 1 && rand() < 0.3 ? 2 : 1;
    for (let n = 0; n < count; n++) {
      // A dog stops at trees; a person might stop anywhere at all.
      const anywhere = between(rand, Math.min(x, end) + 20, Math.max(x, end) - 20);
      const spot = ahead.length && (shape.dog || rand() < 0.6) ? pick(rand, ahead) : anywhere;
      if ((rightward ? spot > x + 12 : spot < x - 12) && !stops.includes(spot)) stops.push(spot);
    }
    stops.sort((a, b) => (rightward ? a - b : b - a));
  }

  // The party's line: its nearest member's feet. Cyclists keep to the road instead.
  const y =
    kind === "cyclist" ? life.road + whole(rand, -1, 1) : whole(rand, life.far + 3, life.near);

  const steps: Step[] = [];
  let at = x;
  const walkTo = (to: number) => {
    steps.push({ kind: "walk", to, seconds: Math.abs(to - at) / shape.speed });
    at = to;
  };
  // A doorstep on the way, for those inclined to sit down on one.
  const ahead = life.stoops.filter((stoop) =>
    rightward ? stoop.x > x + 16 && stoop.x < end - 30 : stoop.x < x - 16 && stoop.x > end + 30,
  );
  const sits = options.noSitting ? 0 : (SITS[kind] ?? 0);
  const sitting = options.seated ? life.stoops : rand() < sits ? ahead : [];
  if (sitting.length > 0) {
    const stoop = pick(rand, sitting);
    seatMembers(shape.members, meta, stoop, y);
    const long = kind === "friends" ? between(rand, 45, 160) : between(rand, 25, 90);
    if (options.seated) at = stoop.x;
    else walkTo(stoop.x);
    steps.push({ kind: "sit", seconds: long });
    stops.length = 0; // one stop is enough for one walk
  }
  const startX = options.seated && sitting.length > 0 ? at : x;
  for (const stop of stops) {
    // A dog walker stops with the dog's nose, not their own feet, at the tree.
    walkTo(shape.dog ? stop + (rightward ? -1 : 1) * (shape.reach - 2) : stop);
    steps.push({ kind: "wait", seconds: between(rand, 3, kind === "friends" ? 14 : 9) });
  }
  walkTo(end);

  return {
    id: nextId(),
    heads: shape.heads,
    roof: null,
    road: kind === "cyclist",
    x: startX,
    y,
    lift: 0,
    members: shape.members,
    steps,
  };
}

// ---------------------------------------------------------------- hailing a cab

/** A cab answering a hail: when it sets off, where it stops, when it pulls away. Seconds from now. */
export interface CabRide {
  id: number;
  /** Left edge of the cab where it stops. */
  stopX: number;
  /** When it starts in from the edge of the picture, and how long the run-in takes. */
  arriveAt: number;
  arriveFor: number;
  /** When it pulls away with its fare. */
  leaveAt: number;
}

/**
 * Somebody sleeping out: sitting on a doorstep with what they own beside
 * them, for a good while, then up and away down the street. Null where
 * there are no doorsteps.
 */
export function castSleeper(rand: Rand, meta: LifeMeta, life: LifeConfig): Party | null {
  if (life.stoops.length === 0) return null;
  const { cast, person } = meta;
  const stoop = pick(rand, life.stoops);
  const y = life.far + 3;
  const speed = between(rand, 4.5, 6);
  const rightward = rand() < 0.5;
  const end = rightward ? life.to + 12 : life.from - 12;
  const sitter: Member = {
    sheet: "people",
    row: row(rand, cast.rough ?? cast.adults),
    dx: -Math.floor(person.w / 2),
    dy: 0,
    cadence: STRIDE.adult / speed,
    phase: rand(),
    idle: between(rand, 2.2, 3.4),
  };
  const members = [sitter];
  if (cast.bundle !== undefined) {
    // Their things, on the pavement by the step. Left where they are while the owner sits.
    members.push({
      sheet: "props",
      row: cast.bundle,
      dx: 3,
      dy: 0,
      cadence: 1,
      phase: 0,
      idle: 60,
    });
  }
  seatMembers(members, meta, stoop, y);
  return {
    id: nextId(),
    heads: 1,
    roof: null,
    road: false,
    sleeper: true,
    x: stoop.x,
    y,
    lift: 0,
    members,
    steps: [
      { kind: "sit", seconds: between(rand, 8 * 60, 22 * 60) },
      { kind: "walk", to: end, seconds: Math.abs(end - stoop.x) / speed },
    ],
  };
}

/** A police car going by: when it sets off is up to the street; this is how it goes. */
export interface Patrol {
  id: number;
  /** Seconds to cross the picture. */
  seconds: number;
  /** On a call: lights going, and in a hurry. */
  lights: boolean;
  /** Driving right to left instead. */
  leftward: boolean;
}

/** A police car's pass. Most are a slow patrol; one in five or so is on a call. */
export function castPatrol(rand: Rand): Patrol {
  const lights = rand() < 0.2;
  return {
    id: nextId(),
    lights,
    seconds: lights ? between(rand, 5, 7) : between(rand, 16, 24),
    leftward: false,
  };
}

/**
 * Someone who walks to an empty stretch of kerb, puts an arm up, and takes
 * the cab that pulls in. Returns the walker and the cab timed to meet them,
 * or null where there is no kerb to hail from.
 */
export function castCabRide(
  rand: Rand,
  meta: LifeMeta,
  life: LifeConfig,
): { party: Party; cab: CabRide } | null {
  if (!life.cab || life.hail.length === 0) return null;
  const spot = pick(rand, life.hail);
  const shape = form(rand, meta, "solo");
  // They come in from whichever end of the street is nearer the spot.
  const rightward = spot - life.from < life.to - spot;
  const start = (rightward ? life.from : life.to) + (rightward ? -1 : 1) * shape.reach;
  // At the kerb's edge, where a driver will see them.
  const y = life.near;
  const walk = Math.abs(spot - start) / shape.speed;
  const hail = between(rand, 5, 9);
  const arriveFor = 4.6;
  const board = 1.3;
  const id = nextId();
  return {
    party: {
      id,
      heads: 1,
      roof: null,
      road: false,
      x: start,
      y,
      lift: 0,
      members: shape.members,
      steps: [
        { kind: "walk", to: spot, seconds: walk },
        { kind: "hail", seconds: hail },
        // down off the kerb, to the cab's door
        { kind: "board", drop: life.cab.kerb - 3 - y, seconds: board },
      ],
    },
    cab: {
      id,
      stopX: Math.round(spot - life.cab.w / 2),
      // it pulls up just as the arm has been out long enough
      arriveAt: walk + hail - arriveFor,
      arriveFor,
      leaveAt: walk + hail + board + 0.4,
    },
  };
}

// ---------------------------------------------------------------- the roofs

/** How far below the roof line someone waits before coming up: a sprite and a bit. */
export const HATCH_DEPTH = 18;

const ROOF_MIX: readonly [Kind, number][] = [
  ["solo", 0.5],
  ["couple", 0.3],
  ["child", 0.1],
  ["friends", 0.1],
];

/**
 * Someone to come up onto a roof, wander over to look at the view, and go
 * back down. `delay` keeps them out of sight for a while first, so a
 * gathering can arrive a few at a time.
 */
export function castRoofVisit(
  rand: Rand,
  meta: LifeMeta,
  life: LifeConfig,
  options: {
    roof?: number;
    room?: number;
    delay?: number;
    stay?: number;
    /** How many spots they wander between. More, for a long stay. */
    visits?: number;
    guest?: boolean;
  } = {},
): Party | null {
  if (life.roofs.length === 0) return null;
  const index = options.roof ?? Math.floor(rand() * life.roofs.length);
  const roof = life.roofs[index];
  if (!roof) return null;
  const kind = pickKind(rand, ROOF_MIX, options.room ?? MAX_HEADS);
  const shape = form(rand, meta, kind, 3);
  const speed = shape.speed * 0.7; // nobody hurries up here
  for (const m of shape.members) m.cadence = Math.round((m.cadence / 0.7) * 100) / 100;

  // Positions are measured from the roof's left edge. Keep the whole party on it.
  const lo = shape.reach + 2;
  const hi = roof.w - shape.reach - 2;
  if (hi <= lo) return null;
  const clamp = (x: number) => Math.min(hi, Math.max(lo, x));
  const hatch = clamp(roof.w - 12);

  const steps: Step[] = [];
  if (options.delay) steps.push({ kind: "wait", seconds: options.delay });
  steps.push({ kind: "climb", to: 0, seconds: 1.6 });
  let at = hatch;
  const walkTo = (to: number) => {
    if (to === at) return;
    steps.push({ kind: "walk", to, seconds: Math.abs(to - at) / speed });
    at = to;
  };
  const visits = options.visits ?? whole(rand, 1, 3);
  for (let n = 0; n < visits; n++) {
    walkTo(clamp(between(rand, lo, hi)));
    steps.push({ kind: "wait", seconds: (options.stay ?? between(rand, 8, 30)) / visits });
  }
  walkTo(hatch);
  steps.push({ kind: "climb", to: HATCH_DEPTH, seconds: 1.6 });

  return {
    id: nextId(),
    heads: shape.heads,
    roof: index,
    road: false,
    ...(options.guest ? { guest: true } : {}),
    x: hatch,
    y: 0,
    lift: HATCH_DEPTH,
    // On a roof everybody stands on the one line.
    members: shape.members.map((m) => ({ ...m, dy: 0 })),
    steps,
  };
}

/** People who are simply there: for anyone who has asked for less motion. */
export function castStanding(rand: Rand, meta: LifeMeta, life: LifeConfig): Party | null {
  const party =
    life.kind === "roofs"
      ? castRoofVisit(rand, meta, life)
      : castWalkers(rand, meta, life, { midway: true });
  if (!party) return null;
  if (party.roof !== null) {
    const roof = life.roofs[party.roof]!;
    party.x = Math.min(roof.w - 8, Math.max(8, between(rand, 8, roof.w - 8)));
    party.lift = 0;
  }
  party.steps = [{ kind: "wait", seconds: Infinity }];
  return party;
}

// ---------------------------------------------------------------- a barbecue on a roof

export interface RoofParty {
  /** Index into the roofs that can hold one. */
  roof: number;
  startsAt: number;
  endsAt: number;
}

const SLOT_MS = 3 * 3_600_000;

/** A repeatable number in [0, 1) for a pair of integers. */
function chanceOf(a: number, b: number): number {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Whether somebody is having a barbecue on a roof at `ms`, and on which.
 *
 * It is decided by the clock, not by chance at the moment of asking: time is
 * cut into three-hour stretches, each of which has a little under an even
 * chance of holding one barbecue of fifty to seventy-five minutes, starting
 * between late morning and mid-evening. So a barbecue that is on stays on
 * across a reload, ends when it should, and can be found again by setting
 * the clock back. `salt` makes each scene keep its own diary.
 */
export function roofPartyAt(
  ms: number,
  salt: number,
  roofs: number,
  minuteOfDay: (ms: number) => number,
): RoofParty | null {
  if (roofs <= 0) return null;
  const slot = Math.floor(ms / SLOT_MS);
  // A barbecue that started late in the last stretch may still be going.
  for (const s of [slot, slot - 1]) {
    if (chanceOf(s, salt) >= 0.45) continue;
    const startsAt = s * SLOT_MS + Math.floor(chanceOf(s, salt + 1) * 2 * 3_600_000);
    const endsAt = startsAt + (50 + Math.floor(chanceOf(s, salt + 2) * 26)) * 60_000;
    const minute = minuteOfDay(startsAt);
    if (minute < 11 * 60 || minute > 21.5 * 60) continue;
    if (ms >= startsAt && ms < endsAt) {
      return { roof: Math.floor(chanceOf(s, salt + 3) * roofs), startsAt, endsAt };
    }
  }
  return null;
}
