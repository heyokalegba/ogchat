import { describe, expect, it } from "vitest";
import {
  castRoofVisit,
  castStanding,
  castWalkers,
  HATCH_DEPTH,
  MAX_HEADS,
  wantedHeads,
  type LifeConfig,
  type LifeMeta,
  type Party,
} from "@/components/shell/life";

/** The same shape scripts/art/people.mjs writes into the art manifest. */
const meta: LifeMeta = {
  frames: 6,
  walkFrames: 4,
  person: { w: 9, h: 15, rows: 36 },
  prop: { w: 12, h: 9, rows: 10 },
  cast: { adults: [0, 26], children: [26, 6], runners: [32, 4], dogs: [0, 8], pram: 8, lead: 9 },
};

const street: LifeConfig = {
  kind: "street",
  near: 341,
  far: 336,
  from: -14,
  to: 654,
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
          expect(step.seconds).toBeLessThanOrEqual(14);
          continue;
        }
        expect(rightward ? step.to > at : step.to < at).toBe(true);
        const speed = Math.abs(step.to - at) / step.seconds;
        expect(speed).toBeGreaterThan(5);
        expect(speed).toBeLessThan(22);
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
        expect(feet).toBeGreaterThanOrEqual(street.far);
        expect(feet).toBeLessThanOrEqual(street.near);
      }
    }
  });

  it("are cast from the sheets: real rows, sensible cadences, heads counted right", () => {
    for (const party of parties) {
      expect(people(party)).toHaveLength(party.heads);
      for (const member of party.members) {
        const rows = member.sheet === "people" ? meta.person.rows : meta.prop.rows;
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
    const children = parties.filter((p) => people(p).some((m) => m.row >= 26 && m.row < 32));
    const runners = parties.filter((p) => people(p).some((m) => m.row >= 32));
    const solo = parties.filter((p) => p.members.length === 1);
    const pairs = parties.filter((p) => p.heads === 2);
    for (const group of [dogs, leads, prams, children, runners, pairs]) {
      expect(group.length).toBeGreaterThan(15);
    }
    expect(solo.length).toBeGreaterThan(150);
    expect(solo.length).toBeLessThan(400);
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
