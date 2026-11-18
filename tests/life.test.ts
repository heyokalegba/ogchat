import { describe, expect, it } from "vitest";
import {
  castRoofVisit,
  castStanding,
  castCabRide,
  castWalkers,
  HATCH_DEPTH,
  MAX_HEADS,
  roofPartyAt,
  wantedHeads,
  type LifeConfig,
  type LifeMeta,
  type Party,
} from "@/components/shell/life";

/** The same shape scripts/art/people.mjs writes into the art manifest. */
const meta: LifeMeta = {
  frames: 6,
  walkFrames: 4,
  person: { w: 9, h: 15, rows: 40 },
  prop: { w: 12, h: 9, rows: 10 },
  wheel: { w: 20, h: 19, rows: 16 },
  cast: {
    cyclists: [0, 8],
    skaters: [8, 4],
    ballers: [12, 4],
    adults: [0, 28],
    children: [28, 8],
    runners: [36, 4],
    dogs: [0, 8],
    pram: 8,
    lead: 9,
  },
};

const street: LifeConfig = {
  kind: "street",
  near: 341,
  far: 336,
  from: -14,
  to: 654,
  road: 351,
  hail: [165, 325, 500],
  cab: { w: 28, h: 12, lane: 353, kerb: 350 },
  stoops: [
    { x: 60, y: 333 },
    { x: 210, y: 333 },
    { x: 380, y: 333 },
    { x: 560, y: 333 },
  ],
  sniff: [59, 133, 237, 307, 319, 399, 475, 591],
  linger: [164, 176, 300, 452],
  roofs: [],
};

const roofs: LifeConfig = {
  kind: "roofs",
  near: 0,
  far: 0,
  from: 0,
  to: 0,
  road: 0,
  hail: [],
  cab: null,
  stoops: [],
  sniff: [],
  linger: [],
  roofs: [
    { x: 20, w: 44, top: 300 },
    { x: 200, w: 58, top: 320 },
  ],
};

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function many<T>(count: number, make: (rand: () => number) => T): T[] {
  const rand = seeded(20261118);
  return Array.from({ length: count }, () => make(rand));
}

const people = (party: Party) => party.members.filter((m) => m.sheet === "people");

describe("how many people the street wants", () => {
  it("is three to five by day, fewer at night, and never nobody", () => {
    const day = many(300, (rand) => wantedHeads(rand, 0));
    expect(Math.min(...day)).toBe(3);
    expect(Math.max(...day)).toBe(5);
    const night = many(300, (rand) => wantedHeads(rand, 1));
    expect(Math.min(...night)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...night)).toBeLessThanOrEqual(2);
  });
});

