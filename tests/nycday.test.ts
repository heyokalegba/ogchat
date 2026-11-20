import { describe, expect, it } from "vitest";
import { soundscapeOf } from "@/lib/ambience";
import { brooklynDay } from "@/lib/daylight";
import {
  calendarOf,
  fireworksAt,
  kerbClear,
  mealtime,
  rubbishOut,
  shopOpen,
  truckMinute,
  umbrellasFor,
  visitsOn,
  wardrobeFor,
  windOf,
} from "@/lib/nycday";

/** A moment by the clock in Brooklyn. `summer` months are on daylight time (UTC-4). */
const at = (month: number, day: number, hour: number, minute = 0, year = 2026) => {
  const summer = month >= 4 && month <= 10;
  return brooklynDay(Date.UTC(year, month - 1, day, hour + (summer ? 4 : 5), minute));
};
// In November 2026 the 16th is a Monday.
const MON = 16;
const TUE = 17;
const WED = 18;
const FRI = 20;
const SAT = 21;
const SUN = 22;

describe("the day on the block", () => {
  it("knows the calendar and the clock in Brooklyn", () => {
    expect(at(11, WED, 14, 30)).toMatchObject({ weekday: 3, month: 11, day: 18, minute: 870 });
    expect(at(11, SUN, 9).weekday).toBe(0);
    expect(at(7, 4, 21, 30)).toMatchObject({ month: 7, day: 4, hour: 21.5 });
    expect(at(11, WED, 10).dayId).toBe(at(11, WED, 23).dayId);
    expect(at(11, WED + 1, 1).dayId).toBe(at(11, WED, 23).dayId + 1);
  });
});

describe("what people wear", () => {
  it("is coats in the cold, shorts in the heat, and neither in between", () => {
    expect([-5, 0, 8].map(wardrobeFor)).toEqual(["cold", "cold", "cold"]);
    expect([9, 15, 23].map(wardrobeFor)).toEqual(["mild", "mild", "mild"]);
    expect([24, 30, 36].map(wardrobeFor)).toEqual(["hot", "hot", "hot"]);
  });

  it("puts umbrellas up for rain, most of them in a downpour, and few for snow", () => {
    expect(umbrellasFor("clear", "steady")).toBe(0);
    expect(umbrellasFor("cloudy", "steady")).toBe(0);
    expect(umbrellasFor("fog", "steady")).toBe(0);
    expect(umbrellasFor("rain", "light")).toBeLessThan(umbrellasFor("rain", "steady"));
    expect(umbrellasFor("rain", "steady")).toBeLessThan(umbrellasFor("rain", "heavy"));
    expect(umbrellasFor("storm", "steady")).toBeGreaterThan(0.8);
    expect(umbrellasFor("snow", "light")).toBe(0);
    expect(umbrellasFor("snow", "heavy")).toBeLessThan(umbrellasFor("rain", "light"));
  });
});

describe("shop hours", () => {
  it("never shuts the bodega", () => {
    for (let h = 0; h < 24; h += 0.5) expect(shopOpen("bodega", h, 3)).toBe(true);
  });

  it("opens the bakery before dawn and shuts it by evening, later and shorter on a Sunday", () => {
    expect(shopOpen("bakery", 5, 3)).toBe(false);
    expect(shopOpen("bakery", 6, 3)).toBe(true);
    expect(shopOpen("bakery", 18.5, 3)).toBe(true);
    expect(shopOpen("bakery", 19.5, 3)).toBe(false);
    expect(shopOpen("bakery", 3, 3)).toBe(false);
    expect(shopOpen("bakery", 6, 0)).toBe(false);
    expect(shopOpen("bakery", 16.5, 0)).toBe(false);
  });

  it("keeps the pizza place open past midnight, and till three at the weekend", () => {
    expect(shopOpen("pizza", 10, 3)).toBe(false);
    expect(shopOpen("pizza", 11.5, 3)).toBe(true);
    expect(shopOpen("pizza", 23.5, 3)).toBe(true);
    expect(shopOpen("pizza", 0.5, 4)).toBe(true); // half past midnight, Wednesday night
    expect(shopOpen("pizza", 1.5, 4)).toBe(false);
    expect(shopOpen("pizza", 2.5, 6)).toBe(true); // Friday night
    expect(shopOpen("pizza", 2.5, 0)).toBe(true); // Saturday night
    expect(shopOpen("pizza", 3.5, 0)).toBe(false);
    expect(shopOpen("pizza", 2.5, 1)).toBe(false); // Sunday night is a work night
  });
});

