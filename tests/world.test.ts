import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getWorld } from "@/app/api/world/route";
import { WEAR, WEAR_YEARS } from "@/components/shell/art/wear";
import {
  overcast,
  seasonAt,
  seasonOfMonth,
  shelter,
  weatherAt,
  WEATHERS,
  type SeasonName,
  type Weather,
} from "@/lib/weather";
import { useTempDataDir } from "./helpers";

const data = useTempDataDir();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("the season", () => {
  it("follows the calendar in New York", () => {
    expect([0, 1, 11].map(seasonOfMonth)).toEqual(["winter", "winter", "winter"]);
    expect([2, 3, 4].map(seasonOfMonth)).toEqual(["spring", "spring", "spring"]);
    expect([5, 6, 7].map(seasonOfMonth)).toEqual(["summer", "summer", "summer"]);
    expect([8, 9, 10].map(seasonOfMonth)).toEqual(["autumn", "autumn", "autumn"]);
    expect(seasonAt(Date.UTC(2026, 10, 18, 20))).toBe("autumn");
    expect(seasonAt(Date.UTC(2027, 0, 15, 12))).toBe("winter");
    // New Year's Eve in Brooklyn is still December there when it is January in UTC
    expect(seasonAt(Date.UTC(2027, 2, 1, 2))).toBe("winter");
    expect(seasonAt(Date.UTC(2027, 6, 4, 16))).toBe("summer");
  });
});

describe("the weather", () => {
  const start = Date.UTC(2027, 0, 1);
  const tally = (season: SeasonName) => {
    const counts = Object.fromEntries(WEATHERS.map((w) => [w, 0])) as Record<Weather, number>;
    for (let t = start; t < start + 400 * DAY; t += HOUR) counts[weatherAt(t, season)] += 1;
    return counts;
  };

  it("is decided by the clock: the same answer whenever it is asked", () => {
    for (let t = start; t < start + 10 * DAY; t += 37 * 60_000) {
      expect(weatherAt(t, "autumn")).toBe(weatherAt(t, "autumn"));
    }
  });

  it("holds for hours at a time rather than changing by the minute", () => {
    let changes = 0;
    let last = weatherAt(start, "spring");
    for (let t = start; t < start + 30 * DAY; t += 60_000) {
      const now = weatherAt(t, "spring");
      if (now !== last) changes++;
      last = now;
    }
    // thirty days hold 240 three-hour stretches; it changes at fewer than all of them
    expect(changes).toBeGreaterThan(40);
    expect(changes).toBeLessThan(220);
  });

  it("suits the season: snow in winter only, thunder mostly in summer, mostly fair all year", () => {
    const winter = tally("winter");
    const summer = tally("summer");
    const autumn = tally("autumn");
    expect(winter.snow).toBeGreaterThan(1200);
    expect(winter.storm).toBe(0);
    expect(summer.snow).toBe(0);
    expect(autumn.snow).toBe(0);
    expect(summer.storm).toBeGreaterThan(autumn.storm * 3);
    for (const counts of [winter, summer, autumn, tally("spring")]) {
      const all = Object.values(counts).reduce((sum, n) => sum + n, 0);
      expect((counts.clear + counts.cloudy) / all).toBeGreaterThan(0.5);
      expect(counts.rain + counts.snow).toBeGreaterThan(all * 0.12);
    }
  });

  it("keeps people in, and covers the sky, in proportion", () => {
    expect(shelter("clear")).toBe(0);
    expect(shelter("storm")).toBeGreaterThan(shelter("rain"));
    expect(shelter("rain")).toBeGreaterThan(shelter("fog"));
    expect(overcast("clear")).toBe(0);
    for (const weather of WEATHERS) {
      expect(shelter(weather)).toBeLessThan(1);
      expect(overcast(weather)).toBeLessThan(1);
    }
  });
});

describe("the street's age", () => {
  const request = () =>
    new Request("http://localhost:3000/api/world", { headers: { host: "localhost:3000" } });

  it("starts the first time it is asked, and is the same ever after", async () => {
    const before = Date.now();
    const first = (await (await getWorld(request())).json()) as { world: { builtAt: string } };
    const built = Date.parse(first.world.builtAt);
    expect(built).toBeGreaterThanOrEqual(before - 1000);
    expect(built).toBeLessThanOrEqual(Date.now() + 1000);
    expect(fs.existsSync(path.join(data.dir(), "world.json"))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const again = (await (await getWorld(request())).json()) as { world: { builtAt: string } };
    expect(again.world.builtAt).toBe(first.world.builtAt);
  });

  it("starts again from today if its record is unreadable", async () => {
    fs.mkdirSync(data.dir(), { recursive: true });
    fs.writeFileSync(path.join(data.dir(), "world.json"), "{ not json");
    const res = (await (await getWorld(request())).json()) as { world: { builtAt: string } };
    expect(Date.parse(res.world.builtAt)).toBeGreaterThan(Date.now() - 5000);
  });

  it("is only told to this machine", async () => {
    const res = await getWorld(
      new Request("http://evil.example/api/world", { headers: { host: "evil.example" } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("wear and tear", () => {
  it("is dealt out a little at a time over twenty years, in both scenes", () => {
    expect(WEAR_YEARS).toBe(20);
    for (const scene of ["skyline", "brooklyn"]) {
      const { colors, marks } = WEAR[scene]!;
      expect(marks.length).toBeGreaterThan(400);
      const days = marks.map((mark) => mark[0]!);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      expect(days[0]).toBeGreaterThanOrEqual(0);
      expect(days.at(-1)).toBeLessThanOrEqual(WEAR_YEARS * 365);
      // about one new mark a week or so, never a burst: no month brings more than a handful
      const firstYear = days.filter((day) => day <= 365).length;
      expect(firstYear).toBeGreaterThan(marks.length / 40);
      expect(firstYear).toBeLessThan(marks.length / 10);
      for (let month = 0; month < WEAR_YEARS * 12; month++) {
        const inMonth = days.filter((day) => day >= month * 30 && day < month * 30 + 30).length;
        expect(inMonth).toBeLessThan(16);
      }
      for (const [, color, alpha, ...rects] of marks) {
        expect(colors[color!]).toMatch(/^#[0-9a-f]{6}$/);
        expect(alpha).toBeGreaterThan(5);
        expect(alpha).toBeLessThanOrEqual(100);
        expect(rects.length % 4).toBe(0);
        expect(rects.length).toBeGreaterThan(0);
        for (let i = 0; i < rects.length; i += 4) {
          const [x, y, w, h] = rects.slice(i, i + 4) as [number, number, number, number];
          // small, and inside the picture
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(640);
          expect(y + h).toBeLessThanOrEqual(360);
          expect(w * h).toBeLessThanOrEqual(48);
        }
      }
    }
  });
});