describe("walkers on the pavement", () => {
  const parties = many(600, (rand) => castWalkers(rand, meta, street));

  it("come in at one end, wholly out of sight, and leave at the other", () => {
    for (const party of parties) {
      const last = party.steps.at(-1);
      expect(last?.kind).toBe("walk");
      const end = last?.kind === "walk" ? last.to : NaN;
      const rightward = end > party.x;
      expect(rightward ? party.x <= street.from : party.x >= street.to).toBe(true);
      expect(rightward ? end >= street.to : end <= street.from).toBe(true);
    }
  });

  it("only ever move forward, at a walking or running pace, stopping in order", () => {
    for (const party of parties) {
      let at = party.x;
      const end = party.steps.at(-1);
      const rightward = end?.kind === "walk" && end.to > party.x;
      for (const step of party.steps) {
        expect(step.kind).not.toBe("climb");
        expect(step.seconds).toBeGreaterThan(0);
        if (step.kind !== "walk") {
          // a pause is short; sitting down on a doorstep is not
          expect(step.seconds).toBeLessThanOrEqual(step.kind === "sit" ? 160 : 14);
          continue;
        }
        expect(rightward ? step.to > at : step.to < at).toBe(true);
        const speed = Math.abs(step.to - at) / step.seconds;
        expect(speed).toBeGreaterThan(5);
        expect(speed).toBeLessThan(37);
        at = step.to;
      }
    }
  });

  it("keep their feet on the pavement", () => {
    for (const party of parties) {
      expect(party.roof).toBeNull();
      expect(party.lift).toBe(0);
      for (const member of party.members) {
        const feet = party.y + member.dy;
        if (party.road) {
          // cyclists ride in the road, outside the parked cars
          expect(Math.abs(feet - street.road)).toBeLessThanOrEqual(1);
          continue;
        }
        expect(feet).toBeGreaterThanOrEqual(street.far);
        expect(feet).toBeLessThanOrEqual(street.near);
      }
    }
  });

  it("are cast from the sheets: real rows, sensible cadences, heads counted right", () => {
    for (const party of parties) {
      const riders = party.members.filter((m) => m.sheet === "wheels");
      expect(people(party).length + riders.length).toBe(party.heads);
      for (const member of party.members) {
        const rows =
          member.sheet === "people"
            ? meta.person.rows
            : member.sheet === "props"
              ? meta.prop.rows
              : meta.wheel.rows;
        expect(Number.isInteger(member.row)).toBe(true);
        expect(member.row).toBeGreaterThanOrEqual(0);
        expect(member.row).toBeLessThan(rows);
        expect(member.cadence).toBeGreaterThan(0.2);
        expect(member.cadence).toBeLessThan(2);
        expect(member.phase).toBeGreaterThanOrEqual(0);
        expect(member.phase).toBeLessThan(1);
      }
      // nearest drawn last
      const depths = party.members.map((m) => m.dy);
      expect(depths).toEqual([...depths].sort((a, b) => a - b));
    }
  });

  it("is a mixed crowd: alone, in pairs, with dogs, prams and children, the odd runner", () => {
    const dogs = parties.filter((p) => p.members.some((m) => m.sheet === "props" && m.row < 8));
    const leads = parties.filter((p) => p.members.some((m) => m.row === 9 && m.sheet === "props"));
    const prams = parties.filter((p) => p.members.some((m) => m.row === 8 && m.sheet === "props"));
    const children = parties.filter((p) => people(p).some((m) => m.row >= 28 && m.row < 36));
    const runners = parties.filter((p) => people(p).some((m) => m.row >= 36));
    const wheels = (from: number, to: number) =>
      parties.filter((p) =>
        p.members.some((m) => m.sheet === "wheels" && m.row >= from && m.row < to),
      );
    const cyclists = wheels(0, 8);
    expect(cyclists.length).toBeGreaterThan(30);
    for (const party of cyclists) {
      expect(party.road).toBe(true);
      expect(party.steps).toHaveLength(1); // straight through, no stopping
    }
    expect(wheels(8, 12).length).toBeGreaterThan(5); // skaters
    expect(wheels(12, 16).length).toBeGreaterThan(5); // kids with a ball
    expect(parties.filter((p) => p.road).length).toBe(cyclists.length);
    const solo = parties.filter((p) => p.members.length === 1);
    const pairs = parties.filter((p) => p.heads === 2);
    for (const group of [dogs, leads, prams, children, runners, pairs]) {
      expect(group.length).toBeGreaterThan(15);
    }
    expect(solo.length).toBeGreaterThan(200);
    expect(solo.length).toBeLessThan(420);
    // a dog on a lead is ahead of its walker
    for (const party of leads) {
      const walker = people(party)[0]!;
      const dog = party.members.find((m) => m.sheet === "props" && m.row < 8)!;
      expect(dog.dx).toBeGreaterThan(walker.dx);
    }
    // people who stop do it where there is something to stop for, most of the time
    const stopped = parties.filter((p) => p.steps.some((s) => s.kind === "wait"));
    expect(stopped.length).toBeGreaterThan(100);
    expect(stopped.length).toBeLessThan(400);
  });

  it("never brings more people than there is room for", () => {
    for (const room of [1, 2, 3]) {
      for (const party of many(200, (rand) => castWalkers(rand, meta, street, { room }))) {
        expect(party.heads).toBeLessThanOrEqual(Math.max(room, 1));
      }
    }
  });

  it("can start midway, to fill an empty street", () => {
    for (const party of many(100, (rand) => castWalkers(rand, meta, street, { midway: true }))) {
      expect(party.x).toBeGreaterThan(street.from);
      expect(party.x).toBeLessThan(street.to);
    }
  });

  it("casts a group of the size asked for, capped by the room left", () => {
    for (const size of [4, 9, 14]) {
      const group = castWalkers(seeded(size), meta, street, { group: size, room: MAX_HEADS });
      expect(group.heads).toBe(size);
      expect(people(group)).toHaveLength(size);
    }
    const squeezed = castWalkers(seeded(1), meta, street, { group: 14, room: 6 });
    expect(squeezed.heads).toBe(6);
  });
});

