#!/usr/bin/env node
/**
 * Generates ogchat's pixel art. No dependencies: it draws into small RGBA
 * buffers and writes PNGs by hand.
 *
 *   npm run art
 *
 * Outputs (committed, so you only need to run this after changing it):
 *
 *   src/components/chat/art/bricks.png     the worn, tileable wall the chat sits on
 *   src/components/shell/art/              the city behind the interface, in layers:
 *     sky.png          dusty blue sky and sun
 *     clouds-far.png   } two seamless strips that drift at different speeds
 *     clouds-near.png  }
 *     skyline.png      distant towers, the city, the bridge, the river
 *     rooftops.png     the dark rooftops along the bottom edge
 *     lights-*.png     windows and water glints that switch on and off
 *     smoke.png        6 frames of smoke for the stacks
 *     traffic.png      head and tail lights crossing the bridge
 *     birds.png        2 frames of a small flock
 *
 * Everything is drawn tiny (the scene is 640x360) and scaled up in CSS with
 * `image-rendering: pixelated`. The motion is done in CSS by sliding and
 * toggling these layers (see Backdrop.tsx); there is no video and no script
 * running. Everything is seeded, so the same script always draws the same city.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL_ART = path.join(ROOT, "src/components/shell/art");
const CHAT_ART = path.join(ROOT, "src/components/chat/art");

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

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** The gritty pass: every city color goes about 15% darker and a little dustier. */
const DUST = hex("#6b6258");
const grit = (c) => mix(shade(c, 0.86), DUST, 0.07);
const G = (h) => grit(hex(h));

/** A transparent canvas. Pixels are opaque once drawn. */
function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const set = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (!inside(x, y)) return;
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const get = (x, y) => {
    if (!inside(x, y)) return null;
    const i = (y * w + x) * 4;
    return data[i + 3] ? [data[i], data[i + 1], data[i + 2]] : null;
  };
  /** Multiplies an existing pixel's color; does nothing on transparent pixels. */
  const tint = (x, y, f) => {
    const c = get(x, y);
    if (c) set(x, y, shade(c, f));
  };
  const rect = (x, y, rw, rh, c) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, c);
  };
  return { w, h, data, set, get, tint, rect };
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

let totalBytes = 0;

function writePng(file, c) {
  const stride = c.w * 4 + 1;
  const raw = Buffer.alloc(stride * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * stride] = 0;
    Buffer.from(c.data.buffer, y * c.w * 4, c.w * 4).copy(raw, y * stride + 1);
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
  totalBytes += png.length;
  console.log(
    `${path.relative(ROOT, file).padEnd(44)} ${`${c.w}x${c.h}`.padEnd(9)} ${png.length} bytes`,
  );
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));
const bayer = (x, y) => BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4];

// ------------------------------------------------------------------ the wall

/**
 * A tile of old running-bond brickwork in muted light browns: chipped corners,
 * hairline cracks, soot, salt bloom, drip marks, the odd replaced brick.
 * The wear is kept shallow on purpose, because black text has to read on it.
 */
