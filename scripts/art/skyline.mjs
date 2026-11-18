/**
 * Scene one: the harbour skyline, under a moody, hazy sky.
 *
 * Distant towers, the city in muted colour, a suspension bridge, the river,
 * and dark rooftops along the bottom edge. The outline is deliberately uneven:
 * heights swell into two clusters, with slender towers, stepped crowns, spires
 * and masts breaking the roofline, so it reads as a skyline and not a band.
 */
import { chrysler, empireState, oneWorldTrade } from "./landmarks.mjs";
import { billboard } from "./street.mjs";
import {
  bayer,
  canvas,
  desat,
  dice,
  emitter,
  grade,
  H,
  hex,
  mix,
  pctX,
  pctY,
  shade,
  W,
  waterTower,
  weather,
  STATES,
} from "./lib.mjs";

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

/** The mood pass: every colour goes darker, dustier and less saturated. */
const DUST = hex("#6a635b");
const grit = (c) => desat(mix(shade(c, 0.83), DUST, 0.08), 0.14);
const G = (h) => grit(hex(h));

/**
 * The city is drawn as it looks by day; the other lights are that picture
 * regraded, with more windows lit as it gets darker.
 */
const GRADES = {
  day: (c) => c,
  golden: grade({ gain: [1.0, 0.9, 0.78], tint: "#d08a4a", amount: 0.13 }),
  dusk: grade({ gain: [0.6, 0.57, 0.7], tint: "#3a3050", amount: 0.24 }),
  night: grade({ gain: [0.3, 0.33, 0.46], tint: "#131a30", amount: 0.3 }),
};

/**
 * People on the near roofs are lit a little more kindly than the masonry after
 * dark, or they would vanish into it.
 */
const PEOPLE_GRADES = {
  ...GRADES,
  dusk: grade({ gain: [0.7, 0.67, 0.78], tint: "#3a3050", amount: 0.2 }),
  night: grade({ gain: [0.44, 0.46, 0.58], tint: "#131a30", amount: 0.24 }),
};

/** How tall the city stands at x: two clusters with lower ground between and beside them. */
const rise = (x) =>
  Math.max(Math.exp(-(((x - 140) / 100) ** 2)), 0.9 * Math.exp(-(((x - 478) / 115) ** 2)), 0.28);

