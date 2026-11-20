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

/**
 * A transparent canvas. Pixels are opaque once drawn.
 *
 * It also keeps an ownership map: `mark` claims a patch of pixels for a light
 * (a window, a lamp), and anything drawn over a pixel afterwards takes the
 * claim away. That is how a window knows, later, which of its pixels are still
 * showing and which have a fire escape or a tree in front of them.
 */
export function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const owner = new Uint32Array(w * h);
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
    owner[y * w + x] = 0;
  };
  /** A see-through pixel, for halos. Keeps the stronger of what is there and what is asked. */
  const setAlpha = (x, y, c, alpha) => {
    x = Math.round(x);
    y = Math.round(y);
    if (!inside(x, y)) return;
    const i = (y * w + x) * 4;
    const a = Math.round(alpha * 255);
    if (data[i + 3] >= a) return;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = a;
  };
  const mark = (x, y, rw, rh, id) => {
    for (let yy = y; yy < y + rh; yy++) {
      for (let xx = x; xx < x + rw; xx++) if (inside(xx, yy)) owner[yy * w + xx] = id;
    }
  };
  const owns = (x, y, id) => inside(x, y) && owner[y * w + x] === id;
  /** Whether a pixel belongs to some light (a window, a lamp), which snow and the like must leave alone. */
  const claimed = (x, y) => inside(x, y) && owner[y * w + x] !== 0;
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
  /** A copy with every drawn pixel passed through `fn` (a colour grade). */
  const graded = (fn) => {
    const copy = canvas(w, h);
    for (let i = 0; i < w * h; i++) {
      if (!data[i * 4 + 3]) continue;
      const [r, g, b] = fn([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
      copy.data[i * 4] = r;
      copy.data[i * 4 + 1] = g;
      copy.data[i * 4 + 2] = b;
      copy.data[i * 4 + 3] = data[i * 4 + 3];
    }
    return copy;
  };
  return { w, h, data, set, setAlpha, get, tint, blend, rect, mark, owns, claimed, graded };
}

/** The four lights a scene is drawn in. The backdrop crossfades between neighbours. */
export const STATES = ["day", "golden", "dusk", "night"];

/**
 * The grounds a scene is drawn in: the four seasons, and winter under snow.
 * Winter on its own is bare and dry, as most winter days in the city are;
 * "snow" is the same day with snow lying.
 */
export const SEASONS = ["spring", "summer", "autumn", "winter", "snow"];

/**
 * Snow, lying where snow lies: on the top of whatever is uppermost in each
 * column of the picture, wherever that top is level enough to hold it (a
 * roof, a cornice, a car, a step), and not on a mast or the tip of a twig.
 * Pixels that are lights are left alone. `from` and `to` limit the rows it
 * may settle on.
 */
export function snowfall(c, snow, { from = 0, to = c.h - 1 } = {}) {
  const tops = [];
  for (let x = 0; x < c.w; x++) {
    let top = -1;
    for (let y = 0; y < c.h; y++) {
      if (c.get(x, y)) {
        top = y;
        break;
      }
    }
    tops.push(top);
  }
  for (let x = 0; x < c.w; x++) {
    const y = tops[x];
    if (y < from || y > to) continue;
    const left = tops[x - 1] ?? y;
    const right = tops[x + 1] ?? y;
    if (Math.abs(left - y) > 1 || Math.abs(right - y) > 1) continue; // nothing to lie on
    if (c.claimed(x, y)) continue;
    c.set(x, y, snow);
    // a second row here and there, so it has some depth
    if (bayer(x, y) < 0.5 && c.get(x, y + 1) && !c.claimed(x, y + 1)) {
      c.set(x, y + 1, shade(snow, 0.9));
    }
  }
}

/** Which lights are on in each state. "always" lights burn even by day. */
/** What a lived-behind window glows when the drawing has no colour of its own for it. */
const HOME_TONES = ["#b89f66", "#c9ae70", "#c4aa6c", "#d8c478", "#bd9a50", "#e3c98a"].map(hex);

/** A repeatable number in [0, 1) for a pair of whole numbers. */
function unit(a, b) {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x51ed270b, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** What a window lit from inside looks like from the street by day: glass, mostly. */
const DAY_GLASS = hex("#7b8088");

const LIT_IN = {
  day: ["always"],
  golden: ["always"],
  dusk: ["always", "evening"],
  night: ["always", "evening", "night"],
};

/** A colour grade: per-channel gain, then a pull toward a tint. */
export function grade({ gain, tint, amount = 0 }) {
  const target = tint ? hex(tint) : null;
  return (c) => {
    const lit = c.map((v, i) => Math.max(0, Math.min(255, Math.round(v * gain[i]))));
    return target ? mix(lit, target, amount) : lit;
  };
}

/**
 * Remembers every light in a scene while it is being drawn, so the same
 * drawing can be turned out in four lights with identical geometry.
 *
 * Draw the unlit look of a window as usual, then call `light` to claim its
 * pixels and say when it is on:
 *   "always" | "evening" | "night"   lit in the still pictures from that state on
 *   "a" | "b" | "c"                  a window that switches on and off (the lights layers)
 */
export function emitter() {
  const ops = [];
  let nextId = 1;
  /**
   * Windows with somebody behind them, by light id. These are never lit in
   * the pictures themselves: which of them are on is decided as the scene
   * runs, hour by hour and differently every night (see `homes`).
   */
  const lived = new Map(); // id -> { building }
  /** The buildings those windows are in: what kind each is, in the order they were begun. */
  const kinds = ["flat"];
  const light = (c, x, y, w, h, color, when) => {
    const id = nextId++;
    c.mark(x, y, w, h, id);
    ops.push({ kind: "rect", c, id, x, y, w, h, color, when });
    return id;
  };
  return {
    /** A lit patch. Returns its id, for `detail`. */
    light,
    /**
     * Says that the windows drawn from here on belong to a new building:
     * "office" (it empties in the evening, floor by floor), "flat" (people
     * live there and go to bed), or "mixed" (one or the other, decided once).
     */
    building(kind) {
      kinds.push(kind);
    },
    /**
     * A window with somebody behind it: an office, a room in a flat. Every
     * such window should be given here, whether or not the old dice had it
     * lit, because it is not this drawing that decides. The pictures show it
     * dark; the scene lights it when its people are in.
     *
     * `color` is what it glows when lit; null picks a warm one from where
     * the window is (no dice are rolled, so nothing else in the picture
     * moves). `when` is accepted and ignored, so call sites can keep the
     * rolls they always made.
     */
    home(c, x, y, w, h, color) {
      const tone =
        color ?? HOME_TONES[Math.floor(unit(x * 7919 + w, y * 104729 + h) * HOME_TONES.length)];
      const id = light(c, x, y, w, h, tone, "home");
      lived.set(id, { building: kinds.length - 1 });
      return id;
    },
    /**
     * Everything the scene needs to light the lived-behind windows of one
     * canvas itself: a picture with every one of them lit (clear everywhere
     * else, and only where the window still shows, so a tree in front of a
     * window stays in front of it), and the list of them: where each is, and
     * which building it belongs to. `kinds` says what each building is.
     */
    homes(source) {
      const lit = canvas(source.w, source.h);
      const seen = new Set();
      const windows = [];
      const local = new Map(); // building id -> index among this canvas's buildings
      let codes = "";
      for (const op of ops) {
        if (op.c !== source || op.kind !== "rect" || !lived.has(op.id)) continue;
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++)
            if (source.owns(x, y, op.id)) lit.set(x, y, op.color);
        }
        if (seen.has(op.id)) continue; // a blind or a sash bar on a window already listed
        seen.add(op.id);
        if (op.x < 0 || op.y < 0 || op.x + op.w > source.w || op.y + op.h > source.h) continue;
        const building = lived.get(op.id).building;
        if (!local.has(building)) {
          local.set(building, local.size);
          const kind = kinds[building];
          // A "mixed" building is offices or flats: settled here, once, by which building it is.
          const settled = kind === "mixed" ? (unit(building, 77) < 0.55 ? "office" : "flat") : kind;
          codes += settled === "office" ? "o" : "f";
        }
        windows.push(op.x, op.y, op.w, op.h, local.get(building));
      }
      return { lit, windows, kinds: codes };
    },
    /** Part of an existing light: a blind, a sash bar. Shown only where that light still shows. */
    detail(c, id, x, y, w, h, color, when) {
      // A blind on a lived-behind window is lit with the window, not by the clock.
      ops.push({ kind: "rect", c, id, x, y, w, h, color, when: lived.has(id) ? "home" : when });
    },
    /** Light spilling onto whatever is around: a lamp's pool, a shop front. */
    spill(c, cx, cy, r, color, strength, when, { halo = true, of = null } = {}) {
      // `of` ties the spill to a light: if that light ends up hidden, so does its spill.
      ops.push({ kind: "spill", c, cx, cy, r, color, strength, when, halo, of });
    },
    /** Anything else that only happens when lit. `fn` gets the canvas to draw on. */
    custom(c, fn, when) {
      ops.push({ kind: "custom", c, fn, when });
    },

    /** The source canvas as it looks in one state: graded, then with that state's lights on. */
    render(source, state, gradeFn) {
      const out = source.graded(gradeFn);
      const on = LIT_IN[state];
      // In daylight a lit shop window does not glow: you see into it, dimly.
      const sunlit = state === "day" ? 0.6 : state === "golden" ? 0.35 : 0;
      for (const op of ops) {
        if (op.c !== source || !on.includes(op.when)) continue;
        if (op.kind === "rect") {
          const color = sunlit
            ? shade(mix(op.color, DAY_GLASS, sunlit), 1 - sunlit * 0.25)
            : op.color;
          for (let y = op.y; y < op.y + op.h; y++) {
            for (let x = op.x; x < op.x + op.w; x++)
              if (source.owns(x, y, op.id)) out.set(x, y, color);
          }
        } else if (op.kind === "spill") {
          if (!hidden(source, op)) glow(out, op.cx, op.cy, op.r, op.color, op.strength);
        } else {
          op.fn(out);
        }
      }
      return out;
    },

    /**
     * The windows tagged with any of `which` that are still in plain view, as
     * a list: where each is, how big, and the colour it lights up in. For
     * switching them one at a time instead of a layer at a time.
     */
    switches(source, which) {
      const toHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const seen = new Set();
      const out = [];
      for (const op of ops) {
        if (op.c !== source || !which.includes(op.when) || op.kind !== "rect") continue;
        if (seen.has(op.id)) continue; // a blind or a sash bar on a window already listed
        seen.add(op.id);
        if (!source.owns(op.x, op.y, op.id)) continue;
        if (!source.owns(op.x + op.w - 1, op.y + op.h - 1, op.id)) continue;
        out.push({ x: op.x, y: op.y, w: op.w, h: op.h, color: toHex(op.color) });
      }
      return out;
    },

    /** One of the switching layers: just the windows tagged with `which`. */
    switching(source, which, into) {
      for (const op of ops) {
        if (op.c !== source || op.when !== which || op.kind !== "rect") continue;
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++)
            if (source.owns(x, y, op.id)) into.set(x, y, op.color);
        }
      }
      return into;
    },

    /**
     * Halos for everything that is lit at night on `source`, dealt out between
     * a few canvases so neighbouring lights can pulse out of step.
     */
    halos(source, into, d) {
      for (const op of ops) {
        if (op.c !== source || !LIT_IN.night.includes(op.when)) continue;
        const target = into[Math.floor(d.rand() * into.length)];
        const roll = d.rand();
        if (op.kind === "rect") {
          // Not every light gets one: a haze over the whole city would flatten it.
          const shown =
            source.owns(op.x, op.y, op.id) || source.owns(op.x + op.w - 1, op.y + op.h - 1, op.id);
          if (!shown) continue;
          const small = op.w * op.h < 4;
          if (roll > (small ? 0.22 : 0.42)) continue;
          const r = small ? 1.7 : Math.max(op.w, op.h) * 0.7 + 1.8;
          halo(
            target,
            op.x + op.w / 2 - 0.5,
            op.y + op.h / 2 - 0.5,
            r,
            op.color,
            small ? 0.4 : 0.36,
          );
        } else if (op.kind === "spill" && op.halo && !hidden(source, op)) {
          halo(target, op.cx, op.cy, op.r * 0.5, op.color, 0.24);
        }
      }
    },
  };
}

/** True when a spill belongs to a light that something has since been drawn over. */
function hidden(source, op) {
  return op.of ? !source.owns(op.of.x, op.of.y, op.of.id) : false;
}

/** A soft halo in three steps of transparency, so it still reads as pixel art. */
export function halo(c, cx, cy, r, color, strength) {
  const tone = mix(color, hex("#fff2c8"), 0.25);
  for (let y = Math.floor(-r); y <= Math.ceil(r); y++) {
    for (let x = Math.floor(-r); x <= Math.ceil(r); x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      const level = d < 0.4 ? 1 : d < 0.72 ? 0.55 : 0.26;
      c.setAlpha(cx + x, cy + y, tone, strength * level);
    }
  }
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