function bricks() {
  const BW = 16; // brick pitch, including 1px of mortar
  const BH = 8;
  // A big tile (320x320), so the same crack does not come round again within one wall.
  const COLS = 20;
  const ROWS = 40;
  const W = BW * COLS;
  const H = BH * ROWS;
  const c = canvas(W, H);
  const rand = rng(1898);
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const wrap = (x, y) => [((x % W) + W) % W, ((y % H) + H) % H];
  const put = (x, y, color) => c.set(...wrap(x, y), color);
  const tint = (x, y, f) => c.tint(...wrap(x, y), f);

  const mortar = hex("#9d8567");
  const tones = [
    "#b39b7b",
    "#af9676",
    "#aa9170",
    "#b7a080",
    "#ad9474",
    "#b29979",
    "#a68d6c",
    "#b89f7e",
    "#a99273",
  ].map(hex);
  const replaced = hex("#a67a63"); // a later, redder brick
  const sooty = hex("#96806a");

  c.rect(0, 0, W, H, mortar);
  const isMortar = new Uint8Array(W * H).fill(1);

  for (let row = 0; row < ROWS; row++) {
    const offset = row % 2 ? BW / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      const roll = rand();
      const base =
        roll < 0.05 ? replaced : roll < 0.09 ? sooty : tones[Math.floor(rand() * tones.length)];
      const x0 = col * BW + offset;
      const y0 = row * BH;
      // A chipped corner or a broken edge on some bricks: the mortar shows through.
      const chip = rand();
      const corner = between(0, 3);
      const chipSize = chip < 0.06 ? between(3, 5) : chip < 0.24 ? between(1, 2) : 0;
      for (let y = 0; y < BH - 1; y++) {
        for (let x = 0; x < BW - 1; x++) {
          const dx = corner % 2 ? BW - 2 - x : x;
          const dy = corner > 1 ? BH - 2 - y : y;
          if (chipSize && dx + dy < chipSize) continue;
          let color = base;
          if (y === 0)
            color = shade(base, 1.04); // lit top edge
          else if (y === BH - 2) color = shade(base, 0.95); // shaded bottom edge
          const speck = rand();
          if (speck < 0.07) color = shade(color, 0.93);
          else if (speck < 0.085)
            color = shade(color, 0.84); // pit
          else if (speck > 0.955) color = shade(color, 1.05);
          put(x0 + x, y0 + y, color);
          const [wx, wy] = wrap(x0 + x, y0 + y);
          isMortar[wy * W + wx] = 0;
        }
      }
    }
  }

  // Eroded and mossy mortar.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isMortar[y * W + x]) continue;
      const roll = rand();
      if (roll < 0.07) c.tint(x, y, 0.82);
      else if (roll < 0.085) c.set(x, y, hex("#8c8a68"));
    }
  }

  // Soot and damp: soft dark patches. Salt bloom: soft pale ones.
  const blob = (cx, cy, rx, ry, factor) => {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = Math.hypot(x / rx, y / ry);
        if (d > 1) continue;
        if (1 - d > bayer(cx + x, cy + y) * 1.15) tint(cx + x, cy + y, factor);
      }
    }
  };
  for (let i = 0; i < 26; i++)
    blob(between(0, W), between(0, H), between(14, 38), between(9, 22), 0.93);
  for (let i = 0; i < 12; i++)
    blob(between(0, W), between(0, H), between(10, 26), between(6, 13), 1.06);

  // Spalling: patches where the brick faces have flaked, left rough and pale.
  for (let i = 0; i < 5; i++) {
    const cx = between(0, W);
    const cy = between(0, H);
    const rx = between(9, 18);
    const ry = between(5, 10);
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = Math.hypot(x / rx, y / ry);
        if (d > 1 || rand() < d * 0.7) continue;
        tint(cx + x, cy + y, rand() < 0.5 ? 1.07 : 0.9);
      }
    }
  }

  // Drip marks running down from a course.
  for (let i = 0; i < 30; i++) {
    const x = between(0, W);
    const top = between(0, ROWS - 1) * BH;
    const length = between(18, 58);
    const width = between(1, 2);
    for (let y = 0; y < length; y++) {
      for (let dx = 0; dx < width; dx++) {
        if (1 - y / length > bayer(x + dx, top + y) * 0.9) tint(x + dx, top + y, 0.91);
      }
    }
  }

  // Hairline cracks: a jagged dark line with a thin lit edge beside it.
  for (let i = 0; i < 11; i++) {
    let x = between(10, W - 10);
    let y = between(0, H);
    const length = between(22, 74);
    let drift = rand() < 0.5 ? -1 : 1;
    for (let step = 0; step < length; step++) {
      tint(x, y, 0.66);
      tint(x + 1, y, 1.05);
      const roll = rand();
      if (roll < 0.3) x += drift;
      else if (roll < 0.36) drift = -drift;
      if (roll > 0.2) y += 1;
    }
  }

  return c;
}

// ------------------------------------------------------------------ the city

const W = 640;
const H = 360;
const GROUND = 320; // where the buildings stand and the river begins
const DECK = 296; // the bridge roadway
const BRIDGE_LEFT = 300;
const TOWER_1 = 400;
const TOWER_2 = 570;
const TOWER_W = 32;
const TOWER_TOP = 200;
const STACKS = [
  { x: 166, h: 150 },
  { x: 183, h: 130 },
];

function sky() {
  const c = canvas(W, H);
  const rand = rng(11);
  // Deep, dusty blue overhead, sinking into a band of yellow-grey haze.
  const bands = [
    "#3d6a98",
    "#4877a4",
    "#5785ae",
    "#6b93b5",
    "#84a2b8",
    "#9fb0b6",
    "#b5b8aa",
    "#c2b998",
  ].map(hex);
  for (let y = 0; y < H; y++) {
    const t = Math.min(0.999, y / (GROUND - 4)) * (bands.length - 1);
    const lower = Math.floor(t);
    for (let x = 0; x < W; x++) {
      const upper = t - lower > bayer(x, y) ? lower + 1 : lower;
      let color = bands[Math.min(upper, bands.length - 1)];
      const grain = rand();
      if (grain < 0.012) color = shade(color, 0.95);
      else if (grain > 0.99) color = shade(color, 1.04);
      c.set(x, y, color);
    }
  }
  // A sun behind the haze.
  const SUN = { x: 516, y: 92, r: 17 };
  for (let y = -SUN.r - 9; y <= SUN.r + 9; y++) {
    for (let x = -SUN.r - 9; x <= SUN.r + 9; x++) {
      const d = Math.hypot(x, y);
      const px = SUN.x + x;
      const py = SUN.y + y;
      if (d <= SUN.r - 4) c.set(px, py, hex("#ecdcaa"));
      else if (d <= SUN.r) c.set(px, py, hex("#e2cd92"));
      else if (d <= SUN.r + 9 && 1 - (d - SUN.r) / 9 > bayer(px, py) * 1.3)
        c.set(px, py, hex("#cfc6a0"));
    }
  }
  return c;
}