describe("sitting on a doorstep", () => {
  const parties = many(1500, (rand) => castWalkers(rand, meta, street));
  const sat = parties.filter((p) => p.steps.some((s) => s.kind === "sit"));

  it("happens now and then, at a real doorstep, with a seat for each person", () => {
    expect(sat.length).toBeGreaterThan(60);
    expect(sat.length).toBeLessThan(500);
    for (const party of sat) {
      const at = party.steps.findIndex((s) => s.kind === "sit");
      const before = party.steps[at - 1];
      // they walk to the doorstep first
      expect(before?.kind).toBe("walk");
      const x = before?.kind === "walk" ? before.to : NaN;
      expect(street.stoops.map((stoop) => stoop.x)).toContain(x);
      // and walk on afterwards
      expect(party.steps.at(-1)?.kind).toBe("walk");
      const seated = people(party).filter((m) => m.seat);
      expect(seated.length).toBe(Math.min(6, people(party).length));
      const stoop = street.stoops.find((candidate) => candidate.x === x)!;
      const places = new Set<string>();
      for (const member of seated) {
        const feet = party.y + member.dy + member.seat!.dy;
        const across = member.dx + member.seat!.dx;
        // on one of the steps, within the doorstep's width, nobody on anybody's lap
        expect(feet).toBeLessThanOrEqual(stoop.y);
        expect(feet).toBeGreaterThanOrEqual(stoop.y - 6);
        expect(Math.abs(across + 5)).toBeLessThanOrEqual(6);
        places.add(`${across},${feet}`);
      }
      expect(places.size).toBe(seated.length);
    }
    // groups are the likeliest to stop, and nobody on wheels or running does
    expect(sat.some((p) => p.heads >= 3)).toBe(true);
    for (const party of sat) {
      expect(party.road).toBe(false);
      expect(party.members.some((m) => m.sheet === "wheels")).toBe(false);
    }
  });

  it("can open on somebody already sitting there", () => {
    for (const party of many(60, (rand) =>
      castWalkers(rand, meta, street, { seated: true, room: 3 }),
    )) {
      expect(party.steps[0]?.kind).toBe("sit");
      expect(street.stoops.map((stoop) => stoop.x)).toContain(party.x);
      expect(party.heads).toBeLessThanOrEqual(3);
      expect(people(party).every((m) => m.seat)).toBe(true);
    }
  });

  it("never happens where there are no doorsteps", () => {
    const bare = { ...street, stoops: [] };
    for (const party of many(300, (rand) => castWalkers(rand, meta, bare))) {
      expect(party.steps.some((s) => s.kind === "sit")).toBe(false);
    }
  });
});

