#!/usr/bin/env node
/**
 * Generates ogchat's pixel art. No dependencies: it draws into small RGBA
 * buffers and writes PNGs by hand.
 *
 *   npm run art
 *
 * The drawing code lives in scripts/art/:
 *   bricks.mjs     the wall the chat sits on
 *   sky.mjs        what both scenes share overhead: skies, clouds, stars, sun, moon
 *   skyline.mjs    scene one: the harbour, the bridge and the towers
 *   brooklyn.mjs   scene two: a brownstone block by Prospect Park
 *   people.mjs     the people, dogs and prams who walk through both
 *   lib.mjs        the canvas, the PNG writer, and the light recorder
 *
 * Every scene is drawn once and turned out in four lights (day, golden hour,
 * dusk, night) with identical geometry; the backdrop crossfades between them
 * as the real time in Brooklyn moves on. Everything is 640x360, scaled up in
 * CSS with hard pixels.
 *
 * Output goes to src/components/shell/art/ (and the wall to
 * src/components/chat/art/), together with index.ts: a manifest that imports
 * every picture and records where each scene's moving pieces sit, so
 * Backdrop.tsx needs no hand-copied numbers. The output is committed, so this
 * only needs running after a change, and it is seeded: the same script always
 * draws the same pictures.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  birds,
  CHAT_ART,
  ROOT,
  SEASONS,
  SHELL_ART,
  smoke,
  STATES,
  writePng,
  written,
} from "./art/lib.mjs";
import { bricks } from "./art/bricks.mjs";
import { brooklynScene } from "./art/brooklyn.mjs";
import { PEOPLE_META, peopleSheet, propsSheet, wheelsSheet } from "./art/people.mjs";
import { WEAR_YEARS } from "./art/wear.mjs";
import {
  appIcon,
  GRILL,
  grill,
  PARTY_LIGHTS,
  partyLights,
  SHADOW,
  shadows,
} from "./art/extras.mjs";
import {
  BIRD,
  bird,
  cloudStrip,
  FLIER,
  fliers,
  leafTile,
  moon,
  rainTile,
  sky,
  snowTile,
  stars,
  sun,
  WEATHER_TILE,
} from "./art/sky.mjs";
import { skylineScene } from "./art/skyline.mjs";

// Start from an empty folder, so a renamed picture never leaves its old self behind.
fs.rmSync(SHELL_ART, { recursive: true, force: true });

writePng(path.join(CHAT_ART, "bricks.png"), bricks());
// The icons for running ogchat as an app of its own.
for (const size of [192, 512]) {
  writePng(path.join(ROOT, "public", `icon-${size}.png`), appIcon(size));
}

/** name -> canvas, for everything under the shell's art folder. */
const files = new Map();
/** A picture identical to one already kept is not written again: its name points at the first. */
const sameAs = new Map();
const kept = new Map();
const add = (name, image) => {
  const key = `${image.w}x${image.h}:${createHash("sha1").update(image.data).digest("hex")}`;
  const first = kept.get(key);
  if (first) {
    sameAs.set(name, first);
    return;
  }
  kept.set(key, name);
  files.set(name, image);
};
const known = (name) => files.has(name) || sameAs.has(name);

for (const state of STATES) {
  add(`sky-${state}.png`, sky(state));
  add(`clouds-far-${state}.png`, cloudStrip("far", state));
  add(`clouds-near-${state}.png`, cloudStrip("near", state));
  add(`fliers-${state}.png`, fliers(state));
}
const starfield = stars();
add("stars.png", starfield.steady);
add("stars-twinkle.png", starfield.twinkle);
add("sun.png", sun(false));
add("sun-low.png", sun(true));
const lunar = moon();
add("moon.png", lunar.canvas);
const puff = smoke();
add("smoke.png", puff.canvas);
add("birds.png", birds());
add("bird.png", bird());
add("rain.png", rainTile());
add("snow.png", snowTile());
add("leaves.png", leafTile());
add("shadows.png", shadows());
add("party-lights.png", partyLights());
add("grill.png", grill());

