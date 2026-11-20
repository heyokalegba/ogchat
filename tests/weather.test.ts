import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/weather/route";
import {
  atBrooklynDate,
  brooklynClock,
  brooklynDate,
  brooklynHour,
  dateInRange,
} from "@/lib/daylight";
import {
  conditionsOf,
  describeReading,
  greyOf,
  readingAtHour,
  shelterOf,
  type DayRecord,
  type Reading,
} from "@/lib/weather";
import { useTempDataDir } from "./helpers";

const data = useTempDataDir();

const reading = (code: number, more: Partial<Reading> = {}): Reading => ({
  time: "2026-11-19T10:15",
  code,
  cloud: null,
  precipMm: null,
  snowCm: null,
  snowDepthM: null,
  windKph: null,
  windFrom: null,
  visibilityM: null,
  tempC: null,
  ...more,
});

describe("a reading from New York", () => {
  it("becomes the kind of weather its code stands for", () => {
    const kinds = (codes: number[]) => codes.map((code) => conditionsOf(reading(code)).kind);
    expect(kinds([0, 1])).toEqual(["clear", "clear"]);
    expect(kinds([2, 3])).toEqual(["cloudy", "cloudy"]);
    expect(kinds([45, 48])).toEqual(["fog", "fog"]);
    expect(new Set(kinds([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]))).toEqual(
      new Set(["rain"]),
    );
    expect(new Set(kinds([71, 73, 75, 77, 85, 86]))).toEqual(new Set(["snow"]));
    expect(new Set(kinds([95, 96, 99]))).toEqual(new Set(["storm"]));
    // a code nobody has heard of is not an error: it is cloud
    expect(kinds([42])).toEqual(["cloudy"]);
  });

  it("is not fog unless New York says fog", () => {
    for (let code = 0; code <= 99; code++) {
      expect(conditionsOf(reading(code)).kind === "fog").toBe(code === 45 || code === 48);
    }
  });

  it("knows drizzle from a downpour", () => {
    expect(conditionsOf(reading(51)).force).toBe("light");
    expect(conditionsOf(reading(63)).force).toBe("steady");
    expect(conditionsOf(reading(65)).force).toBe("heavy");
    expect(shelterOf(conditionsOf(reading(65)))).toBeGreaterThan(
      shelterOf(conditionsOf(reading(51))),
    );
    expect(greyOf(conditionsOf(reading(65)))).toBeGreaterThan(greyOf(conditionsOf(reading(51))));
  });

  it("covers the sky as much as the clouds do", () => {
    const grey = (code: number, cloud: number) => greyOf(conditionsOf(reading(code, { cloud })));
    expect(grey(0, 0)).toBe(0);
    expect(grey(2, 40)).toBeLessThan(0.3); // broken cloud: the sun still shows
    expect(grey(3, 100)).toBeGreaterThan(0.6);
    expect(grey(3, 100)).toBeGreaterThan(grey(2, 40));
    // rain is never under an open sky, whatever the cloud figure says
    expect(conditionsOf(reading(63, { cloud: 10 })).cover).toBeGreaterThanOrEqual(0.8);
  });

  it("has snow lying only when there is snow on the ground", () => {
    expect(conditionsOf(reading(0, { snowDepthM: 0.08 })).snowLying).toBe(true);
    expect(conditionsOf(reading(73, { snowDepthM: 0 })).snowLying).toBe(false);
    expect(conditionsOf(reading(73)).snowLying).toBe(false);
    expect(conditionsOf(reading(0, { snowDepthM: 0.004 })).snowLying).toBe(false);
  });

  it("reads out in words", () => {
    expect(describeReading(reading(61, { tempC: 9, windKph: 16.1 }))).toBe(
      "light rain · 48°F (9°C) · wind 10 mph",
    );
    expect(describeReading(reading(0, { tempC: -3, snowDepthM: 0.1 }))).toBe(
      "clear sky · 27°F (-3°C) · 4 in of snow lying",
    );
    expect(describeReading(reading(3))).toBe("overcast");
  });

  it("takes the nearest hour when one is missing from a day", () => {
    const day: DayRecord = { date: "2025-01-06", hours: Array.from({ length: 24 }, () => null) };
    expect(readingAtHour(day, 9)).toBeNull();
    day.hours[7] = reading(71, { time: "2025-01-06T07:00" });
    day.hours[20] = reading(3, { time: "2025-01-06T20:00" });
    expect(readingAtHour(day, 7)?.code).toBe(71);
    expect(readingAtHour(day, 9)?.code).toBe(71);
    expect(readingAtHour(day, 23)?.code).toBe(3);
  });
});