function city() {
  const skyline = canvas(W, H);
  const rooftops = canvas(W, H);
  const lights = { a: canvas(W, H), b: canvas(W, H), c: canvas(W, H) };
  const d = dice(718);
  const { rand, pick, between, chance } = d;
  // Lights are recorded, not painted, and decided by their own dice, so the
  // buildings come out the same however the lighting rules change.
  const emit = emitter();
  const L = dice(4242);
  /** When an otherwise dark window comes on: at dusk, only at night, or never. */
  const later = (evening, night) =>
    L.chance(evening) ? "evening" : L.chance(night) ? "night" : null;

  const lit = ["#d8c478", "#c9ae5c", "#ddd096", "#bd9a50"].map(hex);
  // A few rooms are lit by coloured LED strips instead of a lamp, and some of
  // the tall buildings carry a red warning light. Dice of their own for both.
  const LED = dice(7101);
  const LED_TONES = ["#c2456e", "#5a7fd6", "#8a5fd0", "#3fae9a", "#d0503a"].map(hex);
  const B = dice(7102);
  /** Near windows that are lit at some hour, for what is seen moving behind them. */
  const panes = [];
  const iron = G("#2b2724");
  const woods = [G("#5c4434"), G("#66493a"), G("#4f3d31")];

  /** A grid of windows. Some dark ones are also noted for the flicker layers. */
  const windows = (c, x, y, w, h, color, o) => {
    const dark = shade(color, 0.62);
    const glass = pick([G("#3f566b"), G("#34485a"), G("#2a2f33")]);
    const useGlass = chance(0.4);
    for (let wy = y + o.top; wy + o.wh < y + h - 3; wy += o.wh + o.gapY) {
      for (let wx = x + o.left; wx + o.ww < x + w - 2; wx += o.ww + o.gapX) {
        const on = chance(o.lit);
        const tone = pick(lit);
        const blind = on && o.wh > 3 && chance(0.4);
        c.rect(wx, wy, o.ww, o.wh, useGlass ? glass : dark);
        if (o.sill) c.rect(wx - 1, wy + o.wh, o.ww + 2, 1, shade(color, 1.25));
        c.tint(wx, wy + o.wh + (o.sill ? 1 : 0), 0.84); // stain under the window
        c.tint(wx, wy + o.wh + (o.sill ? 2 : 1), 0.92);
        let when = on ? "always" : null;
        let color2 = tone;
        if (!on && o.flicker && chance(o.flickerRate) && o.flicker.allowed(wx, wy)) {
          when = o.flicker.layer(); // one of the windows that switch on and off
          color2 = pick(lit);
        }
        when ??= later(0.13, 0.3);
        if (!when) continue;
        const led = o.ww >= 2 && LED.chance(0.02);
        const id = emit.light(c, wx, wy, o.ww, o.wh, led ? LED.pick(LED_TONES) : color2, when);
        if (c === rooftops && when !== "b") {
          panes.push({ x: wx, y: wy, w: o.ww, h: o.wh, when, id });
        }
        if (blind) emit.detail(c, id, wx, wy, o.ww, 1, shade(tone, 0.72), when);
      }
    }
  };

  /** A stepped pyramid cap: each course a little narrower than the one below. */
  const crown = (c, cx, top, w, color, steps) => {
    let y = top;
    for (let i = 1; i <= steps; i++) {
      const sw = Math.max(2, Math.round(w * (1 - i / (steps + 1))));
      const sh = 2 + (i % 2);
      y -= sh;
      c.rect(cx - Math.floor(sw / 2), y, sw, sh, shade(color, 1 - i * 0.02));
      c.rect(cx + Math.floor(sw / 2) - 1, y, 1, sh, shade(color, 0.76));
    }
    return y;
  };

  // --- far skyline: hazy silhouettes, tall where the clusters are
  const haze = ["#70899e", "#768ea2", "#69839a", "#7c91a3"].map(hex);
  for (let x = -6; x < W;) {
    const w = between(8, 20);
    const h = Math.round(between(48, 122) * (0.62 + rise(x + 30) * 0.6));
    const color = pick(haze);
    skyline.rect(x, GROUND - h, w, h, color);
    const top = rand();
    if (top < 0.3) skyline.rect(x + 2, GROUND - h - 8, Math.max(3, w - 5), 8, color);
    if (top < 0.55) skyline.rect(x + Math.floor(w / 2), GROUND - h - between(10, 26), 1, 26, color);
    else if (top < 0.7) crown(skyline, x + Math.floor(w / 2), GROUND - h, w, color, 4);
    for (let wy = GROUND - h + 5; wy < GROUND - 5; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (chance(0.55)) skyline.set(wx, wy, shade(color, 0.9));
        if (L.chance(0.2)) emit.light(skyline, wx, wy, 1, 1, L.pick(lit), "night");
      }
    }
    x += w;
  }
  // Three of the towers that used to stand here were invented. They are still
  // rolled for, on a canvas nobody sees, so that every building after them
  // comes out exactly as before; the real ones are drawn in their place.
  const unseen = canvas(W, H);
  const landmark = (x, color, parts, spire, c = skyline) => {
    let y = GROUND;
    for (const [w, h] of parts) {
      y -= h;
      const left = x - Math.floor(w / 2);
      c.rect(left, y, w, h, color);
      c.rect(left + w - 2, y, 2, h, shade(color, 0.9));
      for (let wy = y + 3; wy < y + h - 2; wy += 4) {
        for (let wx = left + 2; wx < left + w - 3; wx += 3) {
          if (chance(0.6)) c.set(wx, wy, shade(color, 0.88));
          if (L.chance(0.26)) {
            emit.light(c, wx, wy, 1, 1, L.pick(lit), L.chance(0.3) ? "evening" : "night");
          }
        }
      }
    }
    c.rect(x, y - spire, 1, spire, color);
    return y - spire;
  };
  const beacons = [];
  landmark(
    118,
    hex("#5f788f"),
    [
      [24, 166],
      [17, 24],
      [11, 18],
      [7, 13],
      [3, 11],
    ],
    24,
    unseen,
  );
  // The icons, with dice of their own for their windows.
  const I = dice(1931);
  beacons.push([
    118,
    oneWorldTrade(skyline, {
      x: 118,
      base: GROUND,
      height: 214,
      width: 25,
      glass: hex("#7896ad"),
      emit,
      L: I,
      lit,
    }),
  ]);
  landmark(
    44,
    hex("#647e94"),
    [
      [22, 132],
      [18, 32],
      [14, 28],
      [9, 20],
    ],
    30,
  ); // tapered glass tower
  landmark(
    292,
    hex("#627c93"),
    [
      [16, 132],
      [14, 8],
      [11, 7],
      [8, 6],
      [6, 6],
      [4, 5],
      [2, 5],
    ],
    18,
    unseen,
  );
  chrysler(skyline, {
    x: 292,
    base: GROUND,
    height: 196,
    width: 15,
    steel: hex("#8497a6"),
    emit,
    L: I,
    lit,
  });
  landmark(
    476,
    hex("#677f95"),
    [
      [20, 160],
      [13, 18],
      [7, 12],
    ],
    20,
  );
  landmark(
    236,
    hex("#6d8498"),
    [
      [12, 150],
      [8, 16],
      [4, 10],
    ],
    12,
    unseen,
  );
  empireState(skyline, {
    x: 237,
    base: GROUND,
    height: 222,
    width: 30,
    stone: hex("#8b939b"),
    emit,
    L: I,
    lit,
    flood: hex("#e9e2c4"),
  });

  // --- mid layer: the city in colour, worn. Few reds, and those are brownstone.
  const bodies = [
    "#74574a", // brownstone
    "#66493d",
    "#7a5a4b",
    "#6f5a48",
    "#b39a78", // tan
    "#bfad8c",
    "#5d7460", // muted green
    "#4c6352",
    "#55708a", // slate blue
    "#667f95",
    "#9c8847", // dull mustard
    "#3d4046", // charcoal
    "#c4b89c", // cream
    "#77726a", // concrete
    "#5a5f66", // steel
    "#8a8378",
  ].map(G);
  const midFlicker = {
    allowed: (x, y) => x < BRIDGE_LEFT - 4 || y < TOWER_TOP - 6, // never over the bridge
    layer: () => (chance(0.5) ? "a" : "c"),
  };
  const grid = {
    ww: 2,
    wh: 4,
    gapX: 3,
    gapY: 4,
    top: 7,
    left: 3,
    lit: 0.2,
    flicker: midFlicker,
    flickerRate: 0.1,
  };

  for (let x = -8; x < W;) {
    // Mostly the city as it was, a little taller in the clusters, with the odd slender tower.
    const pencil = chance(0.08);
    const w = pencil ? between(11, 15) : between(17, 40);
    const lift = 0.66 + rise(x + w / 2) * 0.5;
    const h = Math.round((pencil ? between(150, 185) : between(74, 172)) * lift);
    const color = pick(bodies);
    const top = GROUND - h;
    const kind = rand();
    skyline.rect(x, top, w, h, color);
    weather(skyline, d, x, top, w, h);
    // piers: faint vertical ribs, so the walls read as tall
    for (let px = x + 2; px < x + w - 3; px += kind < 0.85 ? 5 : 4) {
      for (let y = top + 3; y < GROUND; y++) skyline.tint(px, y, 1.06);
    }
    skyline.rect(x + w - 3, top, 3, h, shade(color, 0.78)); // shaded side
    skyline.rect(x, top, w, 1, shade(color, 1.12)); // parapet
    if (kind < 0.55) {
      windows(skyline, x, top, w, h, color, grid);
    } else if (kind < 0.82) {
      windows(skyline, x, top, w, h, color, {
        ...grid,
        ww: 3,
        wh: 3,
        gapX: 2,
        gapY: 3,
        top: 6,
        lit: 0.16,
        flickerRate: 0.08,
      });
    } else {
      // curtain wall: tall strips of glass
      for (let wx = x + 3; wx < x + w - 4; wx += 3) {
        for (let wy = top + 5; wy < GROUND - 5; wy++) {
          const on = chance(0.07);
          const tone = on ? pick(lit) : null;
          skyline.set(wx, wy, wy % 7 === 0 ? G("#22303d") : G("#33475a"));
          const when = on ? "always" : later(0.1, 0.3);
          if (when) emit.light(skyline, wx, wy, 1, 1, tone ?? L.pick(lit), when);
        }
      }
    }
    // faded painted sign on the odd wall
    if (chance(0.1) && w > 26 && h > 110) {
      const sx = x + 4;
      const sy = top + between(14, 30);
      for (let yy = 0; yy < 15; yy++) {
        for (let xx = 0; xx < w - 10; xx++) {
          if (bayer(sx + xx, sy + yy) < 0.55)
            skyline.set(sx + xx, sy + yy, mix(color, hex("#bdb39a"), 0.4));
        }
      }
      for (let line = 0; line < 2; line++) {
        for (let xx = 2; xx < w - 13; xx++)
          if (chance(0.7)) skyline.set(sx + xx, sy + 4 + line * 5, shade(color, 0.6));
      }
    }
    // what breaks the roofline
    let peak = top;
    const roof = rand();
    const cx = x + Math.floor(w / 2);
    if (pencil || roof < 0.2) {
      // setbacks, then a mast
      let y = top;
      let sw = w;
      for (let tier = 0; tier < between(1, 3) && sw > 7; tier++) {
        sw -= between(4, 8);
        const sh = between(8, 20);
        y -= sh;
        const sx = cx - Math.floor(sw / 2);
        skyline.rect(sx, y, sw, sh, shade(color, 0.95));
        weather(skyline, d, sx, y, sw, sh);
        skyline.rect(sx, y, sw, 1, shade(color, 1.12));
        skyline.rect(sx + sw - 2, y, 2, sh, shade(color, 0.76));
        windows(skyline, sx, y - 2, sw, sh + 2, color, { ...grid, top: 5, lit: 0.2 });
      }
      const mast = between(8, 26);
      skyline.rect(cx, y - mast, 1, mast, iron);
      peak = y - mast;
      if (chance(0.5)) skyline.rect(cx - 1, y - mast + 4, 3, 1, iron);
    } else if (roof < 0.36) {
      const tip = crown(skyline, cx, top, w, color, between(4, 7));
      const up = between(6, 14);
      skyline.rect(cx, tip - up, 1, 14, iron);
      peak = tip - up;
    } else if (roof < 0.62) {
      waterTower(
        skyline,
        d,
        x + between(2, Math.max(2, w - 9)),
        top,
        chance(0.3) ? 2 : 1,
        woods,
        iron,
      );
    } else if (roof < 0.78) {
      const ax = x + between(3, w - 5);
      const ah = between(12, 30);
      skyline.rect(ax, top - ah, 1, ah, iron);
      skyline.rect(ax - 2, top - ah + 3, 5, 1, iron);
      skyline.rect(ax - 1, top - ah + 7, 3, 1, iron);
    } else if (roof < 0.9) {
      skyline.rect(x + 3, top - 4, 7, 4, G("#7b7a74")); // rooftop plant
      skyline.rect(x + 3, top - 4, 7, 1, G("#9a9890"));
      skyline.rect(x + w - 8, top - 9, 3, 9, G("#55524d"));
    }
    // The tall ones are marked for aircraft: a red light at the very top, on about one in three.
    if (h > 120 && B.chance(0.32)) beacons.push([cx, peak - 1]);
    x += w + between(0, 2);
  }

  // --- smokestacks (their smoke is a separate, moving layer)
  for (const { x, h } of STACKS) {
    const top = GROUND - h;
    skyline.rect(x, top, 6, h, G("#8a8078"));
    skyline.rect(x + 4, top, 2, h, G("#655d56"));
    for (let i = 0; i < 4; i++)
      skyline.rect(x, top + 3 + i * 9, 6, 4, i % 2 ? G("#d2ccbd") : G("#7a3a2e"));
    skyline.rect(x - 1, top, 8, 1, G("#3a3531"));
    for (let dy = 40; dy < h; dy++)
      if (chance(0.3)) skyline.tint(x + between(0, 5), top + dy, 0.82); // soot
  }

  // --- river
  const water = ["#39566d", "#42617a", "#334f66", "#3b586f"].map(hex);
  for (let y = GROUND; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let color = water[(Math.floor(x / 9) + y * 2) % water.length];
      if (bayer(x, y) < 0.14) color = shade(color, 0.9);
      skyline.set(x, y, color);
      if ((x * 7 + y * 13) % 29 === 0) skyline.set(x, y, hex("#748fa2"));
      const glint = rand();
      if (y % 2 === 0 && glint < 0.012) lights.a.rect(x, y, between(2, 4), 1, hex("#a9bcc6"));
      else if (y % 2 === 1 && glint < 0.012) lights.c.rect(x, y, between(2, 4), 1, hex("#9aaeb9"));
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
        if (chance(0.05)) color = shade(color, 0.9);
        skyline.set(x + dx, y, color);
      }
    }
    weather(skyline, d, x, TOWER_TOP, TOWER_W, GROUND - TOWER_TOP);
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
      // the necklace of lamps along the cables, on from dusk
      if (x % 7 === 3 && x < W) emit.light(skyline, x, y - 1, 1, 1, hex("#e9d79a"), "evening");
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
  // the towers are floodlit after dark
  for (const x of [TOWER_1, TOWER_2]) {
    emit.spill(skyline, x + TOWER_W / 2, DECK - 18, 22, hex("#c9ab70"), 0.3, "evening", {
      halo: false,
    });
  }
  skyline.rect(BRIDGE_LEFT - 8, DECK, W - BRIDGE_LEFT + 8, 5, G("#2c2826")); // roadway, in front of the towers
  skyline.rect(BRIDGE_LEFT - 8, DECK, W - BRIDGE_LEFT + 8, 1, G("#6a5f55"));
  for (let x = BRIDGE_LEFT - 6; x < W; x += 6) skyline.rect(x, DECK + 5, 1, 4, G("#2c2826"));
  for (let x = BRIDGE_LEFT - 8; x < W; x += 3) skyline.set(x, DECK - 1, G("#4a423b")); // railing
  beacons.push([TOWER_1 + TOWER_W / 2, TOWER_TOP - 5], [TOWER_2 + TOWER_W / 2, TOWER_TOP - 5]);

  // --- near layer: dark rooftops along the bottom edge, at very different heights
  const near = [
    "#4d3229", // brownstone, in shadow
    "#58382d",
    "#46302a",
    "#2a211e",
    "#33423a",
    "#3b4a5c",
    "#4a3a2c",
    "#1c1917",
    "#4f4a44",
    "#3a3d42",
  ].map(G);
  const tags = ["#a8934a", "#74907c", "#9a5544", "#8097aa", "#b9b3a2"].map(hex);
  const nearFlicker = { allowed: () => true, layer: () => "b" };
  /** The flat tops of the near buildings, for the people who come up to them. */
  const roofs = [];
  for (let x = -10; x < W;) {
    const tall = chance(0.2);
    const w = tall ? between(24, 36) : between(30, 60);
    const h = tall ? between(84, 118) : between(24, 70);
    const color = pick(near);
    const top = H - h;
    rooftops.rect(x, top, w, h, color);
    roofs.push({ x, w, top });
    weather(rooftops, d, x, top, w, h);
    for (let y = top + 4; y < H; y += 4) {
      for (let bx = x + ((y / 4) % 2 ? 0 : 4); bx < x + w; bx += 8) rooftops.tint(bx, y, 0.82); // coursing
    }
    rooftops.rect(x, top, w, 2, shade(color, 1.2)); // cornice, kept quiet
    for (let dx = 1; dx < w; dx += 3) rooftops.set(x + dx, top + 2, shade(color, 1.12)); // dentils
    rooftops.rect(x, top + 3, w, 1, shade(color, 0.66));
    rooftops.rect(x + w - 3, top + 2, 3, h, shade(color, 0.68));
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
    if (extra < 0.28) waterTower(rooftops, d, x + between(4, w - 16), top, 2, woods, iron);
    else if (extra < 0.46) {
      // fire escape
      const fx = x + between(5, Math.max(5, w - 20));
      for (let y = top + 10; y < H; y += 12) {
        rooftops.rect(fx, y, 14, 1, hex("#0c0b0a"));
        rooftops.rect(fx, y - 4, 1, 4, hex("#0c0b0a"));
        rooftops.rect(fx + 13, y - 4, 1, 4, hex("#0c0b0a"));
        rooftops.rect(fx, y - 4, 14, 1, hex("#16130f"));
        for (let i = 0; i < 11; i++) rooftops.set(fx + 1 + i, y + 1 + i, hex("#0c0b0a"));
      }
    } else if (extra < 0.62) {
      const ch = between(9, 20); // a tall chimney and a roof shed
      rooftops.rect(x + 5, top - ch, 7, ch, shade(color, 0.82));
      rooftops.rect(x + 4, top - ch - 1, 9, 2, shade(color, 1.2));
      rooftops.rect(x + w - 16, top - 6, 9, 6, G("#6f6e69"));
      rooftops.rect(x + w - 16, top - 6, 9, 1, G("#8d8b84"));
    } else if (extra < 0.74) {
      // clothesline between two poles, with washing
      const y = top - 8;
      rooftops.rect(x + 4, y, 1, 8, iron);
      rooftops.rect(x + w - 6, y, 1, 8, iron);
      for (let lx = x + 5; lx < x + w - 6; lx++) {
        rooftops.set(
          lx,
          y + 1 + Math.round(Math.sin(((lx - x) / w) * Math.PI) * 1.4),
          G("#bdb6a6"),
        );
      }
      for (let lx = x + 8; lx < x + w - 10; lx += between(5, 8))
        rooftops.rect(lx, y + 3, between(2, 3), between(2, 4), pick(tags));
    } else if (extra < 0.88) {
      // an aerial mast and a dish
      const mh = between(14, 30);
      rooftops.rect(x + w - 10, top - mh, 1, mh, iron);
      rooftops.rect(x + w - 13, top - mh + 2, 7, 1, iron);
      rooftops.rect(x + w - 12, top - mh + 6, 5, 1, iron);
      rooftops.rect(x + 8, top - 5, 1, 5, iron);
      rooftops.rect(x + 6, top - 8, 5, 3, G("#a9a59b"));
    }
    // a scribble of graffiti near street level on some walls
    if (chance(0.3) && h > 40) {
      const tag = pick(tags);
      let gx = x + between(4, Math.max(4, w - 22));
      let gy = H - between(6, 12);
      for (let i = 0; i < between(10, 18); i++) {
        rooftops.set(gx, gy, tag);
        gx += 1;
        gy += between(-1, 1);
      }
    }
    if (chance(0.35))
      for (let i = 0; i < between(1, 3); i++)
        rooftops.rect(x + between(3, w - 5), top - 2, 2, 2, hex("#201d1b")); // pigeons
    x += w;
  }

  // Two billboards on the near roofs, lit from above after dark.
  const boards = [
    { at: 150, lines: ["HOTEL"], face: hex("#2a2420"), ink: hex("#e9c46a") },
    { at: 500, lines: ["BKLYN", "PIZZA"], face: hex("#d6cfbd"), ink: hex("#8f2a1f") },
  ];
  for (const board of boards) {
    const roof = roofs
      .filter((r) => !r.board && r.w >= 40 && r.x >= 0 && r.x + r.w <= W && r.top > 250)
      .sort((a, b) => Math.abs(a.x + a.w / 2 - board.at) - Math.abs(b.x + b.w / 2 - board.at))[0];
    if (!roof) continue;
    roof.board = true;
    billboard(rooftops, emit, { ...board, x: roof.x + 5, roofTop: roof.top, tint: grit });
  }

  // The switching layers: river glints were drawn straight in; add the windows.
  emit.switching(skyline, "a", lights.a);
  emit.switching(skyline, "c", lights.c);
  emit.switching(rooftops, "b", lights.b);

  // Halos for everything lit at night, dealt between two layers per depth so
  // neighbouring lights can pulse out of step.
  const glow = {
    backA: canvas(W, H),
    backB: canvas(W, H),
    frontA: canvas(W, H),
    frontB: canvas(W, H),
  };
  emit.halos(skyline, [glow.backA, glow.backB], dice(51));
  emit.halos(rooftops, [glow.frontA, glow.frontB], dice(52));

  const states = {};
  for (const state of STATES) {
    states[state] = {
      city: emit.render(skyline, state, GRADES[state]),
      rooftops: emit.render(rooftops, state, GRADES[state]),
    };
  }
  const inView = panes
    .filter(
      (p) =>
        p.x >= 0 &&
        p.x + p.w <= W &&
        p.y + p.h < H - 2 &&
        rooftops.owns(p.x, p.y, p.id) &&
        rooftops.owns(p.x + p.w - 1, p.y + p.h - 1, p.id),
    )
    .map(({ x, y, w, h, when }) => ({ x, y, w, h, when }));
  return { states, lights, glow, beacons, roofs, windows: inView };
}

