#!/usr/bin/env node
/**
 * A stand-in for the weather service, for trying the scene without the
 * network: `node scripts/mock-weather.mjs`, then run ogchat with
 * OGCHAT_WEATHER_URL=http://127.0.0.1:8788.
 *
 * It answers in the service's shapes with weather that is made up but
 * predictable: now is whatever MOCK_NOW says (a WMO code, default 61, light
 * rain); January days are snowy with snow lying, July afternoons thunder,
 * and every other day is overcast in the morning and clear after noon.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_WEATHER_PORT ?? 8788);
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const two = (n) => String(n).padStart(2, "0");

function codeFor(date, hour) {
  const month = Number(date.slice(5, 7));
  if (month === 1) return hour < 16 ? 73 : 3;
  if (month === 7) return hour >= 15 && hour <= 18 ? 95 : 1;
  return hour < 12 ? 3 : 0;
}

function day(date) {
  const january = date.slice(5, 7) === "01";
  return {
    timezone: "America/New_York",
    hourly: {
      time: HOURS.map((h) => `${date}T${two(h)}:00`),
      weather_code: HOURS.map((h) => codeFor(date, h)),
      cloud_cover: HOURS.map((h) =>
        codeFor(date, h) === 0 ? 5 : codeFor(date, h) === 1 ? 20 : 100,
      ),
      precipitation: HOURS.map(() => 0),
      snowfall: HOURS.map((h) => (codeFor(date, h) === 73 ? 0.4 : 0)),
      snow_depth: HOURS.map(() => (january ? 0.06 : 0)),
      wind_speed_10m: HOURS.map(() => 11),
      temperature_2m: HOURS.map(() => (january ? -2 : 18)),
      visibility: HOURS.map(() => 16000),
    },
  };
}

function now() {
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" });
  const time = `${stamp.slice(0, 10)}T${stamp.slice(11, 16)}`;
  const code = Number(process.env.MOCK_NOW ?? 61);
  return {
    timezone: "America/New_York",
    current: {
      time,
      interval: 900,
      weather_code: code,
      cloud_cover: code <= 1 ? 10 : 100,
      precipitation: 0.3,
      snowfall: 0,
      wind_speed_10m: 14.2,
      temperature_2m: 8.9,
    },
    hourly: {
      time: HOURS.map((h) => `${time.slice(0, 10)}T${two(h)}:00`),
      snow_depth: HOURS.map(() => Number(process.env.MOCK_SNOW_DEPTH ?? 0)),
      visibility: HOURS.map(() => 9000),
      weather_code: HOURS.map(() => code),
    },
  };
}

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://mock");
    const date = url.searchParams.get("start_date");
    const body = url.searchParams.has("current") ? now() : date ? day(date) : null;
    response.writeHead(body ? 200 : 400, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(body ?? { error: true, reason: "mock: ask for current or a date" }),
    );
    console.log(`${request.method} ${url.pathname}${url.search}`);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock weather on http://127.0.0.1:${PORT}`));