/** A seamless strip of clouds, built from overlapping lobes with a flat, dirty underside. */
function clouds(seed, height, count, scale) {
  const c = canvas(W, height);
  const rand = rng(seed);
  const between = (a, b) => a + rand() * (b - a);
  const top = hex("#eae6da");
  const body = hex("#d3d4cf");
  const under = hex("#a3adb1");
  const belly = hex("#8795a0");
  for (let n = 0; n < count; n++) {
    const cx = Math.round((n + between(0.15, 0.85)) * (W / count));
    const base = Math.round(between(height * 0.3, height - 4));
    const lobes = Math.round(between(3, 6));
    const span = between(26, 58) * scale;
    const shapes = [];
    for (let i = 0; i < lobes; i++) {
      const t = lobes === 1 ? 0.5 : i / (lobes - 1);
      const r = between(6, 13) * scale * (1 - Math.abs(t - 0.5) * 0.9);
      shapes.push({ x: cx + (t - 0.5) * span, y: base - r * 0.72, r });
    }
    const minY = Math.floor(Math.min(...shapes.map((s) => s.y - s.r)));
    for (let y = minY; y <= base; y++) {
      for (let x = Math.floor(cx - span); x <= cx + span; x++) {
        if (!shapes.some((s) => Math.hypot(x - s.x, (y - s.y) * 1.25) <= s.r)) continue;
        const depth = (y - minY) / Math.max(1, base - minY); // 0 at the top, 1 at the flat base
        let color = body;
        if (depth < 0.34) color = top;
        else if (depth > 0.86) color = depth - 0.86 > bayer(x, y) * 0.16 ? belly : under;
        else if (depth > 0.62) color = (depth - 0.62) / 0.24 > bayer(x, y) ? under : body;
        c.set(((x % W) + W) % W, y, color);
      }
    }
  }
  return c;
}

