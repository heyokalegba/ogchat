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

/** How many people it takes to make the street feel lived in, by how dark it is. */
export function wantedHeads(rand: Rand, night: number): number {
  const byDay = whole(rand, 3, 5);
  return Math.max(1, Math.round(byDay * (1 - 0.55 * Math.min(1, Math.max(0, night)))));
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
  | "baller";

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
  let dog = false;
  let heads = 1;

  switch (kind) {
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
  if (kind === "cyclist" && !life.road) kind = "solo";
  // The ones found sitting on a doorstep are neighbours, alone or in company.
  if (options.seated) {
    kind = pick(rand, room >= 3 ? ["solo", "couple", "solo", "friends"] : ["solo"]);
  }
  const shape = form(rand, meta, kind, Math.min(options.group ?? 0, room));
  const rightward = rand() < 0.5;
  const start = (rightward ? life.from : life.to) + (rightward ? -1 : 1) * shape.reach;
  const end = (rightward ? life.to : life.from) + (rightward ? 1 : -1) * shape.reach;
  const x = options.midway ? between(rand, life.from + 40, life.to - 40) : start;

  // Stops along the way, in the order they will be reached.
  const stops: number[] = [];
  const hurried = kind === "runner" || kind === "cyclist" || kind === "skater";
  const pauses = hurried
    ? 0
    : shape.dog || kind === "baller"
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
  const sitting = options.seated ? life.stoops : rand() < (SITS[kind] ?? 0) ? ahead : [];
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