describe("setting the scene to another day", () => {
  const now = Date.UTC(2026, 10, 19, 20, 42, 7, 250); // 3:42 pm in Brooklyn, in winter time

  it("knows the date and hour in Brooklyn, not here", () => {
    expect(brooklynDate(now)).toBe("2026-11-19");
    expect(brooklynHour(now)).toBe(15);
    expect(brooklynDate(Date.UTC(2026, 10, 20, 3))).toBe("2026-11-19"); // 10 pm the evening before
  });

  it("keeps the time of day, across daylight saving too", () => {
    for (const date of ["2025-01-01", "2025-07-04", "2025-03-09", "2025-11-02", "2026-11-18"]) {
      const moved = atBrooklynDate(now, date);
      expect(brooklynDate(moved)).toBe(date);
      expect(brooklynClock(moved).minutes).toBe(brooklynClock(now).minutes);
      expect(moved % 1000).toBe(250);
    }
    // a summer day is on summer time: the same wall clock is an hour earlier in UTC
    expect(new Date(atBrooklynDate(now, "2025-07-04")).getUTCHours()).toBe(19);
    expect(atBrooklynDate(now, "2026-11-19")).toBe(now);
  });

  it("allows days from 1 January 2025 up to today, and only real ones", () => {
    expect(dateInRange("2025-01-01", now)).toBe(true);
    expect(dateInRange("2026-11-19", now)).toBe(true);
    expect(dateInRange("2024-12-31", now)).toBe(false);
    expect(dateInRange("2026-11-20", now)).toBe(false);
    expect(dateInRange("2025-02-30", now)).toBe(false);
    expect(dateInRange("yesterday", now)).toBe(false);
    expect(dateInRange("2025-1-6", now)).toBe(false);
  });
});