describe("hailing a cab", () => {
  const rides = many(300, (rand) => castCabRide(rand, meta, street)!);

  it("is one person walking to an empty stretch of kerb, an arm up, then into the cab", () => {
    for (const { party, cab } of rides) {
      expect(party.heads).toBe(1);
      expect(party.members).toHaveLength(1);
      expect(party.road).toBe(false);
      expect(party.y).toBe(street.near); // at the kerb's edge
      expect(party.steps.map((s) => s.kind)).toEqual(["walk", "hail", "board"]);
      const [walk, hail, board] = party.steps;
      const spot = walk?.kind === "walk" ? walk.to : NaN;
      expect(street.hail).toContain(spot);
      // they start out of sight
      expect(party.x <= street.from || party.x >= street.to).toBe(true);
      expect(hail!.seconds).toBeGreaterThanOrEqual(5);
      expect(hail!.seconds).toBeLessThanOrEqual(9);
      // the cab stops in front of them, and they step down to its door
      expect(Math.abs(cab.stopX + street.cab!.w / 2 - spot)).toBeLessThanOrEqual(1);
      expect(board?.kind === "board" && board.drop).toBeGreaterThan(0);
      expect(cab.id).toBe(party.id);
    }
  });

  it("times the cab to pull in as the wait ends and leave once its fare is aboard", () => {
    for (const { party, cab } of rides) {
      const [walk, hail, board] = party.steps;
      const hailFrom = walk!.seconds;
      const hailTo = hailFrom + hail!.seconds;
      // it sets off after the arm goes up and is at the kerb when the wait ends
      expect(cab.arriveAt).toBeGreaterThan(hailFrom);
      expect(cab.arriveAt + cab.arriveFor).toBeCloseTo(hailTo, 5);
      expect(cab.leaveAt).toBeGreaterThan(hailTo + board!.seconds);
      expect(cab.leaveAt).toBeLessThan(hailTo + board!.seconds + 2);
    }
  });

  it("does not happen where there is no kerb or no cab", () => {
    expect(castCabRide(seeded(1), meta, roofs)).toBeNull();
    expect(castCabRide(seeded(1), meta, { ...street, hail: [] })).toBeNull();
  });
});

describe("a barbecue on a roof", () => {
  // Noon to noon, New York time, as minutes of the day (UTC-5, no daylight saving in January).
  const minuteOfDay = (ms: number) => (((Math.floor(ms / 60_000) - 300) % 1440) + 1440) % 1440;
  const start = Date.UTC(2027, 0, 4);
  const day = 86_400_000;

  it("is decided by the clock: the same answer whenever it is asked", () => {
    for (let t = start; t < start + 3 * day; t += 7 * 60_000) {
      expect(roofPartyAt(t, 23, 5, minuteOfDay)).toEqual(roofPartyAt(t, 23, 5, minuteOfDay));
    }
  });

  it("lasts about an hour, in the afternoon or evening, on one roof throughout", () => {
    const seen = new Map<number, { roof: number; endsAt: number; minutes: number }>();
    for (let t = start; t < start + 40 * day; t += 60_000) {
      const party = roofPartyAt(t, 23, 5, minuteOfDay);
      if (!party) continue;
      expect(t).toBeGreaterThanOrEqual(party.startsAt);
      expect(t).toBeLessThan(party.endsAt);
      const known = seen.get(party.startsAt);
      if (known) {
        expect(party.roof).toBe(known.roof);
        known.minutes += 1;
      } else {
        seen.set(party.startsAt, { roof: party.roof, endsAt: party.endsAt, minutes: 1 });
      }
    }
    const parties = [...seen.entries()];
    // some days have one, some two, some none: a handful a week
    expect(parties.length).toBeGreaterThan(20);
    expect(parties.length).toBeLessThan(90);
    for (const [startsAt, { roof, endsAt, minutes }] of parties) {
      const length = (endsAt - startsAt) / 60_000;
      expect(length).toBeGreaterThanOrEqual(50);
      expect(length).toBeLessThanOrEqual(75);
      expect(minutes).toBe(length); // on for every minute of it, with no gaps
      expect(roof).toBeGreaterThanOrEqual(0);
      expect(roof).toBeLessThan(5);
      const began = minuteOfDay(startsAt);
      expect(began).toBeGreaterThanOrEqual(11 * 60);
      expect(began).toBeLessThanOrEqual(21.5 * 60);
    }
    // not always the same roof
    expect(new Set(parties.map(([, p]) => p.roof)).size).toBeGreaterThan(2);
  });

  it("keeps a different diary for each scene, and none where there is no roof for it", () => {
    let differ = 0;
    for (let t = start; t < start + 20 * day; t += 30 * 60_000) {
      const a = roofPartyAt(t, 11, 5, minuteOfDay);
      const b = roofPartyAt(t, 23, 5, minuteOfDay);
      if (Boolean(a) !== Boolean(b)) differ++;
      expect(roofPartyAt(t, 11, 0, minuteOfDay)).toBeNull();
    }
    expect(differ).toBeGreaterThan(10);
  });
});