describe("rubbish and sweeping", () => {
  it("puts the rubbish out the evening before a collection and has it gone by breakfast", () => {
    expect(rubbishOut(at(11, MON, 12))).toBe(false);
    expect(rubbishOut(at(11, MON, 18, 30))).toBe(true); // Monday evening, for Tuesday
    expect(rubbishOut(at(11, MON, 23))).toBe(true);
    expect(rubbishOut(at(11, TUE, 5))).toBe(true);
    expect(rubbishOut(at(11, TUE, 7, 30))).toBe(false); // the truck has been
    expect(rubbishOut(at(11, WED, 20))).toBe(false);
    expect(rubbishOut(at(11, FRI - 1, 20))).toBe(true); // Thursday evening, for Friday
    expect(rubbishOut(at(11, SAT, 20))).toBe(false);
    const truck = truckMinute(at(11, TUE, 0).dayId);
    expect(truck).toBeGreaterThanOrEqual(6 * 60 + 10);
    expect(truck).toBeLessThan(6 * 60 + 50);
  });

  it("clears the kerb for the sweeper on the same two mornings", () => {
    expect(kerbClear(at(11, TUE, 9, 30))).toBe(true);
    expect(kerbClear(at(11, FRI, 10))).toBe(true);
    expect(kerbClear(at(11, TUE, 8, 30))).toBe(false);
    expect(kerbClear(at(11, TUE, 11))).toBe(false);
    expect(kerbClear(at(11, WED, 9, 30))).toBe(false);
  });
});

describe("who comes by on business", () => {
  const kinds = (month: number, day: number, temp = 12, wet = false) =>
    visitsOn(at(month, day, 12), temp, wet).map((v) => v.kind);

  it("is the same list whenever the day is asked about, in order of time", () => {
    const a = visitsOn(at(11, WED, 3), 12, false);
    const b = visitsOn(at(11, WED, 22), 12, false);
    expect(a).toEqual(b);
    expect(a.map((v) => v.minute)).toEqual([...a.map((v) => v.minute)].sort((x, y) => x - y));
    expect(visitsOn(at(11, WED + 1, 12), 12, false)).not.toEqual(a);
  });

  it("sends the school bus twice on a school day, and not in the holidays or at the weekend", () => {
    const wed = visitsOn(at(11, WED, 12), 12, false).filter((v) => v.kind === "schoolbus");
    expect(wed).toHaveLength(2);
    expect(wed[0]!.minute).toBeLessThan(8 * 60 + 15);
    expect(wed[1]!.minute).toBeGreaterThanOrEqual(14 * 60 + 45);
    expect(kinds(11, SAT)).not.toContain("schoolbus");
    expect(kinds(7, 15, 28)).not.toContain("schoolbus"); // a Wednesday in July
  });

  it("sends the sanitation truck and the sweeper on collection days only", () => {
    expect(kinds(11, TUE)).toEqual(expect.arrayContaining(["garbage", "sweeper"]));
    expect(kinds(11, FRI)).toEqual(expect.arrayContaining(["garbage", "sweeper"]));
    expect(kinds(11, WED)).not.toContain("garbage");
    expect(kinds(11, WED)).not.toContain("sweeper");
    const truck = visitsOn(at(11, TUE, 12), 12, false).find((v) => v.kind === "garbage")!;
    expect(truck.minute).toBe(truckMinute(at(11, TUE, 12).dayId));
  });

  it("brings parcels and the post every day but Sunday, and more parcels in December", () => {
    const count = (list: string[], kind: string) => list.filter((k) => k === kind).length;
    expect(count(kinds(11, WED), "mail")).toBe(1);
    expect(count(kinds(11, WED), "parcel")).toBeGreaterThanOrEqual(3);
    expect(kinds(11, SUN)).not.toContain("mail");
    expect(kinds(11, SUN)).not.toContain("parcel");
    let november = 0;
    let december = 0;
    for (let day = 1; day <= 28; day++) {
      november += count(kinds(11, day), "parcel");
      december += count(kinds(12, day), "parcel");
    }
    expect(december).toBeGreaterThan(november);
  });

  it("brings the ice cream truck out on warm dry summer days and no others", () => {
    expect(kinds(7, 15, 29)).toContain("icecream");
    expect(kinds(7, 15, 29, true)).not.toContain("icecream"); // raining
    expect(kinds(7, 15, 16)).not.toContain("icecream"); // a cold snap
    expect(kinds(11, WED, 25)).not.toContain("icecream"); // warm, but it is November
    for (const v of visitsOn(at(7, 15, 12), 29, false).filter((x) => x.kind === "icecream")) {
      expect(v.minute).toBeGreaterThanOrEqual(13 * 60 + 30);
      expect(v.minute).toBeLessThanOrEqual(20 * 60);
    }
  });

  it("has the couriers out at lunch and at dinner", () => {
    expect(mealtime(12.75)).toBe(1);
    expect(mealtime(19.25)).toBe(1);
    expect(mealtime(16)).toBe(0);
    expect(mealtime(4)).toBe(0);
    expect(mealtime(18.5)).toBeGreaterThan(0.5);
  });
});