function city() {
  const skyline = canvas(W, H);
  const rooftops = canvas(W, H);
  const lights = { a: canvas(W, H), b: canvas(W, H), c: canvas(W, H) };
  const rand = rng(718);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

  const lit = ["#e3cd78", "#d4b658", "#e9d998", "#c9a24c"].map(hex);
  const iron = G("#2b2724");

  /** Grime: streaks running down from the roofline, and a few damp blotches. */
  const weather = (c, x, y, w, h) => {
    for (let dx = 0; dx < w; dx++) {
      if (rand() > 0.22) continue;
      const length = between(4, Math.max(6, Math.floor(h * 0.55)));
      for (let dy = 0; dy < length; dy++) {
        if (1 - dy / length > bayer(x + dx, y + dy)) c.tint(x + dx, y + dy, 0.87);
      }
    }
    for (let n = 0; n < Math.ceil((w * h) / 900); n++) {
      const bx = x + between(0, w - 1);
      const by = y + between(0, h - 1);
      const r = between(3, 7);
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          const px = bx + xx;
          const py = by + yy;
          if (px < x || px >= x + w || py < y || py >= y + h) continue;
          if (1 - Math.hypot(xx, yy) / r > bayer(px, py) * 1.2)
            c.tint(px, py, rand() < 0.75 ? 0.9 : 1.07);
        }
      }
    }
  };

  const waterTower = (c, x, y, s) => {
    const wood = pick([G("#5c4434"), G("#6a4a36"), G("#4f3d31")]);
    const legs = 3 * s;
    const tank = 5 * s;
    c.rect(x, y - legs, 1, legs, iron);
    c.rect(x + tank - 1, y - legs, 1, legs, iron);
    if (s > 1) c.rect(x + Math.floor(tank / 2), y - legs, 1, legs, iron);
    c.rect(x - 1, y - legs, tank + 2, 1, iron);
    c.rect(x, y - legs - tank, tank, tank, wood);
    for (let band = 1; band < tank; band += Math.max(2, s + 1))
      c.rect(x, y - legs - band, tank, 1, shade(wood, 0.7));
    c.rect(x + tank - 1, y - legs - tank, 1, tank, shade(wood, 0.78));
    for (let dy = 0; dy < tank; dy++)
      if (rand() < 0.5) c.tint(x + between(0, tank - 1), y - legs - tank + dy, 0.82); // rust
    for (let i = 0; i < 2 + s; i++)
      c.rect(x + i, y - legs - tank - 1 - i, tank - i * 2, 1, G("#3b2d26"));
  };

  /** A grid of windows. Some dark ones are also noted for the flicker layers. */
  const windows = (c, x, y, w, h, color, o) => {
    const dark = shade(color, 0.62);
    const glass = pick([G("#3f566b"), G("#34485a"), G("#2a2f33")]);
    const useGlass = rand() < 0.4;
    for (let wy = y + o.top; wy + o.wh < y + h - 3; wy += o.wh + o.gapY) {
      for (let wx = x + o.left; wx + o.ww < x + w - 2; wx += o.ww + o.gapX) {
        const on = rand() < o.lit;
        const tone = pick(lit);
        c.rect(wx, wy, o.ww, o.wh, on ? tone : useGlass ? glass : dark);
        if (on && o.wh > 3 && rand() < 0.4) c.rect(wx, wy, o.ww, 1, shade(tone, 0.72)); // a blind
        if (o.sill) c.rect(wx - 1, wy + o.wh, o.ww + 2, 1, shade(color, 1.3));
        c.tint(wx, wy + o.wh + (o.sill ? 1 : 0), 0.84); // stain under the window
        c.tint(wx, wy + o.wh + (o.sill ? 2 : 1), 0.92);
        if (!on && o.flicker && rand() < o.flickerRate && o.flicker.allowed(wx, wy)) {
          o.flicker.layer().rect(wx, wy, o.ww, o.wh, pick(lit));
        }
      }
    }
  };

  // --- far skyline: hazy blue-grey silhouettes
  const haze = ["#7691a8", "#7d97ad", "#6e8aa3", "#8299ad"].map(hex);
  for (let x = -6; x < W;) {
    const w = between(11, 28);
    const h = between(54, 126);
    const color = pick(haze);
    skyline.rect(x, GROUND - h, w, h, color);
    if (rand() < 0.35) skyline.rect(x + 2, GROUND - h - 8, Math.max(3, w - 6), 8, color);
    if (rand() < 0.25) skyline.rect(x + Math.floor(w / 2), GROUND - h - 18, 1, 18, color);
    for (let wy = GROUND - h + 5; wy < GROUND - 5; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4)
        if (rand() < 0.55) skyline.set(wx, wy, shade(color, 0.9));
    }
    x += w;
  }
  const landmark = (x, color, parts, spire) => {
    let y = GROUND;
    for (const [w, h] of parts) {
      y -= h;
      const left = x - Math.floor(w / 2);
      skyline.rect(left, y, w, h, color);
      skyline.rect(left + w - 2, y, 2, h, shade(color, 0.9));
      for (let wy = y + 3; wy < y + h - 2; wy += 4) {
        for (let wx = left + 2; wx < left + w - 3; wx += 3)
          if (rand() < 0.6) skyline.set(wx, wy, shade(color, 0.88));
      }
    }
    skyline.rect(x, y - spire, 1, spire, color);
    return y - spire;
  };
  const beacons = [];
  // stepped deco tower with a mast
  beacons.push([
    118,
    landmark(
      118,
      hex("#627f9b"),
      [
        [26, 158],
        [18, 22],
        [12, 16],
        [8, 12],
        [3, 10],
      ],
      20,
    ),
  ]);
  // tapered glass tower
  landmark(
    44,
    hex("#6986a0"),
    [
      [24, 128],
      [20, 30],
      [16, 26],
      [10, 18],
    ],
    26,
  );
  // arched crown
  landmark(
    292,
    hex("#6683a0"),
    [
      [18, 138],
      [16, 8],
      [13, 7],
      [10, 6],
      [7, 6],
      [4, 5],
      [2, 5],
    ],
    16,
  );
  landmark(
    476,
    hex("#6c88a2"),
    [
      [22, 146],
      [14, 14],
      [8, 10],
    ],
    14,
  );

  // --- mid layer: the city in color, worn
  const bodies = [
    "#8f4a38", // brick red
    "#7a3b2c", // mud brick
    "#9a5a42",
    "#6f5a48", // brownstone
    "#b89a74", // tan
    "#c4ae88",
    "#5d7460", // muted green
    "#4c6352",
    "#55708a", // slate blue
    "#6b859c",
    "#ac8f3d", // mustard
    "#3d4046", // charcoal
    "#cdbf9e", // cream
  ].map(G);
  const midFlicker = {
    allowed: (x, y) => x < BRIDGE_LEFT - 4 || y < TOWER_TOP - 6, // never over the bridge
    layer: () => (rand() < 0.5 ? lights.a : lights.c),
  };

  for (let x = -8; x < W;) {
    const w = between(20, 46);
    const h = between(78, 184);
    const color = pick(bodies);
    const top = GROUND - h;
    const kind = rand();
    skyline.rect(x, top, w, h, color);
    weather(skyline, x, top, w, h);
    // brick coursing or panel lines, faint
    for (let y = top + 4; y < GROUND; y += kind < 0.6 ? 4 : 9) {
      for (let bx = x + (y % 8 ? 1 : 3); bx < x + w - 2; bx += 5) skyline.tint(bx, y, 0.93);
    }
    skyline.rect(x + w - 3, top, 3, h, shade(color, 0.78)); // shaded side
    skyline.rect(x, top, w, 2, shade(color, 1.16)); // parapet
    skyline.rect(x, top + 2, w, 1, shade(color, 0.8));
    if (kind < 0.6) {
      windows(skyline, x, top, w, h, color, {
        ww: 2,
        wh: 4,
        gapX: 3,
        gapY: 4,
        top: 7,
        left: 3,
        lit: 0.2,
        flicker: midFlicker,
        flickerRate: 0.1,
      });
    } else if (kind < 0.85) {
      windows(skyline, x, top, w, h, color, {
        ww: 3,
        wh: 3,
        gapX: 2,
        gapY: 3,
        top: 6,
        left: 3,
        lit: 0.16,
        flicker: midFlicker,
        flickerRate: 0.08,
      });
    } else {
      // office slab: long strips of glass
      for (let wy = top + 6; wy < GROUND - 6; wy += 6) {
        for (let wx = x + 3; wx < x + w - 5; wx++) {
          skyline.set(wx, wy, rand() < 0.14 ? pick(lit) : G("#33475a"));
          skyline.set(wx, wy + 1, G("#2a3b4b"));
        }
      }
    }
    // faded painted sign on the odd wall
    if (rand() < 0.12 && w > 28 && h > 110) {
      const sx = x + 4;
      const sy = top + between(14, 30);
      for (let yy = 0; yy < 15; yy++) {
        for (let xx = 0; xx < w - 10; xx++) {
          if (bayer(sx + xx, sy + yy) < 0.55)
            skyline.set(sx + xx, sy + yy, mix(color, hex("#cfc3a4"), 0.42));
        }
      }
      for (let line = 0; line < 2; line++) {
        for (let xx = 2; xx < w - 13; xx++)
          if (rand() < 0.7) skyline.set(sx + xx, sy + 4 + line * 5, shade(color, 0.6));
      }
    }
    const roof = rand();
    if (roof < 0.34)
      waterTower(skyline, x + between(2, Math.max(2, w - 9)), top, rand() < 0.3 ? 2 : 1);
    else if (roof < 0.5) {
      const ax = x + between(3, w - 5);
      const ah = between(10, 24);
      skyline.rect(ax, top - ah, 1, ah, iron);
      skyline.rect(ax - 2, top - ah + 3, 5, 1, iron);
      skyline.rect(ax - 1, top - ah + 7, 3, 1, iron);
    } else if (roof < 0.7) {
      const sw = Math.max(8, w - between(8, 16));
      const sh = between(10, 26);
      const sx = x + Math.floor((w - sw) / 2);
      skyline.rect(sx, top - sh, sw, sh, shade(color, 0.93));
      weather(skyline, sx, top - sh, sw, sh);
      skyline.rect(sx, top - sh, sw, 1, shade(color, 1.14));
      skyline.rect(sx + sw - 2, top - sh, 2, sh, shade(color, 0.76));
      windows(skyline, sx, top - sh - 2, sw, sh + 2, color, {
        ww: 2,
        wh: 3,
        gapX: 3,
        gapY: 3,
        top: 5,
        left: 3,
        lit: 0.2,
        flicker: midFlicker,
        flickerRate: 0.1,
      });
      if (rand() < 0.4) waterTower(skyline, sx + 2, top - sh, 1);
    } else if (roof < 0.84) {
      // rooftop plant: boxes and a vent
      skyline.rect(x + 3, top - 4, 7, 4, G("#7b7a74"));
      skyline.rect(x + 3, top - 4, 7, 1, G("#9a9890"));
      skyline.rect(x + w - 9, top - 7, 3, 7, G("#55524d"));
      skyline.rect(x + w - 10, top - 8, 5, 1, G("#6c6862"));
    }
    x += w + between(0, 2);
  }

  // --- smokestacks (their smoke is a separate, moving layer)
  for (const { x, h } of STACKS) {
    const top = GROUND - h;
    skyline.rect(x, top, 6, h, G("#8a8078"));
    skyline.rect(x + 4, top, 2, h, G("#655d56"));
    for (let i = 0; i < 4; i++)
      skyline.rect(x, top + 3 + i * 9, 6, 4, i % 2 ? G("#ddd6c6") : G("#8a3324"));
    skyline.rect(x - 1, top, 8, 1, G("#3a3531"));
    for (let dy = 40; dy < h; dy++)
      if (rand() < 0.3) skyline.tint(x + between(0, 5), top + dy, 0.82); // soot
  }

  // --- river
  const water = ["#3d5d78", "#476a86", "#365670", "#405f79"].map(hex);
  for (let y = GROUND; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let color = water[(Math.floor(x / 9) + y * 2) % water.length];
      if (bayer(x, y) < 0.14) color = shade(color, 0.9);
      skyline.set(x, y, color);
      if ((x * 7 + y * 13) % 29 === 0) skyline.set(x, y, hex("#7f9fb5"));
      const glint = rand();
      if (y % 2 === 0 && glint < 0.012) lights.a.rect(x, y, between(2, 4), 1, hex("#b9cfd9"));
      else if (y % 2 === 1 && glint < 0.012) lights.c.rect(x, y, between(2, 4), 1, hex("#a8c0cc"));
    }
  }

  // --- the bridge: stone towers with pointed arches, cables, a deck
  const stone = G("#8a7560");
  const cable = G("#3a322c");
  const bridgeTower = (x) => {
    for (let y = TOWER_TOP; y < GROUND + 16; y++) {
      for (let dx = 0; dx < TOWER_W; dx++) {
        const half = TOWER_W / 2;
        const local = dx < half ? dx : dx - half;
        const archTop = TOWER_TOP + 30 + Math.abs(local - (half - 1) / 2) * 3.2;
        if (local >= 4 && local <= half - 5 && y >= archTop && y < DECK - 1) continue; // arch opening
        let color = stone;
        if (dx >= TOWER_W - 4) color = shade(stone, 0.76);
        if (
          (y + (Math.floor(dx / 4) % 2) * 3) % 6 === 0 ||
          (dx + (Math.floor(y / 6) % 2) * 4) % 8 === 0
        ) {
          color = shade(color, 0.88); // stone coursing
        }
        if (rand() < 0.05) color = shade(color, 0.9);
        skyline.set(x + dx, y, color);
      }
    }
    weather(skyline, x, TOWER_TOP, TOWER_W, GROUND - TOWER_TOP);
    skyline.rect(x - 2, TOWER_TOP - 3, TOWER_W + 4, 4, shade(stone, 1.12)); // cap
    skyline.rect(x - 2, TOWER_TOP + 1, TOWER_W + 4, 1, shade(stone, 0.7));
    skyline.rect(x - 1, TOWER_TOP + 62, TOWER_W + 2, 2, shade(stone, 0.8));
  };
  const hang = (x0, y0, x1, y1, sag) => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
      skyline.set(x, y, cable);
      skyline.set(x, y + 1, cable);
      if (x % 4 === 0)
        for (let yy = y + 2; yy < DECK; yy += 2) skyline.set(x, yy, shade(cable, 1.55));
      if (x % 12 === 0) for (let yy = y + 2; yy < DECK; yy++) skyline.set(x, yy, shade(cable, 1.3));
    }
  };
  const mid1 = TOWER_1 + TOWER_W / 2;
  const mid2 = TOWER_2 + TOWER_W / 2;
  hang(mid1, TOWER_TOP + 3, mid2, TOWER_TOP + 3, 74); // main span
  hang(BRIDGE_LEFT, DECK - 3, mid1, TOWER_TOP + 3, -8); // left approach
  hang(mid2, TOWER_TOP + 3, W + 60, DECK + 10, -10); // right approach
  bridgeTower(TOWER_1);
  bridgeTower(TOWER_2);
  skyline.rect(BRIDGE_LEFT - 8, DECK, W - BRIDGE_LEFT + 8, 5, G("#2c2826")); // roadway, in front of the towers
  skyline.rect(BRIDGE_LEFT - 8, DECK, W - BRIDGE_LEFT + 8, 1, G("#6a5f55"));
  for (let x = BRIDGE_LEFT - 6; x < W; x += 6) skyline.rect(x, DECK + 5, 1, 4, G("#2c2826"));
  for (let x = BRIDGE_LEFT - 8; x < W; x += 3) skyline.set(x, DECK - 1, G("#4a423b")); // railing
  beacons.push([TOWER_1 + TOWER_W / 2, TOWER_TOP - 5], [TOWER_2 + TOWER_W / 2, TOWER_TOP - 5]);

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
    "#553024",
  ].map(G);
  const tags = ["#b9a04a", "#7e9a86", "#b0553d", "#8aa3b8", "#c9c2ae"].map(hex);
  const nearFlicker = { allowed: () => true, layer: () => lights.b };
  for (let x = -10; x < W;) {
    const w = between(32, 62);
    const h = between(28, 72);
    const color = pick(near);
    const top = H - h;
    rooftops.rect(x, top, w, h, color);
    weather(rooftops, x, top, w, h);
    for (let y = top + 4; y < H; y += 4) {
      for (let bx = x + ((y / 4) % 2 ? 0 : 4); bx < x + w; bx += 8) rooftops.tint(bx, y, 0.8); // coursing
    }
    rooftops.rect(x, top, w, 3, shade(color, 1.32)); // cornice
    for (let dx = 1; dx < w; dx += 3) rooftops.set(x + dx, top + 3, shade(color, 1.18)); // dentils
    rooftops.rect(x, top + 4, w, 1, shade(color, 0.66));
    rooftops.rect(x + w - 3, top + 3, 3, h, shade(color, 0.68));
    windows(rooftops, x, top + 4, w, h, color, {
      ww: 4,
      wh: 6,
      gapX: 5,
      gapY: 6,
      top: 5,
      left: 5,
      lit: 0.26,
      sill: true,
      flicker: nearFlicker,
      flickerRate: 0.16,
    });
    const extra = rand();
    if (extra < 0.3) waterTower(rooftops, x + between(4, w - 16), top, 2);
    else if (extra < 0.5) {
      // fire escape
      const fx = x + between(5, Math.max(5, w - 20));
      for (let y = top + 10; y < H; y += 12) {
        rooftops.rect(fx, y, 14, 1, hex("#0c0b0a"));
        rooftops.rect(fx, y - 4, 1, 4, hex("#0c0b0a"));
        rooftops.rect(fx + 13, y - 4, 1, 4, hex("#0c0b0a"));
        rooftops.rect(fx, y - 4, 14, 1, hex("#16130f"));
        for (let i = 0; i < 11; i++) rooftops.set(fx + 1 + i, y + 1 + i, hex("#0c0b0a"));
      }
    } else if (extra < 0.64) {
      rooftops.rect(x + 5, top - 9, 8, 9, shade(color, 0.82)); // chimney
      rooftops.rect(x + 4, top - 10, 10, 2, shade(color, 1.25));
      rooftops.rect(x + w - 16, top - 5, 9, 5, G("#6f6e69")); // roof shed
      rooftops.rect(x + w - 16, top - 5, 9, 1, G("#8d8b84"));
    } else if (extra < 0.76) {
      // clothesline between two poles, with washing
      const y = top - 7;
      rooftops.rect(x + 4, y, 1, 7, iron);
      rooftops.rect(x + w - 6, y, 1, 7, iron);
      for (let lx = x + 5; lx < x + w - 6; lx++)
        rooftops.set(
          lx,
          y + 1 + Math.round(Math.sin(((lx - x) / w) * Math.PI) * 1.4),
          G("#bdb6a6"),
        );
      for (let lx = x + 8; lx < x + w - 10; lx += between(5, 8))
        rooftops.rect(lx, y + 3, between(2, 3), between(2, 4), pick(tags));
    } else if (extra < 0.86) {
      // satellite dish and an aerial
      rooftops.rect(x + 8, top - 5, 1, 5, iron);
      rooftops.rect(x + 6, top - 8, 5, 3, G("#a9a59b"));
      rooftops.set(x + 5, top - 7, G("#a9a59b"));
      rooftops.rect(x + w - 10, top - 14, 1, 14, iron);
      rooftops.rect(x + w - 13, top - 12, 7, 1, iron);
    }
    // a scribble of graffiti near street level on some walls
    if (rand() < 0.3 && h > 40) {
      const tag = pick(tags);
      let gx = x + between(4, Math.max(4, w - 22));
      let gy = H - between(6, 12);
      for (let i = 0; i < between(10, 18); i++) {
        rooftops.set(gx, gy, tag);
        gx += 1;
        gy += between(-1, 1);
      }
    }
    // pigeons on the cornice
    if (rand() < 0.35)
      for (let i = 0; i < between(1, 3); i++)
        rooftops.rect(x + between(3, w - 5), top - 2, 2, 2, hex("#201d1b"));
    x += w;
  }

  return { skyline, rooftops, lights, beacons };
}