/** The weather service's answer shapes, as its documentation gives them. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);
function serviceDay(date: string, code: (hour: number) => number | null) {
  return {
    latitude: 40.68,
    longitude: -73.94,
    timezone: "America/New_York",
    hourly_units: { time: "iso8601", weather_code: "wmo code", snow_depth: "m" },
    hourly: {
      time: HOURS.map((h) => `${date}T${String(h).padStart(2, "0")}:00`),
      weather_code: HOURS.map(code),
      cloud_cover: HOURS.map(() => 100),
      precipitation: HOURS.map(() => 0.4),
      snowfall: HOURS.map(() => 0.28),
      snow_depth: HOURS.map(() => 0.05),
      wind_speed_10m: HOURS.map(() => 12.3),
      temperature_2m: HOURS.map(() => -1.5),
      visibility: HOURS.map(() => 2400),
    },
  };
}
function serviceNow() {
  return {
    current_units: { time: "iso8601", interval: "seconds", weather_code: "wmo code" },
    current: {
      time: "2026-11-19T10:15",
      interval: 900,
      weather_code: 61,
      cloud_cover: 100,
      precipitation: 0.3,
      snowfall: 0,
      wind_speed_10m: 14.2,
      temperature_2m: 8.9,
    },
    hourly: {
      time: HOURS.map((h) => `2026-11-19T${String(h).padStart(2, "0")}:00`),
      snow_depth: HOURS.map((h) => (h === 10 ? 0.02 : 0)),
      visibility: HOURS.map(() => 9000),
      weather_code: HOURS.map(() => 61),
    },
  };
}

function stubService(respond: (url: URL) => unknown) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      const body = respond(url);
      return body instanceof Response ? body : Response.json(body);
    }),
  );
  return calls;
}

const ask = (query = "", host = "localhost:3000") =>
  GET(new Request(`http://${host}/api/weather${query}`, { headers: { host } }));

describe("GET /api/weather", () => {
  beforeEach(() => {
    delete (globalThis as { __ogchatWeather?: unknown }).__ogchatWeather;
    vi.stubEnv("OGCHAT_WEATHER_URL", "");
  });

  it("gives New York's weather now, and asks the service once in ten minutes", async () => {
    const calls = stubService(() => serviceNow());
    const first = (await (await ask()).json()) as { now: Reading };
    expect(first.now).toMatchObject({
      time: "2026-11-19T10:15",
      code: 61,
      cloud: 100,
      tempC: 8.9,
      windKph: 14.2,
      snowDepthM: 0.02, // from the hour that matches
      visibilityM: 9000,
    });
    await ask();
    await ask();
    expect(calls).toHaveLength(1);
  });

  it("asks only about a fixed point in Brooklyn, and sends nothing else", async () => {
    const calls = stubService(() => serviceNow());
    await ask();
    const url = calls[0]!;
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("40.68");
    expect(url.searchParams.get("longitude")).toBe("-73.94");
    expect(url.searchParams.get("timezone")).toBe("America/New_York");
    expect([...url.searchParams.keys()].sort()).toEqual(
      ["current", "forecast_days", "hourly", "latitude", "longitude", "timezone"].sort(),
    );
    const init = vi.mocked(fetch).mock.calls[0]![1];
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it("gives a past day hour by hour, and keeps it so it is asked for once", async () => {
    const calls = stubService((url) =>
      serviceDay(url.searchParams.get("start_date")!, (h) => (h < 12 ? 73 : 3)),
    );
    const body = (await (await ask("?date=2025-01-06")).json()) as { day: DayRecord };
    expect(body.day.date).toBe("2025-01-06");
    expect(body.day.hours).toHaveLength(24);
    expect(body.day.hours[8]).toMatchObject({
      time: "2025-01-06T08:00",
      code: 73,
      snowDepthM: 0.05,
    });
    expect(body.day.hours[18]?.code).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.origin).toBe("https://historical-forecast-api.open-meteo.com");
    expect(calls[0]!.searchParams.get("end_date")).toBe("2025-01-06");

    // from disk the second time, even after the server's memory is gone
    delete (globalThis as { __ogchatWeather?: unknown }).__ogchatWeather;
    const again = (await (await ask("?date=2025-01-06")).json()) as { day: DayRecord };
    expect(again.day).toEqual(body.day);
    expect(calls).toHaveLength(1);
    expect(fs.existsSync(path.join(data.dir(), "weather", "2025-01-06.json"))).toBe(true);
  });

  it("falls back to the archive when the first record has no such day", async () => {
    const calls = stubService((url) =>
      url.hostname.startsWith("archive-api")
        ? serviceDay("2025-03-02", () => 0)
        : serviceDay("2025-03-02", () => null),
    );
    const body = (await (await ask("?date=2025-03-02")).json()) as { day: DayRecord };
    expect(body.day.hours[12]?.code).toBe(0);
    expect(calls.map((url) => url.hostname)).toEqual([
      "historical-forecast-api.open-meteo.com",
      "archive-api.open-meteo.com",
    ]);
    expect(calls[1]!.pathname).toBe("/v1/archive");
  });

  it("refuses days outside the record, without asking anyone", async () => {
    const calls = stubService(() => serviceNow());
    for (const date of ["2024-12-31", "2999-01-01", "2025-02-30", "nonsense", ""]) {
      const response = await ask(`?date=${date}`);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("bad_date");
    }
    expect(calls).toHaveLength(0);
  });

  it("says so plainly when the service is away, and does not keep the failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const down = await ask();
    expect(down.status).toBe(502);
    expect(((await down.json()) as { error: { code: string } }).error.code).toBe(
      "weather_unavailable",
    );
    expect((await ask("?date=2025-01-06")).status).toBe(502);
    expect(fs.existsSync(path.join(data.dir(), "weather", "2025-01-06.json"))).toBe(false);

    stubService((url) =>
      url.searchParams.has("current") ? serviceNow() : serviceDay("2025-01-06", () => 71),
    );
    expect((await ask()).status).toBe(200);
    expect((await ask("?date=2025-01-06")).status).toBe(200);
  });

  it("asks for less when the service refuses the full list of figures", async () => {
    const calls = stubService((url) => {
      const wanted = url.searchParams.get("current") ?? url.searchParams.get("hourly") ?? "";
      if (wanted.includes("snow")) {
        return Response.json(
          { error: true, reason: "Cannot initialize variable" },
          { status: 400 },
        );
      }
      return url.searchParams.has("current")
        ? {
            current: {
              time: "2026-11-19T10:15",
              weather_code: 2,
              cloud_cover: 40,
              temperature_2m: 7,
            },
          }
        : serviceDay("2025-05-05", () => 80);
    });
    const now = (await (await ask()).json()) as { now: Reading };
    expect(now.now).toMatchObject({ code: 2, cloud: 40, tempC: 7, snowDepthM: null });
    const day = (await (await ask("?date=2025-05-05")).json()) as { day: DayRecord };
    expect(day.day.hours[9]?.code).toBe(80);
    expect(calls.at(-1)!.searchParams.get("hourly")).toBe(
      "weather_code,cloud_cover,temperature_2m",
    );
  });

  it("is not weather when the service sends something else", async () => {
    stubService(() => ({ error: true, reason: "no" }));
    expect((await ask()).status).toBe(502);
    stubService(() => new Response("<html>busy</html>", { status: 503 }));
    expect((await ask()).status).toBe(502);
  });

  it("answers only the local page, like every other route", async () => {
    const calls = stubService(() => serviceNow());
    expect((await ask("", "evil.example")).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
