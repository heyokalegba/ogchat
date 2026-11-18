import { describe, expect, it } from "vitest";
import {
  brooklynClock,
  describeOffset,
  formatMinutes,
  moonPhase,
  offsetForClockTime,
  readSky,
  skyBlend,
  sunAt,
} from "@/lib/daylight";

const utc = (iso: string) => Date.parse(iso);
const MIN = 60_000;

describe("the sun over Brooklyn", () => {
  it("stands at the right height at solar noon through the year", () => {
    // Noon altitude is 90 - latitude + declination: about 72.8, 49.3 and 25.9 degrees.
    expect(sunAt(utc("2026-06-21T16:58:00Z")).elevation).toBeCloseTo(72.8, 0);
    expect(sunAt(utc("2026-03-20T17:03:00Z")).elevation).toBeCloseTo(49.3, 0);
    expect(sunAt(utc("2026-12-21T16:54:00Z")).elevation).toBeCloseTo(25.9, 0);
  });

  it("is on the horizon at the published sunrise and sunset times", () => {
    // New York almanac times, to the minute. On the horizon means about -0.8 degrees.
    const horizon = [
      "2026-06-21T09:25:00Z", // sunrise 5:25 am EDT
      "2026-06-22T00:31:00Z", // sunset 8:31 pm EDT
      "2026-12-21T12:17:00Z", // sunrise 7:17 am EST
      "2026-12-21T21:32:00Z", // sunset 4:32 pm EST
      "2026-03-20T11:00:00Z", // sunrise 7:00 am EDT
      "2026-03-20T23:08:00Z", // sunset 7:08 pm EDT
    ];
    for (const moment of horizon) {
      expect(Math.abs(sunAt(utc(moment)).elevation + 0.8), moment).toBeLessThan(1.3);
    }
  });

  it("is far below the horizon in the middle of the night", () => {
    expect(sunAt(utc("2026-01-15T05:00:00Z")).elevation).toBeLessThan(-60);
    expect(sunAt(utc("2026-06-21T05:00:00Z")).elevation).toBeLessThan(-20);
  });

  it("is in the east before noon and the west after", () => {
    expect(sunAt(utc("2026-06-21T13:00:00Z")).hourAngle).toBeLessThan(0); // 9 am
    expect(sunAt(utc("2026-06-21T21:00:00Z")).hourAngle).toBeGreaterThan(0); // 5 pm
  });

  it("has longer days in summer than in winter", () => {
    const summer = sunAt(utc("2026-06-21T17:00:00Z")).setAngle;
    const winter = sunAt(utc("2026-12-21T17:00:00Z")).setAngle;
    // 15 degrees of hour angle is one hour: about 15 hours of daylight against 9.
    expect((summer * 2) / 15).toBeCloseTo(15.1, 0);
    expect((winter * 2) / 15).toBeCloseTo(9.2, 0);
  });
});

describe("which light the scene is in", () => {
  const at = (elevation: number, hourAngle = 10) => skyBlend({ elevation, hourAngle });

  it("is plain day when the sun is well up and plain night when it is well down", () => {
    expect(at(40)).toMatchObject({ from: "day", to: "day", mix: 0, night: 0 });
    expect(at(-30)).toMatchObject({ from: "night", to: "night", mix: 0, night: 1 });
  });

  it("passes through golden hour and dusk on the way down", () => {
    expect(at(4.5)).toMatchObject({ from: "day", to: "golden", mix: 0.5 });
    expect(at(-2)).toMatchObject({ from: "golden", to: "dusk", mix: 0.5 });
    expect(at(-9)).toMatchObject({ from: "dusk", to: "night", mix: 0.5 });
  });

  it("never jumps: neighbouring heights give neighbouring blends", () => {
    const order = ["day", "golden", "dusk", "night"];
    const position = (e: number) => {
      const b = at(e);
      return order.indexOf(b.from) + (b.to === b.from ? 0 : b.mix);
    };
    for (let e = 20; e > -20; e -= 0.25) {
      expect(Math.abs(position(e) - position(e - 0.25)), `at ${e}`).toBeLessThan(0.06);
    }
  });

  it("darkens steadily through twilight", () => {
    expect(at(2).night).toBe(0);
    expect(at(-4).night).toBeCloseTo(0.5);
    expect(at(-10).night).toBe(1);
  });

  it("knows morning from evening", () => {
    expect(at(3, -80).morning).toBe(true);
    expect(at(3, 80).morning).toBe(false);
  });
});