/**
 * Six frames of smoke for one stack, side by side. Puffs are emitted on a
 * steady beat and each frame moves them one sixth of a beat along, so the
 * strip loops without a seam.
 */
function smoke() {
  const FW = 72;
  const FH = 64;
  const FRAMES = 6;
  const c = canvas(FW * FRAMES, FH);
  const PUFFS = 5;
  for (let f = 0; f < FRAMES; f++) {
    for (let p = 0; p < PUFFS; p++) {
      const t = (p + f / FRAMES) / PUFFS; // 0 at the stack mouth, 1 fully dispersed
      const cx = 5 + t * t * 52 + t * 8;
      const cy = FH - 4 - t * 50;
      const r = 3 + t * 11;
      const density = 0.95 - t * 0.8;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y * 1.35) / r;
          if (d > 1) continue;
          const px = Math.round(cx + x);
          const py = Math.round(cy + y);
          if (px < 0 || px >= FW || py < 0 || py >= FH) continue;
          if (density * (1 - d * 0.55) > bayer(px + p * 3, py + f)) {
            c.set(f * FW + px, py, y < -r * 0.2 ? hex("#d4d1c8") : hex("#a9adae"));
          }
        }
      }
    }
  }
  return { canvas: c, frame: [FW, FH], frames: FRAMES };
}