/** Two lanes of lights on the bridge, as seamless strips: headlights, then tail lights. */
function traffic() {
  const length = W - BRIDGE_LEFT + 8;
  const c = canvas(length, 4);
  const { rand } = dice(404);
  for (let lane = 0; lane < 2; lane++) {
    const color = lane === 0 ? hex("#ddd197") : hex("#a8442f");
    for (let x = 6; x < length - 10;) {
      c.rect(x, lane * 2, 2, 1, color);
      if (rand() < 0.3) c.rect(x + 5, lane * 2, 2, 1, color); // a truck
      x += 14 + Math.floor(rand() * 58);
    }
  }
  return c;
}

export function skylineScene(puff, cast) {
  const scene = city();
  const lane = W - BRIDGE_LEFT + 8;
  const images = {
    "lights-a.png": scene.lights.a,
    "lights-b.png": scene.lights.b,
    "lights-c.png": scene.lights.c,
    "glow-back-a.png": scene.glow.backA,
    "glow-back-b.png": scene.glow.backB,
    "glow-front-a.png": scene.glow.frontA,
    "glow-front-b.png": scene.glow.frontB,
    "traffic.png": traffic(),
  };
  for (const state of STATES) {
    images[`city-${state}.png`] = scene.states[state].city;
    images[`rooftops-${state}.png`] = scene.states[state].rooftops;
    images[`people-${state}.png`] = cast.people.graded(grit).graded(PEOPLE_GRADES[state]);
    images[`props-${state}.png`] = cast.props.graded(grit).graded(PEOPLE_GRADES[state]);
    images[`wheels-${state}.png`] = cast.wheels.graded(grit).graded(PEOPLE_GRADES[state]);
  }
  return {
    images,
    config: {
      label: "skyline",
      hint: "the harbour, the bridge and the towers",
      clouds: {
        far: { top: "0%", height: pctY(150), seconds: 420 },
        near: { top: "1.5%", height: pctY(170), seconds: 250 },
      },
      smoke: STACKS.map(({ x, h }, i) => ({
        left: pctX(x - 2),
        top: pctY(GROUND - h - puff.frameH + 3),
        width: pctX(puff.frameW),
        height: pctY(puff.frameH),
        delay: i ? "-1.3s" : "0s",
        opacity: 1,
        front: false,
      })),
      lanes: [
        {
          left: pctX(BRIDGE_LEFT - 8),
          top: pctY(DECK - 3),
          width: pctX(lane),
          height: pctY(1),
          rows: 4,
          row: 0,
          reverse: false,
          seconds: 46,
          steps: lane,
          span: 1,
          front: false,
        },
        {
          left: pctX(BRIDGE_LEFT - 8),
          top: pctY(DECK - 1),
          width: pctX(lane),
          height: pctY(1),
          rows: 4,
          row: 2,
          reverse: true,
          seconds: 64,
          steps: lane,
          span: 1,
          front: false,
        },
      ],
      beacons: scene.beacons.map(([x, y], i) => ({
        left: pctX(x),
        top: pctY(y),
        delay: `${(-i * 0.8).toFixed(1)}s`,
      })),
      birds: { top: "19%", seconds: 70 },
      // Street life: there is no street here, so people come up onto the roofs.
      life: {
        kind: "roofs",
        road: 0,
        near: 0,
        far: 0,
        from: 0,
        to: 0,
        sniff: [],
        linger: [],
        // Roofs wide enough to stroll on, and wholly in the picture.
        roofs: scene.roofs
          .filter(
            (roof) =>
              // not the ones a billboard stands on: people would only get in front of it
              !roof.board && roof.w >= 30 && roof.x >= 0 && roof.x + roof.w <= W && roof.top > 236,
          )
          .map(({ x, w, top }) => ({ x, w, top })),
        stoops: [],
      },
      // Lit windows in plain view, for the people and pets seen moving behind them.
      windows: scene.windows,
    },
  };
}
