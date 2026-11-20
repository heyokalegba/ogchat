import { describe, expect, it } from "vitest";
import { WINDOWS } from "@/components/shell/art/windows";
import {
  darkness,
  glowFor,
  litWindows,
  nightAt,
  prepare,
  type Night,
  type Prepared,
} from "@/lib/citylights";

/** A moment by the clock in Brooklyn, in November (UTC-5). */
const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour + 5, minute);
// 16 to 22 November 2026 is a Monday to a Sunday.
const MON = 16;
const WED = 18;
const FRI = 20;
const SAT = 21;
const SUN = 22;

const skyline = prepare(WINDOWS.skyline!.city);
const flats = prepare(WINDOWS.brooklyn!.rooftops);
const share = (p: Prepared, night: Night, only?: 0 | 1) => {
  const lit = litWindows(p, night, 1);
  let n = 0;
  let of = 0;
  for (let i = 0; i < p.count; i++) {
    if (only !== undefined && p.office[i] !== only) continue;
    of++;
    n += lit[i]!;
  }
  return n / of;
};

describe("the night a moment belongs to", () => {
  it("runs from noon to noon, by the clock in Brooklyn", () => {
    const evening = nightAt(at(WED, 21), 1);
    const small = nightAt(at(WED + 1, 3), 1);
    expect(evening.n).toBe(9);
    expect(small.n).toBe(15);
    expect(small.id).toBe(evening.id); // three on Thursday morning is still Wednesday night
    expect(nightAt(at(WED + 1, 13), 0).id).toBe(evening.id + 1);
  });

  it("knows a working day, and whether tomorrow is one", () => {
    expect(nightAt(at(WED, 20), 1)).toMatchObject({ worked: true, workTomorrow: true });
    expect(nightAt(at(FRI, 20), 1)).toMatchObject({ worked: true, workTomorrow: false });
    expect(nightAt(at(SAT, 20), 1)).toMatchObject({ worked: false, workTomorrow: false });
    expect(nightAt(at(SUN, 20), 1)).toMatchObject({ worked: false, workTomorrow: true });
    expect(nightAt(at(MON, 2), 1)).toMatchObject({ worked: false, workTomorrow: true }); // Sunday night
  });
});

describe("how dark it is", () => {
  it("goes by the sun, and a heavy sky brings the lights on early", () => {
    expect(darkness(40)).toBe(0);
    expect(darkness(6)).toBe(0);
    expect(darkness(0)).toBe(0.5);
    expect(darkness(-6)).toBe(1);
    expect(darkness(-30)).toBe(1);
    expect(darkness(40, 0.9)).toBeGreaterThan(0.4);
    expect(darkness(40, 0.9)).toBeLessThan(0.6);
  });

  it("shows no lit window at midday and all of them by dusk", () => {
    expect(glowFor(0)).toBe(0);
    expect(glowFor(0.15)).toBe(0);
    expect(glowFor(0.6)).toBeCloseTo(1);
    expect(glowFor(1)).toBe(1);
  });
});