describe("the calendar", () => {
  it("has Christmas lights from December to Epiphany", () => {
    expect(calendarOf(at(12, 1, 12)).christmas).toBe(true);
    expect(calendarOf(at(12, 25, 12)).christmas).toBe(true);
    expect(calendarOf(at(1, 6, 12, 0, 2027)).christmas).toBe(true);
    expect(calendarOf(at(1, 7, 12, 0, 2027)).christmas).toBe(false);
    expect(calendarOf(at(11, 30, 12)).christmas).toBe(false);
  });

  it("has pumpkins out for Halloween", () => {
    expect(calendarOf(at(10, 7, 12)).pumpkins).toBe(false);
    expect(calendarOf(at(10, 8, 12)).pumpkins).toBe(true);
    expect(calendarOf(at(10, 31, 20)).pumpkins).toBe(true);
    expect(calendarOf(at(11, 2, 12)).pumpkins).toBe(true);
    expect(calendarOf(at(11, 3, 12)).pumpkins).toBe(false);
  });

  it("has fireworks on the Fourth after dark, and at midnight on New Year's", () => {
    expect(fireworksAt(at(7, 4, 21, 0))).toBe(false);
    expect(fireworksAt(at(7, 4, 21, 30))).toBe(true);
    expect(fireworksAt(at(7, 4, 22, 0))).toBe(false);
    expect(fireworksAt(at(7, 5, 21, 30))).toBe(false);
    expect(fireworksAt(at(1, 1, 0, 5, 2027))).toBe(true);
    expect(fireworksAt(at(1, 1, 0, 30, 2027))).toBe(false);
    expect(fireworksAt(at(12, 31, 23, 55))).toBe(false);
  });
});

describe("the wind", () => {
  it("carries things the way it blows: a west wind to the right, an east wind to the left", () => {
    expect(windOf(30, 270).push).toBeGreaterThan(0.5);
    expect(windOf(30, 90).push).toBeLessThan(-0.5);
    expect(Math.abs(windOf(30, 0).push)).toBeLessThan(0.01); // from the north: straight at us
    expect(windOf(0, 270).push).toBe(0);
    expect(windOf(60, 270).strength).toBe(1);
    expect(windOf(10, 270).strength).toBeLessThan(windOf(30, 270).strength);
    expect(windOf(null, null).push).toBeGreaterThan(0); // not known: a light air from the west
  });
});

describe("what the street sounds like", () => {
  const scape = (over: Partial<Parameters<typeof soundscapeOf>[0]> = {}) =>
    soundscapeOf({
      traffic: 0.6,
      weather: "clear",
      force: "steady",
      wind: 0.2,
      night: 0,
      season: "summer",
      wet: false,
      ...over,
    });

  it("follows the weather: rain by how hard, thunder only in a storm", () => {
    expect(scape().rain).toBe(0);
    expect(scape({ weather: "rain", force: "light", wet: true }).rain).toBeLessThan(
      scape({ weather: "rain", wet: true }).rain,
    );
    expect(scape({ weather: "rain", force: "heavy", wet: true }).rain).toBe(1);
    expect(scape({ weather: "storm", wet: true })).toMatchObject({ rain: 1, storm: true });
    expect(scape({ weather: "snow", wet: true })).toMatchObject({ rain: 0, storm: false });
  });

  it("has birds by day in the dry, few in winter and none at night or in the rain", () => {
    expect(scape().birds).toBeGreaterThan(0.4);
    expect(scape({ season: "winter" }).birds).toBeLessThan(0.2);
    expect(scape({ night: 1 }).birds).toBe(0);
    expect(scape({ weather: "rain", wet: true }).birds).toBe(0);
  });

  it("keeps every figure between 0 and 1", () => {
    const wild = scape({ traffic: 7, wind: -3, night: 4 });
    for (const value of [wild.traffic, wild.rain, wild.wind, wild.birds, wild.night]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
