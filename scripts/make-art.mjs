#!/usr/bin/env node
/**
 * Generates ogchat's pixel art. No dependencies: it draws into a small RGBA
 * buffer and writes PNGs by hand.
 *
 *   npm run art
 *
 * Outputs (committed, so you only need to run this after changing it):
 *   src/components/shell/art/skyline.png   the city behind the interface
 *   src/components/chat/art/bricks.png     the tileable wall the chat sits on
 *
 * Both are drawn tiny and scaled up in CSS with `image-rendering: pixelated`.
 * Everything is seeded, so the same script always produces the same picture.
 * Change the palettes below to recolor the city or the wall.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------------ helpers

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const set = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const get = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const rect = (x, y, rw, rh, c) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, c);
  };
  return { w, h, data, set, get, rect };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function writePng(file, c) {
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.data.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log(`${path.relative(ROOT, file)}  ${c.w}x${c.h}  ${png.length} bytes`);
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

// ------------------------------------------------------------------ the wall

/**
 * A tile of running-bond brickwork in muted light browns. Contrast between
 * bricks and mortar is kept low on purpose: black text has to read on it.
 */
function bricks() {
  const BRICK_W = 16; // including 1px of mortar
  const BRICK_H = 8;
  const COLS = 8;
  const ROWS = 8;
  const c = canvas(BRICK_W * COLS, BRICK_H * ROWS);
  const rand = rng(1898);
  const mortar = hex("#b59a78");
  const tones = [
    "#cdb391",
    "#c9ad8a",
    "#c4a783",
    "#d1b896",
    "#c7aa88",
    "#ccb08c",
    "#c2a580",
    "#cfb694",
  ].map(hex);
  const warm = hex("#c6a183"); // the odd redder brick

  c.rect(0, 0, c.w, c.h, mortar);
  for (let row = 0; row < ROWS; row++) {
    const offset = row % 2 ? BRICK_W / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      const base = rand() < 0.1 ? warm : tones[Math.floor(rand() * tones.length)];
      const x0 = col * BRICK_W + offset;
      const y0 = row * BRICK_H;
      for (let y = 0; y < BRICK_H - 1; y++) {
        for (let x = 0; x < BRICK_W - 1; x++) {
          let color = base;
          if (y === 0)
            color = shade(base, 1.035); // lit top edge
          else if (y === BRICK_H - 2) color = shade(base, 0.965); // shaded bottom edge
          const speck = rand();
          if (speck < 0.05) color = shade(color, 0.95);
          else if (speck > 0.96) color = shade(color, 1.04);
          c.set((x0 + x) % c.w, y0 + y, color);
        }
      }
    }
  }
  return c;
}

// ------------------------------------------------------------------ the city

