/**
 * What both scenes share overhead: the sky in four lights, clouds tinted to
 * match, stars, the sun (high and low) and the moon in eight phases.
 *
 * The sky pictures hold no sun, moon or stars. Those are separate sprites the
 * backdrop places from the real time, so they can move.
 */
import { bandedSky, bayer, canvas, clouds, dice, H, hex, W } from "./lib.mjs";

/** Sky colours from overhead down to the horizon, per state. */
const BANDS = {
  // slate blue sinking into grey-yellow haze
  day: ["#33557a", "#3d6085", "#4a6c8e", "#5c7b97", "#718b9e", "#879aa2", "#9aa19a", "#a6a18b"],
  // low sun: blue above, warming through rose to amber
  golden: ["#3b587f", "#4c688c", "#677a97", "#8a8a9c", "#ad9a98", "#c9a688", "#d9ad78", "#dfb372"],
  // the sun has just gone: indigo, mauve, afterglow
  dusk: ["#252c48", "#2f3558", "#434467", "#5c5173", "#7a5e77", "#986b71", "#b47c67", "#c59268"],
  // night over a lit city: never quite black, a dull glow low down
  night: ["#0c1122", "#10162b", "#151c35", "#1b2440", "#222c49", "#2a3350", "#343a55", "#3f4058"],
};

/** A warm bloom low on the sunset side (the right; the backdrop mirrors it at dawn). */
const BLOOM = {
  golden: { color: "#ecbf7c", x: 500, y: 300, rx: 300, ry: 190, strength: 0.6 },
  dusk: { color: "#d9a36c", x: 478, y: 256, rx: 170, ry: 96, strength: 0.7 },
};

const HORIZON = { day: 316, golden: 300, dusk: 252, night: 300 };

export function sky(state) {
  const c = bandedSky(BANDS[state].map(hex), HORIZON[state], 11);
  const bloom = BLOOM[state];
  if (bloom) {
    const tone = hex(bloom.color);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const amount = 1 - Math.hypot((x - bloom.x) / bloom.rx, (y - bloom.y) / bloom.ry);
        if (amount > bayer(x, y)) c.blend(x, y, tone, Math.min(0.55, amount * bloom.strength));
      }
    }
  }
  return c;
}

/** Cloud tones from the top of a cloud to its underside, per state. */
const CLOUD_TONES = {
  day: ["#d6d3c9", "#bcbeba", "#929b9f", "#77858f"],
  golden: ["#e3d2bd", "#cbb6a6", "#b0907f", "#d9a877"], // lit warm from below
  dusk: ["#4d4a66", "#645d78", "#93707a", "#c58d71"],
  night: ["#2b3048", "#353a52", "#404459", "#4a4c60"],
};

/** The same clouds in a given light. One seed per strip keeps the shapes identical across states. */
export function cloudStrip(which, state) {
  const tones = CLOUD_TONES[state].map(hex);
  return which === "far" ? clouds(31, 150, 5, 0.75, tones) : clouds(77, 170, 4, 1.25, tones);
}

/** Stars over the upper sky: a steady layer and a second one that twinkles. */
export function stars() {
  const steady = canvas(W, 220);
  const twinkle = canvas(W, 220);
  const d = dice(22);
  for (let n = 0; n < 190; n++) {
    const x = d.between(0, W - 1);
    const y = d.between(1, 210);
    if (!d.chance(1 - y / 240)) continue; // thinner toward the horizon
    const bright = d.chance(0.22);
    const target = d.chance(0.3) ? twinkle : steady;
    target.set(x, y, bright ? hex("#e4e1ee") : d.chance(0.5) ? hex("#a9a9c4") : hex("#7f809e"));
    if (bright && d.chance(0.35)) {
      // the brightest get a small cross
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        target.setAlpha(x + dx, y + dy, hex("#c9c8dc"), 0.5);
    }
  }
  return { steady, twinkle };
}

/** The sun: a disc with a dithered halo. `low` is the big amber one near the horizon. */
export function sun(low) {
  const size = low ? 56 : 44;
  const c = canvas(size, size);
  const r = low ? 15 : 12;
  const mid = size / 2 - 0.5;
  const core = hex(low ? "#f0c27a" : "#dcd4b6");
  const rim = hex(low ? "#e3a35f" : "#c9c2a6");
  const haze = hex(low ? "#e0a868" : "#b9b7a2");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - mid, y - mid);
      if (dist <= r - 3) c.set(x, y, core);
      else if (dist <= r) c.set(x, y, rim);
      else if (dist <= mid) {
        const fade = 1 - (dist - r) / (mid - r);
        if (fade > bayer(x, y) * 1.25) c.setAlpha(x, y, haze, 0.2 + fade * 0.45);
      }
    }
  }
  return c;
}

/**
 * The moon in eight phases, left to right: new, waxing crescent, first
 * quarter, waxing gibbous, full, waning gibbous, last quarter, waning crescent.
 */
export function moon() {
  const size = 28;
  const r = 9;
  const c = canvas(size * 8, size);
  const lit = hex("#dcd7c6");
  const mare = hex("#b9b5a8");
  const dark = hex("#3a3f58");
  const mid = size / 2 - 0.5;
  for (let phase = 0; phase < 8; phase++) {
    const t = phase / 8; // 0 new, 0.5 full
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - mid;
        const dy = y - mid;
        const dist = Math.hypot(dx, dy);
        if (dist > r) {
          // a faint glow round a bright moon
          if (dist <= r + 4 && t > 0.2 && t < 0.8 && 1 - (dist - r) / 4 > bayer(x, y) * 1.6) {
            c.setAlpha(phase * size + x, y, hex("#9c98b0"), 0.35);
          }
          continue;
        }
        // The terminator is an ellipse whose width follows the phase.
        const limb = Math.sqrt(Math.max(0, r * r - dy * dy));
        const edge = Math.cos(t * 2 * Math.PI) * limb;
        const isLit = t < 0.5 ? dx > edge : dx < -edge;
        if (isLit) {
          const spot =
            Math.hypot(dx + 2, dy - 1) < 2.6 ||
            Math.hypot(dx - 3, dy + 3) < 1.8 ||
            Math.hypot(dx - 1, dy - 4) < 1.5;
          c.set(phase * size + x, y, spot ? mare : lit);
        } else if (t > 0.06 && t < 0.94) {
          c.setAlpha(phase * size + x, y, dark, 0.55); // earthshine on the dark side
        }
      }
    }
  }
  return { canvas: c, frame: size };
}