/** Two lanes of lights on the bridge, as seamless strips: headlights, then tail lights. */
function traffic() {
  const LEN = W - BRIDGE_LEFT + 8;
  const c = canvas(LEN, 4);
  const rand = rng(404);
  for (let lane = 0; lane < 2; lane++) {
    const color = lane === 0 ? hex("#ecdf9f") : hex("#b8482f");
    for (let x = 6; x < LEN - 10;) {
      c.rect(x, lane * 2, 2, 1, color);
      if (rand() < 0.3) c.rect(x + 5, lane * 2, 2, 1, color); // a truck
      x += 14 + Math.floor(rand() * 58);
    }
  }
  return c;
}

/** A small flock, wings up and wings down. */
function birds() {
  const FW = 30;
  const FH = 14;
  const c = canvas(FW * 2, FH);
  const ink = hex("#1b1a19");
  const flock = [
    [4, 6],
    [13, 2],
    [15, 10],
    [23, 6],
  ];
  for (let f = 0; f < 2; f++) {
    for (const [x, y] of flock) {
      const ox = f * FW + x;
      c.set(ox + 2, y + 1, ink); // body
      const lift = f === 0 ? -1 : 1;
      c.set(ox + 1, y + 1 + lift, ink);
      c.set(ox, y + 1 + lift * 2 - (f === 0 ? 0 : 1), ink);
      c.set(ox + 3, y + 1 + lift, ink);
      c.set(ox + 4, y + 1 + lift * 2 - (f === 0 ? 0 : 1), ink);
    }
  }
  return c;
}