const cast = { people: peopleSheet(), props: propsSheet(), wheels: wheelsSheet() };
const scenes = { skyline: skylineScene(puff, cast), brooklyn: brooklynScene(puff, cast) };
for (const [id, scene] of Object.entries(scenes)) {
  for (const [name, image] of Object.entries(scene.images)) add(`${id}/${name}`, image);
}
for (const [name, image] of files) writePng(path.join(SHELL_ART, name), image);

// ---------------------------------------------------------------- the manifest

const ident = (name) =>
  name.replace(/\.png$/, "").replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase());
const names = [...files.keys()];
const src = (name) => `${ident(sameAs.get(name) ?? name)}.src`;
const perState = (pattern) => `{ ${STATES.map((s) => `${s}: ${src(pattern(s))}`).join(", ")} }`;
/** A picture that exists in every season and every light. */
const perSeason = (pattern) =>
  `{\n      ${SEASONS.map((season) => `${season}: ${perState((s) => pattern(season, s))}`).join(",\n      ")},\n    }`;

const sceneBlock = (id) => `{
    city: ${perSeason((season, s) => `${id}/city-${season}-${s}.png`)},
    rooftops: ${perSeason((season, s) => `${id}/rooftops-${season}-${s}.png`)},
    /** Cars at the kerb, drawn over the people on the pavement. Only some scenes have them. */
    parked: ${known(`${id}/parked-summer-day.png`) ? perSeason((season, s) => `${id}/parked-${season}-${s}.png`) : "null"},
    people: ${perState((s) => `${id}/people-${s}.png`)},
    props: ${perState((s) => `${id}/props-${s}.png`)},
    wheels: ${perState((s) => `${id}/wheels-${s}.png`)},
    /** The cab that answers a hail. Only where there is a street to hail one on. */
    cab: ${known(`${id}/cab-day.png`) ? perState((s) => `${id}/cab-${s}.png`) : "null"},
    /** Sparkle on the water, as two pictures that take turns. Only where there is water. */
    glints: ${known(`${id}/glints-a.png`) ? `[${src(`${id}/glints-a.png`)}, ${src(`${id}/glints-b.png`)}]` : "null"},
    glow: {
      back: [${src(`${id}/glow-back-a.png`)}, ${src(`${id}/glow-back-b.png`)}],
      front: [${src(`${id}/glow-front-a.png`)}, ${src(`${id}/glow-front-b.png`)}],
    },
    /** The traffic strips, in each light. A scene with one picture for all hours repeats it. */
    traffic: ${perState((s) => (known(`${id}/traffic-${s}.png`) ? `${id}/traffic-${s}.png` : `${id}/traffic.png`))},
    config: ${JSON.stringify(scenes[id].config, null, 2).replace(/\n/g, "\n    ")},
  }`;

