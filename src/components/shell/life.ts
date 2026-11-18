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
  /** [first row, count] for each kind of character; single rows for the props. */
  cast: {
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
  /** Things a dog stops at, and places people tend to stop, by x. */
  sniff: readonly number[];
  linger: readonly number[];
  roofs: readonly { x: number; w: number; top: number }[];
}

export interface Member {
  sheet: "people" | "props";
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
}

export type Step =
  | { kind: "walk"; to: number; seconds: number }
  | { kind: "wait"; seconds: number }
  /** Roofs only: up through the hatch (0) or back down out of sight (`depth`). */
  | { kind: "climb"; to: number; seconds: number };

export interface Party {
  id: number;
  /** People in the party. Dogs and prams do not count. */
  heads: number;
  /** Index into the scene's roofs, or null on the pavement. */
  roof: number | null;
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

type Kind = "solo" | "couple" | "dog" | "runner" | "child" | "pram" | "friends";

/** How often each kind of party turns up on the pavement. */
const STREET_MIX: readonly [Kind, number][] = [
  ["solo", 0.38],
  ["couple", 0.17],
  ["dog", 0.17],
  ["runner", 0.08],
  ["child", 0.08],
  ["pram", 0.05],
  ["friends", 0.07],
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
  const widthOf = (m: Member) => (m.sheet === "people" ? person.w : prop.w);
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
  const kind: Kind = options.group ? "friends" : pickKind(rand, STREET_MIX, room);
  const shape = form(rand, meta, kind, Math.min(options.group ?? 0, room));
  const rightward = rand() < 0.5;
  const start = (rightward ? life.from : life.to) + (rightward ? -1 : 1) * shape.reach;
  const end = (rightward ? life.to : life.from) + (rightward ? 1 : -1) * shape.reach;
  const x = options.midway ? between(rand, life.from + 40, life.to - 40) : start;

  // Stops along the way, in the order they will be reached.
  const stops: number[] = [];
  const pauses = kind === "runner" ? 0 : shape.dog ? 0.6 : kind === "friends" ? 0.5 : 0.3;
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

  const steps: Step[] = [];
  let at = x;
  const walkTo = (to: number) => {
    steps.push({ kind: "walk", to, seconds: Math.abs(to - at) / shape.speed });
    at = to;
  };
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
    x,
    // Keep everyone's feet on the pavement: the party's line is its nearest member.
    y: whole(rand, life.far + 3, life.near),
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
  options: { roof?: number; room?: number; delay?: number; stay?: number } = {},
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
  const visits = whole(rand, 1, 3);
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
