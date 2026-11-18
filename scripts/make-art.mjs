#!/usr/bin/env node
/**
 * Generates ogchat's pixel art. No dependencies: it draws into small RGBA
 * buffers and writes PNGs by hand.
 *
 *   npm run art
 *
 * The drawing code lives in scripts/art/:
 *   bricks.mjs     the wall the chat sits on        -> src/components/chat/art/bricks.png
 *   skyline.mjs    scene one, the harbour by day    -> src/components/shell/art/*.png
 *   brooklyn.mjs   scene two, a block at dusk       -> src/components/shell/art/brooklyn/*.png
 *   lib.mjs        the canvas, PNG writer and shared pieces (clouds, smoke, birds)
 *
 * Each scene is a stack of layers drawn at 640x360 and scaled up in CSS with
 * hard pixels: sky, two cloud strips, the skyline, the rooftops in front,
 * three "lights" layers that are switched on and off, and a traffic strip.
 * Where the moving pieces sit is written to scenes.json, which Backdrop.tsx
 * reads. The output is committed, so this only needs running after a change,
 * and it is seeded: the same script always draws the same pictures.
 */
import fs from "node:fs";
import path from "node:path";
import { birds, CHAT_ART, ROOT, SHELL_ART, smoke, writePng, written } from "./art/lib.mjs";
import { bricks } from "./art/bricks.mjs";
import { brooklynScene } from "./art/brooklyn.mjs";
import { skylineScene } from "./art/skyline.mjs";

writePng(path.join(CHAT_ART, "bricks.png"), bricks());

const puff = smoke();
writePng(path.join(SHELL_ART, "smoke.png"), puff.canvas);
writePng(path.join(SHELL_ART, "birds.png"), birds());

const scenes = { skyline: skylineScene(puff), brooklyn: brooklynScene(puff) };
const config = {};
for (const [id, scene] of Object.entries(scenes)) {
  const dir = id === "skyline" ? SHELL_ART : path.join(SHELL_ART, id);
  for (const [name, image] of Object.entries(scene.images)) writePng(path.join(dir, name), image);
  config[id] = scene.config;
}
fs.writeFileSync(path.join(SHELL_ART, "scenes.json"), `${JSON.stringify(config, null, 2)}\n`);

for (const { file, size, bytes } of written)
  console.log(`${file.padEnd(52)} ${size.padEnd(9)} ${bytes} bytes`);
const total = (prefix) => written.filter((w) => prefix(w.file)).reduce((n, w) => n + w.bytes, 0);
const shared = total((f) => /(smoke|birds)\.png$/.test(f));
console.log(`wall ${Math.round(total((f) => f.includes("bricks")) / 1024)} KB`);
console.log(
  `skyline scene ${Math.round((shared + total((f) => f.includes("shell/art/") && !f.includes("brooklyn") && !/(smoke|birds)/.test(f))) / 1024)} KB`,
);
console.log(
  `brooklyn scene ${Math.round((shared + total((f) => f.includes("brooklyn"))) / 1024)} KB`,
);
console.log(`wrote ${path.relative(ROOT, path.join(SHELL_ART, "scenes.json"))}`);