function skyline() {
  const W = 480;
  const H = 270;
  const c = canvas(W, H);
  const rand = rng(718);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

  // --- sky: banded blues, dithered into each other
  const sky = ["#4c82b8", "#5c91c3", "#70a2cd", "#88b4d8", "#a2c6e2", "#bdd8ea", "#d3e4ee"].map(
    hex,
  );
  const HORIZON = 236;
  for (let y = 0; y < H; y++) {
    const t = Math.min(0.999, y / HORIZON) * (sky.length - 1);
    const lower = Math.floor(t);
    for (let x = 0; x < W; x++) {
      const upper = t - lower > BAYER[y % 4][x % 4] ? lower + 1 : lower;
      c.set(x, y, sky[Math.min(upper, sky.length - 1)]);
    }
  }

  // --- a pale sun
  const sun = hex("#f0deA0".toLowerCase());
  const SUN = { x: 388, y: 64, r: 13 };
  for (let y = -SUN.r - 3; y <= SUN.r + 3; y++) {
    for (let x = -SUN.r - 3; x <= SUN.r + 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= SUN.r) c.set(SUN.x + x, SUN.y + y, d < SUN.r - 3 ? hex("#f4e6b4") : sun);
      else if (d <= SUN.r + 3 && BAYER[(y + 64) % 4][(x + 64) % 4] > 0.6)
        c.set(SUN.x + x, SUN.y + y, hex("#e2dcc0"));
    }
  }

  // --- clouds: stacked slabs
  const cloud = (cx, cy, s) => {
    const rows = [
      [3, 7],
      [1, 13],
      [-2, 19],
      [-4, 24],
      [-3, 21],
    ];
    rows.forEach(([dx, len], i) => {
      const color = i < 3 ? hex("#f4f1e8") : i === 3 ? hex("#e4e9ea") : hex("#cfdbe3");
      c.rect(cx + dx * s, cy + i * s, len * s, s, color);
    });
  };
  cloud(36, 30, 2);
  cloud(150, 58, 1);
  cloud(236, 22, 2);
  cloud(330, 96, 1);
  cloud(430, 34, 1);
  cloud(96, 104, 1);

  // --- far skyline: hazy blue silhouettes
  const haze = ["#86a5c2", "#8dabc6", "#7f9fbd", "#93b0ca"].map(hex);
  const GROUND = 240;
  for (let x = -4; x < W;) {
    const w = between(9, 22);
    const h = between(42, 96);
    const color = pick(haze);
    c.rect(x, GROUND - h, w, h, color);
    if (rand() < 0.3) c.rect(x + 2, GROUND - h - 6, Math.max(2, w - 5), 6, color);
    if (rand() < 0.2) c.rect(x + Math.floor(w / 2), GROUND - h - 14, 1, 14, color);
    // faint window rows
    for (let wy = GROUND - h + 4; wy < GROUND - 4; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4)
        if (rand() < 0.5) c.set(wx, wy, shade(color, 0.93));
    }
    x += w;
  }

  // landmark towers, still in haze
  const tower = (x, color, parts, spire) => {
    let y = GROUND;
    for (const [w, h] of parts) {
      y -= h;
      c.rect(x - Math.floor(w / 2), y, w, h, color);
      c.rect(x + Math.floor(w / 2) - 1, y, 1, h, shade(color, 0.92));
    }
    c.rect(x, y - spire, 1, spire, color);
    return y;
  };
  // stepped deco tower with a mast
  tower(
    132,
    hex("#7493b3"),
    [
      [20, 118],
      [14, 16],
      [10, 12],
      [6, 10],
      [2, 8],
    ],
    14,
  );
  // tapered glass tower
  tower(
    46,
    hex("#7b9ab9"),
    [
      [18, 96],
      [16, 22],
      [12, 20],
      [8, 14],
    ],
    20,
  );
  // arched crown
  const crownTop = tower(
    214,
    hex("#7896b6"),
    [
      [14, 104],
      [12, 6],
      [10, 5],
      [8, 5],
      [6, 4],
      [4, 4],
      [2, 4],
    ],
    12,
  );
  for (let i = 0; i < 4; i++) c.set(214 - 2 + i, crownTop + 8 + i * 5, hex("#a9c3d8"));
  tower(
    352,
    hex("#7e9dbb"),
    [
      [16, 110],
      [10, 10],
      [6, 8],
    ],
    10,
  );

  // --- mid layer: the city in color
  const bodies = [
    "#8f4a38", // brick red
    "#7a3b2c", // mud brick
    "#9a5a42",
    "#6f5a48", // brownstone
    "#b89a74", // tan
    "#c9b48e",
    "#5d7460", // muted green
    "#4c6352",
    "#55708a", // slate blue
    "#6b859c",
    "#b3963f", // mustard
    "#3d4046", // charcoal
    "#d6c8a6", // cream
  ].map(hex);
  const litColors = ["#ecd680", "#dfc060", "#f1e2a2"].map(hex);

  const waterTower = (x, y, s) => {
    const wood = hex("#5a4232");
    c.rect(x, y - 3 * s, 1, 3 * s, hex("#2a2422"));
    c.rect(x + 5 * s - 1, y - 3 * s, 1, 3 * s, hex("#2a2422"));
    c.rect(x, y - 3 * s - 5 * s, 5 * s, 5 * s, wood);
    c.rect(x, y - 3 * s - 3 * s, 5 * s, 1, shade(wood, 0.75));
    c.rect(x + 5 * s - 1, y - 8 * s, 1, 5 * s, shade(wood, 0.8));
    for (let i = 0; i < 3; i++) c.rect(x + i, y - 8 * s - 1 - i, 5 * s - i * 2, 1, hex("#3a2c24"));
  };

  const windows = (x, y, w, h, color, opts) => {
    const { ww, wh, gapX, gapY, lit } = opts;
    const dark = shade(color, 0.7);
    const glass = hex("#3f566b");
    const useGlass = rand() < 0.35;
    for (let wy = y + 4; wy + wh < y + h - 3; wy += wh + gapY) {
      for (let wx = x + 3; wx + ww < x + w - 2; wx += ww + gapX) {
        const on = rand() < lit;
        c.rect(wx, wy, ww, wh, on ? pick(litColors) : useGlass ? glass : dark);
      }
    }
  };

  for (let x = -6; x < W;) {
    const w = between(16, 36);
    const h = between(58, 138);
    const color = pick(bodies);
    const top = GROUND - h;
    c.rect(x, top, w, h, color);
    c.rect(x + w - 2, top, 2, h, shade(color, 0.82)); // shaded side
    c.rect(x, top, w, 1, shade(color, 1.12)); // parapet
    windows(x, top, w, h, color, { ww: 2, wh: 3, gapX: 3, gapY: 3, lit: 0.22 });
    const roof = rand();
    if (roof < 0.3) waterTower(x + between(2, Math.max(2, w - 8)), top, 1);
    else if (roof < 0.48)
      c.rect(x + between(3, w - 4), top - between(8, 18), 1, 18, hex("#2a2826"));
    else if (roof < 0.66) {
      const sw = Math.max(6, w - between(8, 14));
      const sh = between(8, 20);
      const sx = x + Math.floor((w - sw) / 2);
      c.rect(sx, top - sh, sw, sh, shade(color, 0.94));
      c.rect(sx, top - sh, sw, 1, shade(color, 1.1));
      windows(sx, top - sh - 2, sw, sh + 2, color, { ww: 2, wh: 3, gapX: 3, gapY: 3, lit: 0.2 });
    }
    x += w + between(0, 2);
  }

  // --- smokestacks and their smoke (the Jersey side)
  const stack = (x, h) => {
    const base = GROUND;
    c.rect(x, base - h, 5, h, hex("#8a8078"));
    c.rect(x + 4, base - h, 1, h, hex("#6b625b"));
    for (let i = 0; i < 3; i++)
      c.rect(x, base - h + 3 + i * 8, 5, 3, i % 2 ? hex("#e9e2d2") : hex("#8a3324"));
    const puffs = [
      [1, -6, 5],
      [4, -12, 7],
      [9, -18, 9],
      [16, -23, 10],
      [26, -27, 9],
    ];
    for (const [dx, dy, r] of puffs) {
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          if (Math.hypot(xx, yy * 1.5) > r) continue;
          const px = x + 2 + dx + xx;
          const py = base - h + dy + yy;
          if (BAYER[(py + 400) % 4][(px + 400) % 4] < 0.72)
            c.set(px, py, yy < 0 ? hex("#e6e3da") : hex("#c9cdd0"));
        }
      }
    }
  };
  stack(86, 118);
  stack(98, 104);

  // --- river
  const WATER_TOP = GROUND;
  const water = ["#4f7391", "#5a7f9c", "#476a88"].map(hex);
  for (let y = WATER_TOP; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let color = water[(Math.floor(x / 7) + y) % water.length];
      if ((x + y * 3) % 11 === 0 && y % 2 === 0) color = hex("#9dbdd3");
      c.set(x, y, color);
    }
  }

  // --- the bridge: stone towers with pointed arches, cables, a deck
  const DECK = 222;
  const stone = hex("#8a7560");
  const cable = hex("#3a322c");
  const bridgeTower = (x) => {
    const w = 24;
    const top = 150;
    for (let y = top; y < 252; y++) {
      for (let dx = 0; dx < w; dx++) {
        // two pointed arch openings between y 168 and the deck
        const local = dx < w / 2 ? dx : dx - w / 2;
        const inArchX = local >= 3 && local <= 8;
        const archTop = 172 + Math.abs(local - 5.5) * 2.4;
        if (inArchX && y >= archTop && y < DECK - 1) continue;
        let color = stone;
        if (dx >= w - 3) color = shade(stone, 0.78);
        if ((y + (dx % 2)) % 6 === 0) color = shade(color, 0.9); // coursing
        c.set(x + dx, y, color);
      }
    }
    c.rect(x - 1, top - 2, w + 2, 3, shade(stone, 1.12)); // cap
    c.rect(x - 1, 196, w + 2, 2, shade(stone, 0.85));
  };
  const T1 = 300;
  const T2 = 428;
  // cables first, towers over them
  const hang = (x0, y0, x1, y1, sag) => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      const y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t);
      c.set(x, y, cable);
      c.set(x, y + 1, cable);
      if (x % 4 === 0)
        for (let yy = Math.round(y) + 2; yy < DECK; yy += 2) c.set(x, yy, shade(cable, 1.5));
    }
  };
  hang(T1 + 12, 152, T2 + 12, 152, 58); // main span
  hang(228, DECK - 2, T1 + 12, 152, -6); // left approach
  hang(T2 + 12, 152, W + 40, DECK + 6, -8); // right approach
  c.rect(220, DECK, W - 220, 4, hex("#2c2826"));
  c.rect(220, DECK, W - 220, 1, hex("#6a5f55"));
  for (let x = 222; x < W; x += 6) c.rect(x, DECK + 4, 1, 3, hex("#2c2826"));
  bridgeTower(T1);
  bridgeTower(T2);

  // --- near layer: dark rooftops along the bottom edge
  const near = [
    "#5e281d",
    "#6f3022",
    "#7a3b2c",
    "#2a211e",
    "#33423a",
    "#3b4a5c",
    "#4a3a2c",
    "#1c1917",
  ].map(hex);
  for (let x = -8; x < W;) {
    const w = between(24, 46);
    const h = between(20, 54);
    const color = pick(near);
    const top = H - h;
    c.rect(x, top, w, h, color);
    // brick coursing
    for (let y = top + 3; y < H; y += 4) {
      for (let bx = x + ((y / 4) % 2 ? 0 : 3); bx < x + w; bx += 6)
        c.set(bx, y, shade(color, 0.82));
    }
    c.rect(x, top, w, 2, shade(color, 1.3)); // cornice
    c.rect(x + w - 2, top + 2, 2, h, shade(color, 0.7));
    for (let wy = top + 6; wy + 4 < H; wy += 9) {
      for (let wx = x + 4; wx + 3 < x + w - 3; wx += 7) {
        c.rect(wx, wy, 3, 4, rand() < 0.3 ? pick(litColors) : hex("#14110f"));
        c.rect(wx - 1, wy + 4, 5, 1, shade(color, 1.35)); // sill
      }
    }
    const extra = rand();
    if (extra < 0.35) waterTower(x + between(3, w - 14), top, 2);
    else if (extra < 0.55) {
      // fire escape
      const fx = x + between(4, Math.max(4, w - 16));
      for (let y = top + 8; y < H; y += 9) {
        c.rect(fx, y, 11, 1, hex("#0c0b0a"));
        for (let i = 0; i < 8; i++) c.set(fx + 1 + i, y + 1 + i, hex("#0c0b0a"));
      }
    } else if (extra < 0.7) {
      c.rect(x + 4, top - 6, 6, 6, shade(color, 0.85)); // chimney
      c.rect(x + 3, top - 7, 8, 1, shade(color, 1.2));
    }
    x += w;
  }

  return c;
}

writePng(path.join(ROOT, "src/components/chat/art/bricks.png"), bricks());
writePng(path.join(ROOT, "src/components/shell/art/skyline.png"), skyline());