describe("which windows are lit", () => {
  it("has the layers the scenes need, with offices and flats among them", () => {
    expect(skyline.count).toBeGreaterThan(2000);
    expect(flats.count).toBeGreaterThan(100);
    expect(skyline.office.some((o) => o === 1)).toBe(true);
    expect(flats.office.every((o) => o === 0)).toBe(true);
    for (let i = 0; i < skyline.count; i++) {
      expect(skyline.floor[i]).toBeGreaterThanOrEqual(0);
      expect(skyline.floor[i]).toBeLessThan(skyline.floors[skyline.building[i]!]!);
    }
  });

  it("lights nothing in broad daylight", () => {
    for (const p of [skyline, flats]) {
      expect(share(p, nightAt(at(WED, 13), 0))).toBe(0);
      expect(share(p, nightAt(at(WED, 13), 0.15))).toBe(0);
    }
  });

  it("is the same whenever it is asked, and a different city the next night", () => {
    const tonight = nightAt(at(WED, 21, 30), 1);
    const a = litWindows(skyline, tonight, 1);
    expect(litWindows(skyline, tonight, 1)).toEqual(a);
    const tomorrow = litWindows(skyline, nightAt(at(WED + 1, 21, 30), 1), 1);
    let differ = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== tomorrow[i]) differ++;
    expect(differ).toBeGreaterThan(a.length * 0.1);
  });

  it("has no window that is lit every night, or dark every night", () => {
    const flat = prepare(WINDOWS.brooklyn!.rooftops);
    const always = new Uint8Array(flat.count).fill(1);
    const never = new Uint8Array(flat.count).fill(1);
    for (let day = 0; day < 60; day++) {
      const lit = litWindows(flat, nightAt(at(1, 21) + day * 86_400_000, 1), 2);
      for (let i = 0; i < flat.count; i++) {
        if (!lit[i]) always[i] = 0;
        else never[i] = 0;
      }
    }
    expect(always.reduce((sum, v) => sum + v, 0)).toBe(0);
    expect(never.reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  it("empties the offices through the evening, and leaves a few on in the small hours", () => {
    const office = (hour: number, day = WED) =>
      share(skyline, nightAt(at(hour < 12 ? day + 1 : day, hour), 1), 1);
    expect(office(17)).toBeGreaterThan(0.6); // a winter rush hour: the towers are lit
    expect(office(19)).toBeLessThan(office(17));
    expect(office(21)).toBeLessThan(office(19));
    expect(office(21)).toBeLessThan(0.3);
    expect(office(3)).toBeGreaterThan(0.01); // lobbies, the floor that never sleeps
    expect(office(3)).toBeLessThan(0.12);
    expect(office(8)).toBeGreaterThan(office(5)); // and they fill again in the morning
  });

  it("leaves the offices mostly dark at the weekend", () => {
    const office = (day: number) => share(skyline, nightAt(at(day, 17), 1), 1);
    expect(office(SAT)).toBeLessThan(office(WED) * 0.35);
  });

  it("sends the flats to bed: most lit in the evening, few by three, some up before dawn", () => {
    const home = (hour: number, day = WED) =>
      share(flats, nightAt(at(hour < 12 ? day + 1 : day, hour), 1));
    expect(home(20.5)).toBeGreaterThan(0.3);
    expect(home(20.5)).toBeLessThan(0.65);
    expect(home(23.5)).toBeLessThan(home(21));
    expect(home(3)).toBeGreaterThan(0.01);
    expect(home(3)).toBeLessThan(0.12);
    expect(home(6.5)).toBeGreaterThan(home(3));
    // the night before a day off runs later
    expect(home(0.5, FRI)).toBeGreaterThan(home(0.5, WED));
  });

  it("brings the lights on one by one as it gets dark, not all at once", () => {
    const evening = (dark: number) => share(flats, nightAt(at(WED, 19), dark));
    expect(evening(0.2)).toBe(0);
    expect(evening(0.45)).toBeGreaterThan(0);
    expect(evening(0.45)).toBeLessThan(evening(0.7));
    expect(evening(0.7)).toBeLessThanOrEqual(evening(1));
  });

  it("lights an office floor together when the cleaners are on it", () => {
    // Find a tall office building and follow the night: some floor should be lit
    // nearly end to end at an hour when its neighbours are dark.
    let found = false;
    for (let b = 0; b < skyline.floors.length && !found; b++) {
      if (skyline.floors[b]! < 12) continue;
      const mine: number[] = [];
      for (let i = 0; i < skyline.count; i++) if (skyline.building[i] === b) mine.push(i);
      if (!mine.every((i) => skyline.office[i] === 1)) continue;
      for (let minute = 0; minute < 6 * 60 && !found; minute += 5) {
        const lit = litWindows(skyline, nightAt(at(WED, 20) + minute * 60_000, 1), 1);
        const byFloor = new Map<number, [number, number]>();
        for (const i of mine) {
          const tally = byFloor.get(skyline.floor[i]!) ?? [0, 0];
          tally[0] += lit[i]!;
          tally[1] += 1;
          byFloor.set(skyline.floor[i]!, tally);
        }
        const full = [...byFloor.values()].filter(([on, of]) => of >= 3 && on / of >= 0.7).length;
        const dark = [...byFloor.values()].filter(([on, of]) => of >= 3 && on / of <= 0.25).length;
        if (full >= 1 && dark >= byFloor.size * 0.6) found = true;
      }
    }
    expect(found).toBe(true);
  });
});