describe("visitors on the roofs", () => {
  const visits = many(400, (rand) => castRoofVisit(rand, meta, roofs)).filter(
    (party): party is Party => party !== null,
  );

  it("come up through the hatch, stay on their roof, and go back down", () => {
    expect(visits.length).toBeGreaterThan(300);
    for (const party of visits) {
      const roof = roofs.roofs[party.roof!]!;
      expect(party.lift).toBe(HATCH_DEPTH);
      expect(party.steps[0]).toMatchObject({ kind: "climb", to: 0 });
      expect(party.steps.at(-1)).toMatchObject({ kind: "climb", to: HATCH_DEPTH });
      expect(party.steps.some((step) => step.kind === "wait")).toBe(true);
      const xs = [party.x, ...party.steps.flatMap((s) => (s.kind === "walk" ? [s.to] : []))];
      const left = Math.min(...party.members.map((m) => m.dx));
      const right = Math.max(...party.members.map((m) => m.dx + 12));
      for (const x of xs) {
        expect(x + left).toBeGreaterThanOrEqual(0);
        expect(x + right - 3).toBeLessThanOrEqual(roof.w);
      }
      // they leave by the hatch they came up through
      expect(xs.at(-1)).toBe(party.x);
      for (const member of party.members) expect(member.dy).toBe(0);
    }
  });

  it("can be told to wait out of sight first, and how long to stay", () => {
    const guest = castRoofVisit(seeded(5), meta, roofs, { roof: 1, delay: 7, stay: 60 });
    expect(guest?.roof).toBe(1);
    expect(guest?.steps[0]).toEqual({ kind: "wait", seconds: 7 });
    const waits = guest!.steps.slice(1).flatMap((s) => (s.kind === "wait" ? [s.seconds] : []));
    expect(waits.reduce((sum, s) => sum + s, 0)).toBeCloseTo(60, 5);
  });

  it("has nobody to offer where there are no roofs", () => {
    expect(castRoofVisit(seeded(1), meta, street)).toBeNull();
  });
});

describe("for people who asked for less motion", () => {
  it("casts people who simply stand where they are", () => {
    for (const life of [street, roofs]) {
      for (const party of many(50, (rand) => castStanding(rand, meta, life))) {
        if (!party) continue;
        expect(party.steps).toEqual([{ kind: "wait", seconds: Infinity }]);
        expect(party.lift).toBe(0);
      }
    }
  });
});

describe("the cast", () => {
  it("is dealt in four equal parts, for every kind of character", async () => {
    // The generator is plain JavaScript outside the app; load it by path.
    const art = "../scripts/art/";
    const people = (await import(/* @vite-ignore */ `${art}people.mjs`)) as {
      shares: (d: unknown, count: number) => object[];
      CAST: Record<string, number>;
      RIDERS: Record<string, number>;
    };
    const { dice } = (await import(/* @vite-ignore */ `${art}lib.mjs`)) as {
      dice: (seed: number) => unknown;
    };
    for (const count of [...Object.values(people.CAST), ...Object.values(people.RIDERS)]) {
      expect(count % 4).toBe(0);
      const dealt = people.shares(dice(count), count);
      const tally = new Map<object, number>();
      for (const part of dealt) tally.set(part, (tally.get(part) ?? 0) + 1);
      expect([...tally.values()]).toEqual([count / 4, count / 4, count / 4, count / 4]);
    }
  });
});