// ------------------------------------------------------------------ output

writePng(path.join(CHAT_ART, "bricks.png"), bricks());

const scene = city();
writePng(path.join(SHELL_ART, "sky.png"), sky());
writePng(path.join(SHELL_ART, "clouds-far.png"), clouds(31, 150, 5, 0.7));
writePng(path.join(SHELL_ART, "clouds-near.png"), clouds(77, 170, 4, 1.25));
writePng(path.join(SHELL_ART, "skyline.png"), scene.skyline);
writePng(path.join(SHELL_ART, "rooftops.png"), scene.rooftops);
writePng(path.join(SHELL_ART, "lights-a.png"), scene.lights.a);
writePng(path.join(SHELL_ART, "lights-b.png"), scene.lights.b);
writePng(path.join(SHELL_ART, "lights-c.png"), scene.lights.c);
const puff = smoke();
writePng(path.join(SHELL_ART, "smoke.png"), puff.canvas);
writePng(path.join(SHELL_ART, "traffic.png"), traffic());
writePng(path.join(SHELL_ART, "birds.png"), birds());

console.log(`total ${Math.round(totalBytes / 1024)} KB`);

// Where the moving pieces sit, as percentages of the scene, for Backdrop.tsx.
const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
console.log(
  JSON.stringify(
    {
      smoke: STACKS.map(({ x, h }) => ({
        left: pct(x - 2, W),
        top: pct(GROUND - h - puff.frame[1] + 3, H),
        width: pct(puff.frame[0], W),
        height: pct(puff.frame[1], H),
      })),
      traffic: {
        left: pct(BRIDGE_LEFT - 8, W),
        top: pct(DECK - 3, H),
        width: pct(W - BRIDGE_LEFT + 8, W),
        height: pct(4, H),
      },
      beacons: scene.beacons.map(([x, y]) => ({ left: pct(x, W), top: pct(y, H) })),
      cloudsFar: { height: pct(150, H) },
      cloudsNear: { height: pct(170, H) },
      pixel: { width: pct(1, W), height: pct(1, H) },
    },
    null,
    1,
  ),
);
