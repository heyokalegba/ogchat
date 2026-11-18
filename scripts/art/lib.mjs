/**
 * Shared tools for ogchat's pixel art: a tiny RGBA canvas, a PNG writer,
 * seeded randomness, colour helpers and a few things every scene draws.
 * No dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SHELL_ART = path.join(ROOT, "src/components/shell/art");
export const CHAT_ART = path.join(ROOT, "src/components/chat/art");

/** Every scene is drawn at this size and scaled up with hard pixels. */
export const W = 640;
export const H = 360;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random helpers bound to one seed. */
export function dice(seed) {
  const rand = rng(seed);
  return {
    rand,
    pick: (list) => list[Math.floor(rand() * list.length)],
    between: (a, b) => a + Math.floor(rand() * (b - a + 1)),
    chance: (p) => rand() < p,
  };
}

export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** Pulls a colour toward grey: 0 leaves it alone, 1 removes all colour. */
export const desat = (c, t) => mix(c, Array(3).fill(Math.round(luma(c))), t);

/** A transparent canvas. Pixels are opaque once drawn. */
export function canvas(w, h) {
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
    x = Math.round(x);
    y = Math.round(y);
    if (!inside(x, y)) return null;
    const i = (y * w + x) * 4;
    return data[i + 3] ? [data[i], data[i + 1], data[i + 2]] : null;
  };
  /** Multiplies an existing pixel's colour; does nothing on transparent pixels. */
  const tint = (x, y, f) => {
    const c = get(x, y);
    if (c) set(x, y, shade(c, f));
  };
  /** Blends an existing pixel toward a colour; does nothing on transparent pixels. */
  const blend = (x, y, color, t) => {
    const c = get(x, y);
    if (c) set(x, y, mix(c, color, t));
  };
  const rect = (x, y, rw, rh, c) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, c);
  };
  return { w, h, data, set, get, tint, blend, rect };
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

export const written = [];

export function writePng(file, c) {
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
  written.push({ file: path.relative(ROOT, file), size: `${c.w}x${c.h}`, bytes: png.length });
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));
/** Ordered-dither threshold for a pixel, in 0..1. */
export const bayer = (x, y) => BAYER[((Math.round(y) % 4) + 4) % 4][((Math.round(x) % 4) + 4) % 4];

/** Percentage of the scene, for placing moving pieces in CSS. */
export const pctX = (v) => `${((v / W) * 100).toFixed(3)}%`;
export const pctY = (v) => `${((v / H) * 100).toFixed(3)}%`;

/** A sky of horizontal colour bands dithered into each other, with a little grain. */
export function bandedSky(bands, horizon, seed) {
  const c = canvas(W, H);
  const rand = rng(seed);
  for (let y = 0; y < H; y++) {
    const t = Math.min(0.999, y / horizon) * (bands.length - 1);
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
  return c;
}

/**
 * A seamless strip of clouds built from overlapping lobes with a flat base.
 * `tones` runs from the top of a cloud to its underside: [top, body, under, belly].
 */
export function clouds(seed, height, count, scale, tones) {
  const c = canvas(W, height);
  const { rand } = dice(seed);
  const between = (a, b) => a + rand() * (b - a);
  const [top, body, under, belly] = tones;
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

/** Grime: streaks running down from the top edge of a wall, and a few damp blotches. */
export function weather(c, d, x, y, w, h, strength = 1) {
  for (let dx = 0; dx < w; dx++) {
    if (!d.chance(0.22 * strength)) continue;
    const length = d.between(4, Math.max(6, Math.floor(h * 0.55)));
    for (let dy = 0; dy < length; dy++) {
      if (1 - dy / length > bayer(x + dx, y + dy)) c.tint(x + dx, y + dy, 0.87);
    }
  }
  for (let n = 0; n < Math.ceil(((w * h) / 900) * strength); n++) {
    const bx = x + d.between(0, w - 1);
    const by = y + d.between(0, h - 1);
    const r = d.between(3, 7);
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        const px = bx + xx;
        const py = by + yy;
        if (px < x || px >= x + w || py < y || py >= y + h) continue;
        if (1 - Math.hypot(xx, yy) / r > bayer(px, py) * 1.2)
          c.tint(px, py, d.chance(0.75) ? 0.9 : 1.07);
      }
    }
  }
}

/** A rooftop water tank on legs. `s` is its scale (1 small, 2 large). */
export function waterTower(c, d, x, y, s, woods, iron) {
  const wood = d.pick(woods);
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
    if (d.chance(0.5)) c.tint(x + d.between(0, tank - 1), y - legs - tank + dy, 0.82); // rust
  for (let i = 0; i < 2 + s; i++)
    c.rect(x + i, y - legs - tank - 1 - i, tank - i * 2, 1, shade(wood, 0.6));
}

/** A soft pool of light laid over whatever is already drawn. */
export function glow(c, cx, cy, r, color, strength) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      const amount = (1 - d) * strength;
      if (amount > bayer(cx + x, cy + y) * 0.9)
        c.blend(cx + x, cy + y, color, Math.min(0.6, amount));
    }
  }
}

/**
 * Six frames of chimney smoke, side by side. Puffs are emitted on a steady
 * beat and each frame moves them one sixth of a beat along, so it loops.
 */
export function smoke() {
  const FW = 72;
  const FH = 64;
  const FRAMES = 6;
  const c = canvas(FW * FRAMES, FH);
  const PUFFS = 5;
  for (let f = 0; f < FRAMES; f++) {
    for (let p = 0; p < PUFFS; p++) {
      const t = (p + f / FRAMES) / PUFFS; // 0 at the mouth, 1 fully dispersed
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
            c.set(f * FW + px, py, y < -r * 0.2 ? hex("#c9c6bd") : hex("#9da1a2"));
          }
        }
      }
    }
  }
  return { canvas: c, frameW: FW, frameH: FH };
}

/** A small flock, wings up and wings down. */
export function birds() {
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
      const lift = f === 0 ? -1 : 1;
      c.set(ox + 2, y + 1, ink); // body
      c.set(ox + 1, y + 1 + lift, ink);
      c.set(ox, y + 1 + lift * 2 - (f === 0 ? 0 : 1), ink);
      c.set(ox + 3, y + 1 + lift, ink);
      c.set(ox + 4, y + 1 + lift * 2 - (f === 0 ? 0 : 1), ink);
    }
  }
  return c;
}
