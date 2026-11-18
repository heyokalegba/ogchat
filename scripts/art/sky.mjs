/**
 * What both scenes share overhead: the sky in four lights, clouds tinted to
 * match, stars, the sun (high and low) and the moon in eight phases.
 *
 * The sky pictures hold no sun, moon or stars. Those are separate sprites the
 * backdrop places from the real time, so they can move.
 */
import { bandedSky, bayer, canvas, clouds, dice, grade, H, hex, shade, W } from "./lib.mjs";

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

// ---------------------------------------------------------------- aircraft

/** One aircraft's cell, and how the sheet is laid out: two frames across, one row each. */
export const FLIER = { w: 26, h: 10, frames: 2, rows: 2, plane: 0, helicopter: 1 };

/** How something up in the sky takes the light at each hour. */
const AIR_GRADES = {
  day: (c) => c,
  golden: grade({ gain: [1.0, 0.9, 0.76], tint: "#d08a4a", amount: 0.16 }),
  dusk: grade({ gain: [0.5, 0.48, 0.6], tint: "#3a3050", amount: 0.3 }),
  night: grade({ gain: [0.24, 0.26, 0.38], tint: "#131a30", amount: 0.36 }),
};

/**
 * An airliner and a helicopter, nose to the right, in one light. The second
 * frame is the airliner's strobe going off and the helicopter's rotor coming
 * round. After dark they are mostly their lights.
 */
export function fliers(state) {
  const c = canvas(FLIER.w * FLIER.frames, FLIER.h * FLIER.rows);
  const tone = AIR_GRADES[state];
  const dark = state === "dusk" || state === "night";
  const body = tone(hex("#c9cdd2"));
  const belly = tone(hex("#8d949c"));
  const trim = tone(hex("#34485e"));
  const glass = tone(hex("#2a3644"));
  for (let frame = 0; frame < FLIER.frames; frame++) {
    const ox = frame * FLIER.w;
    const px = (x, y, color) => c.set(ox + x, y, color);

    // ---- the airliner
    for (let x = 3; x <= 22; x++) {
      px(x, 4, body);
      px(x, 5, belly);
    }
    px(23, 5, body); // nose
    px(23, 4, glass);
    for (let x = 7; x <= 20; x += 2) px(x, 4, glass); // windows
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
      [4, 3],
    ].forEach(([x, y]) => px(x, y, trim)); // the fin, in the airline's colour
    px(1, 4, body); // tailplane
    px(2, 4, body);
    [
      [13, 6],
      [12, 6],
      [11, 7],
      [10, 7],
      [9, 8],
    ].forEach(([x, y]) => px(x, y, belly)); // the near wing, swept back
    px(12, 7, shade(belly, 0.6)); // an engine under it
    px(13, 7, shade(belly, 0.6));
    if (dark) {
      px(9, 8, hex("#c8483a")); // wingtip
      px(23, 5, hex("#e9e2c4"));
      if (frame === 1) px(1, 1, hex("#ffffff")); // the strobe
    }

    // ---- the helicopter
    const oy = FLIER.h;
    const hp = (x, y, color) => c.set(ox + x, oy + y, color);
    const hull = tone(hex("#3f5560"));
    const blade = tone(hex("#22262b"));
    // rotor: a full sweep, then edge on
    for (let x = frame === 0 ? 4 : 9; x <= (frame === 0 ? 20 : 15); x++) hp(x, 0, blade);
    hp(12, 1, blade);
    for (let x = 8; x <= 16; x++) for (let y = 2; y <= 5; y++) hp(x, y, hull);
    hp(17, 3, hull);
    hp(17, 4, hull);
    hp(8, 2, tone(hex("#2f434c")));
    for (let x = 14; x <= 16; x++) for (let y = 3; y <= 4; y++) hp(x, y, glass);
    hp(17, 4, glass);
    for (let x = 1; x <= 8; x++) hp(x, 3, hull); // tail boom
    hp(1, 2, hull);
    hp(0, frame === 0 ? 1 : 2, blade); // tail rotor
    hp(0, frame === 0 ? 3 : 2, blade);
    hp(1, frame === 0 ? 2 : 1, blade);
    hp(10, 6, blade); // skids
    hp(15, 6, blade);
    for (let x = 8; x <= 17; x++) hp(x, 7, blade);
    for (let x = 8; x <= 16; x++) hp(x, 5, tone(hex("#2f434c")));
    if (dark) {
      hp(12, 6, frame === 0 ? hex("#d2483a") : hex("#5a2a24")); // the beacon under the belly
      hp(17, 4, hex("#e9e2c4"));
      hp(1, 2, hex("#c8483a"));
    }
  }
  return c;
}

// ---------------------------------------------------------------- one bird

/** A single bird's cell: two frames, wings up and wings down. */
export const BIRD = { w: 7, h: 5, frames: 2 };

export function bird() {
  const c = canvas(BIRD.w * BIRD.frames, BIRD.h);
  const ink = hex("#1c1917");
  // wings up: a shallow V
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 1],
    [5, 0],
    [3, 3],
  ].forEach(([x, y]) => c.set(x, y, ink));
  // wings down: an arch
  [
    [0, 3],
    [1, 2],
    [2, 1],
    [3, 1],
    [4, 2],
    [5, 3],
    [3, 2],
  ].forEach(([x, y]) => c.set(BIRD.w + x, y, ink));
  return c;
}