describe("the sky as the backdrop draws it", () => {
  it("carries the sun from the left at sunrise, over the top, to the right at sunset", () => {
    const sunrise = readSky(utc("2026-06-21T09:25:00Z"));
    const noon = readSky(utc("2026-06-21T16:58:00Z"));
    const sunset = readSky(utc("2026-06-22T00:31:00Z"));
    // Almanac times allow for refraction, so the sun is a touch past the edge of its arc.
    expect(Math.abs(sunrise.sun.x - 6)).toBeLessThan(1.5);
    expect(Math.abs(noon.sun.x - 50)).toBeLessThan(1.5);
    expect(Math.abs(sunset.sun.x - 94)).toBeLessThan(1.5);
    expect(noon.sun.y).toBeLessThan(sunrise.sun.y - 50); // higher up the screen
    expect(sunrise.blend.morning).toBe(true);
    expect(sunset.blend.morning).toBe(false);
  });

  it("puts the sun lower at winter noon than at summer noon", () => {
    const summer = readSky(utc("2026-06-21T16:58:00Z")).sun.y;
    const winter = readSky(utc("2026-12-21T16:54:00Z")).sun.y;
    expect(winter).toBeGreaterThan(summer + 35);
  });

  it("takes the sun away at night and brings out the stars", () => {
    const night = readSky(utc("2026-01-15T05:00:00Z"));
    expect(night.sun.up).toBe(false);
    expect(night.blend).toMatchObject({ from: "night", night: 1 });
  });

  it("has a full moon high at midnight and a new moon out of sight", () => {
    const full = readSky(utc("2026-03-04T05:00:00Z")); // midnight EST, the night after full moon
    expect(full.moon.frame).toBe(4);
    expect(full.moon.up).toBe(true);
    expect(full.moon.opacity).toBe(1);
    expect(full.moon.y).toBeLessThan(45);
    const fresh = readSky(utc("2026-02-17T17:00:00Z")); // noon on the day of new moon
    expect(fresh.moon.frame).toBe(0);
    expect(fresh.moon.opacity).toBe(0);
  });
});

describe("the moon's phase", () => {
  it("matches known new and full moons", () => {
    const near = (phase: number, target: number) =>
      Math.min(Math.abs(phase - target), 1 - Math.abs(phase - target));
    expect(near(moonPhase(utc("2026-02-17T12:01:00Z")), 0)).toBeLessThan(0.03); // new moon
    expect(near(moonPhase(utc("2026-03-03T11:38:00Z")), 0.5)).toBeLessThan(0.03); // full moon
    expect(near(moonPhase(utc("2024-04-08T18:21:00Z")), 0)).toBeLessThan(0.03); // new moon (solar eclipse)
  });
});

describe("the clock in Brooklyn", () => {
  it("reads Brooklyn time whatever the season", () => {
    expect(brooklynClock(utc("2026-07-01T16:00:00Z"))).toMatchObject({
      minutes: 720,
      label: "12:00 pm",
    }); // EDT
    expect(brooklynClock(utc("2026-01-15T17:00:00Z"))).toMatchObject({
      minutes: 720,
      label: "12:00 pm",
    }); // EST
    expect(brooklynClock(utc("2026-01-15T05:05:00Z"))).toMatchObject({
      minutes: 5,
      label: "12:05 am",
      weekday: "Thursday",
    });
    expect(brooklynClock(utc("2026-07-02T03:42:00Z"))).toMatchObject({
      minutes: 23 * 60 + 42,
      label: "11:42 pm",
      weekday: "Wednesday",
    });
  });

  it("formats minutes as a clock time", () => {
    expect([0, 5, 570, 720, 1185, 1439].map(formatMinutes)).toEqual([
      "12:00 am",
      "12:05 am",
      "9:30 am",
      "12:00 pm",
      "7:45 pm",
      "11:59 pm",
    ]);
  });
});

describe("setting the scene's time", () => {
  const realNow = utc("2026-07-01T18:20:00Z"); // 2:20 pm in Brooklyn

  it("moves the clock to the chosen time", () => {
    const offset = offsetForClockTime(realNow, 21 * 60); // 9:00 pm
    expect(offset).toBe(400 * MIN);
    expect(brooklynClock(realNow + offset).label).toBe("9:00 pm");
  });

  it("keeps running from there: it cannot be paused", () => {
    const offset = offsetForClockTime(realNow, 21 * 60);
    expect(brooklynClock(realNow + 10 * MIN + offset).label).toBe("9:10 pm");
    expect(brooklynClock(realNow + 5 * 60 * MIN + offset).label).toBe("2:00 am");
  });

  it("snaps back to the real time with an offset of zero", () => {
    expect(brooklynClock(realNow + 0).label).toBe("2:20 pm");
    expect(offsetForClockTime(realNow, 14 * 60 + 20)).toBe(0);
  });

  it("goes the short way round the dial", () => {
    expect(offsetForClockTime(realNow, 13 * 60)).toBe(-80 * MIN); // 1:00 pm: back, not 22h 40m forward
    expect(offsetForClockTime(realNow, 3 * 60)).toBe(-680 * MIN); // 3:00 am: 11h 20m back
    expect(offsetForClockTime(realNow, 60)).toBe(640 * MIN); // 1:00 am: 10h 40m forward
    const lateNight = utc("2026-07-02T05:00:00Z"); // 1:00 am
    expect(offsetForClockTime(lateNight, 23 * 60)).toBe(-120 * MIN); // 11:00 pm: two hours back
  });

  it("always lands on the chosen minute, from any starting time", () => {
    for (let start = 0; start < 1440; start += 97) {
      const now = utc("2026-03-10T05:00:00Z") + start * MIN;
      for (let target = 0; target < 1440; target += 131) {
        expect(brooklynClock(now + offsetForClockTime(now, target)).minutes).toBe(target);
      }
    }
  });

  it("describes how far the scene is from real time", () => {
    expect(describeOffset(0)).toBe("real time");
    expect(describeOffset(130 * MIN)).toBe("2 h 10 min ahead");
    expect(describeOffset(-45 * MIN)).toBe("45 min behind");
    expect(describeOffset(-3 * 60 * MIN)).toBe("3 h behind");
  });
});