const manifest = `// Generated by scripts/make-art.mjs (npm run art). Do not edit by hand.
${names.map((name) => `import ${ident(name)} from "./${name}";`).join("\n")}

/** The four lights every picture comes in. The backdrop crossfades between neighbours. */
export const SKY_STATES = ${JSON.stringify(STATES)} as const;
export type SkyState = (typeof SKY_STATES)[number];

/** What every scene comes in: the four seasons, and winter with snow lying. */
export const SEASONS = ${JSON.stringify(SEASONS)} as const;
export type Season = (typeof SEASONS)[number];

/** Overhead, shared by every scene. */
export const SKY = {
  sky: ${perState((s) => `sky-${s}.png`)},
  cloudsFar: ${perState((s) => `clouds-far-${s}.png`)},
  cloudsNear: ${perState((s) => `clouds-near-${s}.png`)},
  stars: ${src("stars.png")},
  starsTwinkle: ${src("stars-twinkle.png")},
  sun: ${src("sun.png")},
  sunLow: ${src("sun-low.png")},
  /** Eight phases side by side, starting at new moon. */
  moon: ${src("moon.png")},
  smoke: ${src("smoke.png")},
  birds: ${src("birds.png")},
  /** An airliner and a helicopter: two frames across, one row each. */
  fliers: ${perState((s) => `fliers-${s}.png`)},
  flier: ${JSON.stringify(FLIER)},
  /** What falls: a tile each, with the tile's size in scene pixels. */
  rain: { src: ${src("rain.png")}, size: ${WEATHER_TILE.rain} },
  snow: { src: ${src("snow.png")}, size: ${WEATHER_TILE.snow} },
  leaves: { src: ${src("leaves.png")}, size: ${WEATHER_TILE.leaves} },
  /** One bird, wings up and wings down. */
  bird: { src: ${src("bird.png")}, ...${JSON.stringify(BIRD)} },
  /** Figures seen against lit windows: a row each, two frames across. */
  shadows: { src: ${src("shadows.png")}, ...${JSON.stringify(SHADOW)} },
  /** For a barbecue on a roof. Each picture is its unlit look above its lit one. */
  partyLights: { src: ${src("party-lights.png")}, ...${JSON.stringify(PARTY_LIGHTS)} },
  grill: { src: ${src("grill.png")}, ...${JSON.stringify(GRILL)} },
} as const;

/**
 * How the people and props sheets are cut up: every row is one character,
 * the first columns are a walk cycle and the last two are standing about.
 * \`cast\` gives [first row, count] for each kind of character.
 */
export const PEOPLE = ${JSON.stringify(PEOPLE_META, null, 2)} as const;

export const SCENES = {
  skyline: ${sceneBlock("skyline")},
  brooklyn: ${sceneBlock("brooklyn")},
} as const;

export type SceneId = keyof typeof SCENES;
`;
fs.writeFileSync(path.join(SHELL_ART, "index.ts"), manifest);

// Wear and tear: each scene's marks, with the day each one appears (see wear.mjs).
const wear = `// Generated by scripts/make-art.mjs (npm run art). Do not edit by hand.

/**
 * Small marks of age, by scene. \`marks\` is sorted by day; each is
 * [day it appears, colour index, opacity in percent, then x, y, w, h for each
 * rectangle], in scene pixels. Spread over ${WEAR_YEARS} years.
 */
export const WEAR_YEARS = ${WEAR_YEARS};

export const WEAR: Record<string, { colors: string[]; marks: number[][] }> = {
${Object.entries(scenes)
  .map(
    ([id, scene]) =>
      `  ${id}: {\n    colors: ${JSON.stringify(scene.wear.colors)},\n    marks: [\n${scene.wear.marks
        .map((mark) => `      [${mark.join(",")}],`)
        .join("\n")}\n    ],\n  },`,
  )
  .join("\n")}
};
`;
fs.writeFileSync(path.join(SHELL_ART, "wear.ts"), wear);

// ---------------------------------------------------------------- report

const kb = (test) =>
  Math.round(written.filter((w) => test(w.file)).reduce((n, w) => n + w.bytes, 0) / 1024);
const shared = (f) => f.includes("shell/art/") && !/shell\/art\/(skyline|brooklyn)\//.test(f);
console.log(`${written.length} pictures`);
console.log(`wall                 ${kb((f) => f.includes("bricks"))} KB`);
console.log(`sky, shared          ${kb(shared)} KB`);
for (const id of Object.keys(scenes)) {
  const all = kb((f) => f.includes(`shell/art/${id}/`));
  const two = kb((f) => f.includes(`shell/art/${id}/`) && !/-(golden|dusk)\.png$/.test(f));
  console.log(`${id.padEnd(20)} ${all} KB in all, about ${two} KB on show at any one time`);
}
console.log(`wrote ${path.relative(ROOT, path.join(SHELL_ART, "index.ts"))}`);
