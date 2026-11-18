/**
 * Scene two: a brownstone block in Brooklyn.
 *
 * Prospect Heights by way of Bed-Stuy and Flatbush: a row of brownstones with
 * stoops, cornices and bay fronts, a corner bodega, street trees and
 * bishop's-crook lamps coming on. Behind the roofs stand prewar apartment
 * houses with water towers and a church steeple; behind those, the dark
 * canopy of Prospect Park with the memorial arch at its gate, and the clock
 * tower downtown catching the last light. The sun has just gone.
 */
import { empireState, oneWorldTrade } from "./landmarks.mjs";
import {
  flyers,
  neon,
  oneWay,
  plateOnPole,
  sandwichBoard,
  storefront,
  streetSign,
  text,
  textCentred,
} from "./street.mjs";
import { dealer, lamps, stamp, vehicle } from "./vehicles.mjs";
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

const SIDEWALK = 334; // top of the pavement; house fronts stand on it
const CURB = 342;
const PARK_BASE = 262; // where the far towers and the park meet the roofs
const ARCH = { x: 560, w: 50, top: 204, base: 270 };

/** Dusk falls on everything: darker, cooler, a little violet. */
const VIOLET = hex("#3a3050");
const dusk = (c) => desat(mix(shade(c, 0.78), VIOLET, 0.14), 0.1);
const D = (h) => dusk(hex(h));

/**
 * The block is drawn as it looks at dusk; the other lights are that picture
 * regraded (brightened for day, darkened for night), with lamps and windows
 * coming on as it gets darker.
 */
const GRADES = {
  day: grade({ gain: [1.62, 1.56, 1.36], tint: "#b9b3a6", amount: 0.06 }),
  golden: grade({ gain: [1.5, 1.28, 1.02], tint: "#d08a4a", amount: 0.1 }),
  dusk: (c) => c,
  night: grade({ gain: [0.6, 0.62, 0.78], tint: "#131a30", amount: 0.22 }),
};

const WARM = ["#e0b565", "#d29a50", "#ecd08a", "#b98548", "#dfa85a"].map(hex);

/** A tree crown: a ragged disc, dark below, catching sky light along its top edge. */
function crown(c, d, cx, cy, r, tones) {
  const [body, shadow, lit, rim] = tones;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const dist = Math.hypot(x, y * 1.15);
      if (dist > r + d.rand() * 1.6 - 0.8) continue;
      let color = body;
      if (y > r * 0.25) color = (y - r * 0.25) / r > bayer(cx + x, cy + y) * 0.9 ? shadow : body;
      else if (y < -r * 0.3) color = (-y - r * 0.3) / r > bayer(cx + x, cy + y) * 0.9 ? lit : body;
      if (y < 0 && dist > r - 1.8 && d.chance(0.45)) color = rim;
      if (d.chance(0.06)) color = shade(color, 0.88);
      c.set(cx + x, cy + y, color);
    }
  }
}

function block() {
  const skyline = canvas(W, H);
  const rooftops = canvas(W, H);
  // The cars at the kerb get a picture of their own, so that people on the
  // pavement can pass behind them.
  const parked = canvas(W, H);
  const lights = { a: canvas(W, H), b: canvas(W, H), c: canvas(W, H) };
  const d = dice(1127);
  const { rand, pick, between, chance } = d;
  // Lights are recorded, not painted, and decided by their own dice, so the
  // houses come out the same however the lighting rules change.
  const emit = emitter();
  const L = dice(9911);
  /** A window that was lit in the dusk drawing: some burn all day, the rest come on at dusk. */
  const litFrom = () => (L.chance(0.2) ? "always" : "evening");
  /** A window that was dark at dusk: some come on at night. */
  const lateOn = () => (L.chance(0.34) ? "night" : null);
  const iron = hex("#15151a");
  const woods = [D("#5c4434"), D("#66493a")];
  const beacons = [];
  const chimneys = [];
  /** Recorded as the block is drawn, for the life that is added on top of it. */
  const houses = []; // { x, w, top, color, shop }
  const stoops = []; // { x } the middle of each stoop
  const panes = []; // windows that are lit at some hour: { x, y, w, h, when, id }
  // A few rooms are lit by coloured LED strips instead of a lamp. Dice of their own.
  const LED = dice(7001);
  const LED_TONES = ["#c2456e", "#5a7fd6", "#8a5fd0", "#3fae9a", "#d0503a"].map(hex);
  // Which of the far towers carry a red warning light.
  const B = dice(7002);

  // ------------------------------------------------------------ far: downtown in the haze
  const far = ["#4b4966", "#52506c", "#45445e", "#58556f"].map(hex);
  for (let x = -6; x < 320;) {
    const w = between(9, 20);
    const h = Math.round(between(34, 96) * (0.45 + Math.exp(-(((x - 128) / 95) ** 2))));
    const color = pick(far);
    skyline.rect(x, PARK_BASE - h, w, h, color);
    skyline.rect(x + w - 2, PARK_BASE - h, 2, h, shade(color, 0.88));
    // a red warning light on a few of the taller ones
    if (h > 66 && B.chance(0.22)) beacons.push([x + Math.floor(w / 2), PARK_BASE - h - 1]);
    if (chance(0.3))
      skyline.rect(x + Math.floor(w / 2), PARK_BASE - h - between(6, 16), 1, 16, color);
    for (let wy = PARK_BASE - h + 4; wy < PARK_BASE - 4; wy += 4) {
      for (let wx = x + 2; wx < x + w - 3; wx += 3) {
        const roll = rand();
        if (roll < 0.6) skyline.set(wx, wy, shade(color, 0.86));
        if (roll < 0.16) emit.light(skyline, wx, wy, 1, 1, hex("#b89f66"), litFrom());
        else if (roll < 0.22)
          emit.light(skyline, wx, wy, 1, 1, hex("#c9ae70"), chance(0.5) ? "a" : "c");
        else if (roll < 0.6 && L.chance(0.3))
          emit.light(skyline, wx, wy, 1, 1, hex("#b89f66"), "night");
      }
    }
    x += w;
  }
  // ------------------------------------------------------------ farther still: Manhattan
  // Lower Manhattan and midtown stand over the rooftops to the right of
  // downtown, paler for the distance. One World Trade is the tallest thing
  // in the picture. Dice of their own, so the block is dealt as before.
  {
    const M = dice(1776);
    const haze = ["#605e7e", "#676585", "#5b5a79"].map(hex);
    const glow = [hex("#b89f66"), hex("#c9ae70")];
    for (let x = 300; x < 492;) {
      const w = M.between(7, 13);
      const near = Math.exp(-(((x - 352) / 34) ** 2)) + 0.75 * Math.exp(-(((x - 452) / 26) ** 2));
      const h = Math.round(M.between(44, 62) + 46 * near);
      const color = M.pick(haze);
      skyline.rect(x, PARK_BASE - h, w, h, color);
      skyline.rect(x + w - 2, PARK_BASE - h, 2, h, shade(color, 0.9));
      for (let wy = PARK_BASE - h + 3; wy < PARK_BASE - 30; wy += 4) {
        for (let wx = x + 1; wx < x + w - 2; wx += 3) {
          if (M.chance(0.14)) emit.light(skyline, wx, wy, 1, 1, M.pick(glow), "night");
        }
      }
      x += w + (M.chance(0.25) ? M.between(1, 3) : 0);
    }
    beacons.push([
      352,
      oneWorldTrade(skyline, {
        x: 352,
        base: PARK_BASE,
        height: 152,
        width: 15,
        glass: hex("#7476a0"),
        emit,
        L: M,
        lit: glow,
      }),
    ]);
    empireState(skyline, {
      x: 452,
      base: PARK_BASE,
      height: 104,
      width: 17,
      stone: hex("#77728c"),
      emit,
      L: M,
      lit: glow,
      flood: hex("#e6d9b4"),
    });
  }

  // The clock tower (the Williamsburgh Savings Bank tower, downtown Brooklyn's
  // own landmark): a slender stepped shaft under a dome, its clock face lit.
  {
    const cx = 168;
    const stone = hex("#665f78");
    let y = PARK_BASE;
    for (const [w, h] of [
      [20, 96],
      [16, 26],
      [12, 18],
      [8, 10],
    ]) {
      y -= h;
      const left = cx - w / 2;
      skyline.rect(left, y, w, h, stone);
      skyline.rect(left + w - 3, y, 3, h, shade(stone, 0.82));
      skyline.rect(left, y, 2, h, mix(stone, hex("#c08a70"), 0.35)); // last light on the west face
      for (let wy = y + 4; wy < y + h - 2; wy += 5) {
        for (let wx = left + 3; wx < left + w - 4; wx += 3) {
          const on = chance(0.2);
          skyline.set(wx, wy, shade(stone, 0.8));
          const when = on ? "evening" : lateOn();
          if (when) emit.light(skyline, wx, wy, 1, 1, hex("#c4aa6c"), when);
        }
      }
    }
    for (const [dx, dy] of [
      [-1, 0],
      [0, 0],
      [-1, 1],
      [0, 1],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, 1],
    ]) {
      skyline.set(cx + dx, y + 20 + dy, hex("#9a93a8")); // clock face, lit from dusk
      emit.light(skyline, cx + dx, y + 20 + dy, 1, 1, hex("#e6d49a"), "evening");
    }
    skyline.set(cx - 1, y + 21, hex("#3a3448"));
    for (const [w, dy] of [
      [8, 1],
      [8, 2],
      [6, 3],
      [6, 4],
      [4, 5],
      [2, 6],
    ])
      skyline.rect(cx - w / 2, y - dy, w, 1, hex("#4f5f5a")); // dome
    skyline.rect(cx - 1, y - 12, 2, 6, stone);
    skyline.rect(cx, y - 18, 1, 6, stone);
    beacons.push([cx, y - 19]);
  }

  // ------------------------------------------------------------ the park
  skyline.rect(0, 244, W, H - 244, hex("#1c241d"));
  const back = ["#33413a", "#29352f", "#4d5646", "#8d7354"].map(hex);
  const front = ["#273326", "#1e281e", "#3d4835", "#7b6549"].map(hex);
  for (let x = -12; x < W + 14; x += between(9, 14))
    crown(skyline, d, x, 238 + between(-13, 2), between(10, 17), back);
  // a few taller specimens, so the canopy is not a hedge
  for (const x of [34, 205, 268, 352, 452, 520, 628])
    crown(skyline, d, x, 222 + between(-6, 4), between(15, 21), back);
  for (let x = -10; x < W + 14; x += between(10, 16))
    crown(skyline, d, x, 250 + between(-6, 4), between(11, 18), front);
  for (const x of [226, 330, 486, 636]) {
    skyline.rect(x, 252, 1, 12, iron); // park lamps
    skyline.rect(x - 1, 251, 3, 2, hex("#8c8676"));
    const lamp = emit.light(skyline, x - 1, 251, 3, 2, hex("#ecd592"), "evening");
    emit.spill(skyline, x, 252, 11, hex("#c9a25c"), 0.5, "evening", {
      of: { id: lamp, x, y: 251 },
    });
  }

  // ------------------------------------------------------------ the memorial arch at the park gate
  {
    const { x, w, top, base } = ARCH;
    const stone = hex("#857a74");
    const dim = hex("#5c544f");
    const opening = 22;
    const pier = (w - opening) / 2;
    const spring = base - 34; // where the arch starts to curve
    for (let y = top + 12; y < base; y++) {
      for (let dx = 0; dx < w; dx++) {
        const inOpening = dx >= pier && dx < pier + opening;
        if (inOpening) {
          const half = opening / 2;
          const rx = dx - pier - half + 0.5;
          if (y >= spring || Math.hypot(rx, y - spring) < half) continue; // the passage
        }
        let color = dx > w - 7 ? dim : stone;
        if ((y - top) % 6 === 0 || (dx + (Math.floor((y - top) / 6) % 2) * 4) % 9 === 0)
          color = shade(color, 0.9);
        skyline.set(x + dx, y, color);
      }
    }
    skyline.rect(x - 2, top + 9, w + 4, 3, shade(stone, 1.12)); // cornice
    skyline.rect(x - 2, top + 12, w + 4, 1, shade(stone, 0.7));
    skyline.rect(x + 3, top + 2, w - 6, 7, stone); // attic
    skyline.rect(x + 3, top + 2, w - 6, 1, shade(stone, 1.1));
    // the bronze group on top, gone green
    const bronze = hex("#34463f");
    skyline.rect(x + 17, top - 5, 16, 7, bronze);
    for (const [dx, dh] of [
      [18, 3],
      [21, 5],
      [24, 8],
      [26, 4],
      [29, 6],
      [31, 3],
    ])
      skyline.rect(x + dx, top - 5 - dh, 2, dh, bronze);
    skyline.rect(x + 5, top - 3, 6, 5, bronze);
    skyline.rect(x + 7, top - 6, 2, 3, bronze);
    skyline.rect(x + w - 11, top - 3, 6, 5, bronze);
    skyline.rect(x + w - 9, top - 6, 2, 3, bronze);
    // flanking columns
    for (const cx of [x - 13, x + w + 10]) {
      skyline.rect(cx, top + 18, 3, base - top - 18, stone);
      skyline.rect(cx + 2, top + 18, 1, base - top - 18, dim);
      skyline.rect(cx - 1, top + 16, 5, 2, shade(stone, 1.1));
      skyline.rect(cx, top + 12, 3, 4, bronze);
    }
    weather(skyline, d, x, top + 12, w, base - top - 12, 0.7);
    emit.spill(skyline, x + w / 2, base - 6, 26, hex("#d2a862"), 0.42, "evening"); // floodlit from below
  }

  // ------------------------------------------------------------ mid: apartment houses and a church
  const midFlicker = () => (chance(0.5) ? "a" : "c");
  const apartment = (x, w, h, color) => {
    const top = SIDEWALK - h;
    skyline.rect(x, top, w, h, color);
    weather(skyline, d, x, top, w, h);
    for (let y = top + 4; y < SIDEWALK; y += 4) {
      for (let bx = x + ((y / 4) % 2 ? 1 : 4); bx < x + w - 2; bx += 7) skyline.tint(bx, y, 0.92); // coursing
    }
    // a light court down the middle, and piers, to make it stand tall
    const court = x + Math.floor(w / 2) - 3;
    skyline.rect(court, top + 6, 6, h, shade(color, 0.7));
    skyline.rect(x, top, w, 2, shade(color, 1.22)); // parapet
    skyline.rect(x, top + 2, w, 1, shade(color, 0.72));
    skyline.rect(x + Math.floor(w / 2) - 6, top - 3, 12, 3, shade(color, 1.1)); // pediment
    skyline.rect(x + w - 3, top, 3, h, shade(color, 0.74));
    for (let wy = top + 8; wy + 5 < SIDEWALK - 4; wy += 10) {
      for (let wx = x + 4; wx + 3 < x + w - 4; wx += 7) {
        if (wx + 3 >= court && wx <= court + 6) continue;
        const on = chance(0.38);
        const tone = pick(WARM);
        skyline.rect(wx - 1, wy - 1, 5, 1, shade(color, 1.18)); // lintel
        skyline.rect(wx, wy, 3, 5, hex("#1b1c25"));
        const blind = on && chance(0.45);
        skyline.set(wx, wy, hex("#3d3e58")); // the sky in the glass
        skyline.rect(wx - 1, wy + 5, 5, 1, shade(color, 1.22));
        skyline.tint(wx + 1, wy + 6, 0.84);
        let when = on ? litFrom() : null;
        let glass = tone;
        if (!on && chance(0.12)) {
          when = midFlicker(); // one of the windows that switch on and off
          glass = pick(WARM);
        }
        when ??= lateOn();
        if (when) {
          const id = emit.light(skyline, wx, wy, 3, 5, glass, when);
          if (blind) emit.detail(skyline, id, wx, wy, 3, 2, shade(tone, 0.7), when);
        }
      }
    }
    // fire escape down one bay
    const fx = x + 5;
    for (let y = top + 16; y < SIDEWALK; y += 10) {
      skyline.rect(fx, y, 12, 1, iron);
      skyline.rect(fx, y - 3, 12, 1, hex("#22222a"));
      for (let i = 0; i < 9; i++) skyline.set(fx + 1 + i, y + 1 + i, iron);
    }
    if (chance(0.7)) waterTower(skyline, d, x + between(6, w - 18), top, 2, woods, iron);
    skyline.rect(x + w - 16, top - 6, 9, 6, shade(color, 0.86)); // stair bulkhead
    skyline.rect(x + w - 16, top - 6, 9, 1, shade(color, 1.1));
    if (chance(0.5)) {
      const ax = x + between(8, w - 22);
      skyline.rect(ax, top - 16, 1, 16, iron);
      skyline.rect(ax - 2, top - 14, 5, 1, iron);
    }
  };
  const brick = ["#8a7458", "#7b6650", "#6e5247", "#746f66", "#84705a", "#6a5a4c"].map(D);
  for (const [x, w, h] of [
    [6, 66, 136],
    [92, 54, 108],
    [218, 68, 148],
    [306, 54, 116],
    [384, 72, 132],
    [470, 42, 104],
  ]) {
    apartment(x, w, h, pick(brick));
  }
  // the church: a gabled nave and a steeple
  {
    const stone = D("#857c70");
    const slate = D("#444b56");
    const x = 520;
    skyline.rect(x + 12, 250, 30, SIDEWALK - 250, stone); // nave wall
    for (let i = 0; i < 16; i++)
      skyline.rect(x + 12 + i, 250 - i, 30 - i * 2, 1, i % 3 ? slate : shade(slate, 0.85)); // gable roof
    skyline.rect(x + 25, 254, 4, 6, hex("#22232c")); // window in the gable
    emit.light(skyline, x + 25, 254, 4, 6, hex("#b98a4c"), "evening");
    skyline.rect(x, 178, 12, SIDEWALK - 178, stone); // tower
    skyline.rect(x + 9, 178, 3, SIDEWALK - 178, shade(stone, 0.74));
    weather(skyline, d, x, 178, 12, 90);
    skyline.rect(x - 1, 176, 14, 2, shade(stone, 1.15));
    for (const wy of [186, 204, 224]) {
      skyline.rect(x + 4, wy, 3, 8, hex("#17171d")); // louvres, one lit after dark
      skyline.set(x + 5, wy - 1, hex("#17171d"));
      if (wy === 224) {
        emit.light(skyline, x + 4, wy, 3, 8, hex("#a87f48"), "evening");
        emit.light(skyline, x + 5, wy - 1, 1, 1, hex("#a87f48"), "evening");
      }
    }
    for (let i = 0; i < 36; i++) {
      const sw = Math.max(1, Math.round(12 * (1 - i / 36)));
      skyline.rect(x + 6 - Math.floor(sw / 2), 176 - i, sw, 1, i % 4 ? slate : shade(slate, 0.82)); // spire
    }
    skyline.rect(x + 6, 132, 1, 9, iron);
    skyline.rect(x + 4, 135, 5, 1, iron); // cross
  }

  // ------------------------------------------------------------ front: the block itself
  // pavement and roadway
  const paving = D("#77726a");
  rooftops.rect(0, SIDEWALK, W, CURB - SIDEWALK, paving);
  for (let x = 0; x < W; x += 12)
    rooftops.rect(x, SIDEWALK, 1, CURB - SIDEWALK, shade(paving, 0.8));
  rooftops.rect(0, CURB, W, 1, shade(paving, 1.25));
  const road = hex("#26262c");
  rooftops.rect(0, CURB + 1, W, H - CURB - 1, road);
  for (let y = CURB + 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const roll = rand();
      if (roll < 0.06) rooftops.tint(x, y, 0.86);
      else if (roll > 0.97) rooftops.tint(x, y, 1.18);
    }
  }
  for (let x = 4; x < W; x += 16) rooftops.rect(x, 351, 7, 1, hex("#6f6850")); // worn centre line
  for (const x of [118, 402]) {
    rooftops.rect(x, 354, 7, 3, hex("#1b1b20")); // manhole
    rooftops.rect(x, 354, 7, 1, hex("#3a3a42"));
  }

  const stones = [
    "#6b4a3b", // brownstone
    "#75523f",
    "#5f4135",
    "#7f5d49",
    "#553b31",
    "#6f4c40",
    "#6b4a3b",
    "#75523f",
    "#8f8676", // limestone
    "#9a917f",
    "#5c6a62", // painted sage
    "#4f5d6e", // painted slate
    "#70483f", // red brick, dulled
    "#403937",
  ].map(D);

  const pane = (wx, wy, ww, wh, color, litRate) => {
    const on = chance(litRate);
    const tone = pick(WARM);
    rooftops.rect(wx - 1, wy - 2, ww + 2, 2, shade(color, 1.24)); // lintel
    rooftops.rect(wx, wy, ww, wh, hex("#191a22"));
    let dressing = null;
    if (on) {
      if (chance(0.45)) dressing = "shade";
      else if (chance(0.3)) dressing = "curtain";
    }
    rooftops.rect(wx, wy, 2, 2, hex("#3b3c57")); // the sky in the glass
    const sash = wy + Math.floor(wh / 2);
    rooftops.rect(wx, sash, ww, 1, hex("#0f1015"));
    rooftops.rect(wx - 1, wy + wh, ww + 2, 1, shade(color, 1.3)); // sill
    rooftops.tint(wx + 1, wy + wh + 1, 0.82);
    rooftops.tint(wx + 2, wy + wh + 2, 0.9);
    let when = on ? litFrom() : null;
    if (!on && chance(0.32)) when = "b"; // one of the windows that switch on and off
    when ??= lateOn();
    if (!when) return;
    // Now and then the light in a room is a coloured LED strip, not a warm lamp.
    const glow = LED.chance(0.025) ? LED.pick(LED_TONES) : tone;
    const id = emit.light(rooftops, wx, wy, ww, wh, glow, when);
    if (dressing === "shade") {
      emit.detail(rooftops, id, wx, wy, ww, Math.ceil(wh * 0.4), shade(glow, 0.68), when); // pulled down
    } else if (dressing === "curtain") {
      emit.detail(rooftops, id, wx, wy, 1, wh, shade(glow, 0.6), when);
    }
    emit.detail(rooftops, id, wx, sash, ww, 1, shade(glow, 0.55), when);
    if (when !== "b") panes.push({ x: wx, y: wy, w: ww, h: wh, when, id });
  };

  const brownstone = (x, w, floors, color, shop) => {
    const garden = 10;
    const parlor = 24;
    const upper = 20;
    const h = garden + parlor + upper * floors + 6;
    const top = SIDEWALK - h;
    rooftops.rect(x, top, w, h, color);
    weather(rooftops, d, x, top, w, h);
    rooftops.rect(x + w - 1, top, 1, h, shade(color, 0.66)); // party wall
    const bayW = Math.floor((w - 4) / 3);
    const doorBay = chance(0.5) ? 0 : 2;
    const bayX = (b) => x + 2 + b * bayW + Math.floor((bayW - 5) / 2);
    // a projecting bay front on some houses
    if (!shop && chance(0.34)) {
      const bx = doorBay === 0 ? x + 2 + bayW : x + 2;
      for (let y = top + 6; y < SIDEWALK - garden; y++) {
        for (let dx = 0; dx < bayW * 2; dx++)
          rooftops.tint(bx + dx, y, dx < 2 || dx > bayW * 2 - 3 ? 0.84 : 1.09);
      }
    }
    // cornice with brackets
    rooftops.rect(x - 1, top, w + 2, 2, shade(color, 1.3));
    rooftops.rect(x - 1, top + 2, w + 2, 2, shade(color, 1.08));
    for (let bx = x; bx < x + w - 1; bx += 4) rooftops.rect(bx, top + 4, 2, 2, shade(color, 0.72));
    rooftops.rect(x, top + 6, w, 1, shade(color, 0.7));

    let fy = top + 6;
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < 3; b++) pane(bayX(b), fy + 6, 5, 10, color, 0.44);
      fy += upper;
      rooftops.rect(x, fy, w - 1, 1, shade(color, 0.84)); // belt course
    }

    if (shop) {
      // the corner bodega: sign, striped awning, a lit window, crates out front
      const sy = fy + 3;
      rooftops.rect(x + 1, sy, w - 3, 6, D("#7a2f25"));
      // The sign used to be a row of dashes, one roll of the dice each. The rolls
      // are still made, so the rest of the block is dealt as before.
      for (let lx = x + 4; lx < x + w - 5; lx += 2) chance(0.72);
      textCentred(rooftops, x + 1, w - 3, sy + 1, "BODEGA", hex("#e3cf8c"));
      for (let ax = x; ax < x + w - 1; ax++) {
        rooftops.rect(
          ax,
          sy + 6,
          1,
          4,
          Math.floor((ax - x) / 3) % 2 ? hex("#a8924e") : hex("#5c2a23"),
        );
      }
      rooftops.rect(x, sy + 10, w - 1, 1, hex("#2a1a17"));
      const wy = sy + 12;
      rooftops.rect(x + 3, wy, w - 16, 14, hex("#2b2a2e"));
      emit.light(rooftops, x + 3, wy, w - 16, 14, hex("#e3bd72"), "always"); // open all hours
      for (let lx = x + 4; lx < x + w - 14; lx += 3)
        rooftops.rect(lx, wy + 8 + (lx % 2), 2, 6 - (lx % 2), hex("#7a5a34")); // stock on the shelves
      rooftops.rect(x + 3, wy + 6, w - 16, 1, hex("#a67c44"));
      // fruit on the shelf, and the word in the window
      for (let lx = x + 4; lx < x + w - 14; lx += 2) {
        rooftops.set(
          lx,
          wy + 5,
          ["#7b8c4a", "#b0683c", "#b9a04a", "#a8382c"].map(hex)[(lx >> 1) % 4],
        );
      }
      rooftops.rect(x + w - 11, wy - 1, 8, 21, hex("#3a2a22")); // door
      rooftops.rect(x + w - 10, wy, 6, 12, hex("#2b2a2e"));
      emit.light(rooftops, x + w - 10, wy, 6, 12, hex("#d8ae66"), "always");
      for (const [cx, tone] of [
        [x + 3, "#7b8c4a"],
        [x + 9, "#b0683c"],
        [x + 15, "#b9a04a"],
      ]) {
        rooftops.rect(cx, SIDEWALK - 5, 5, 5, hex("#4a3628")); // crates
        rooftops.rect(cx, SIDEWALK - 6, 5, 2, hex(tone));
      }
      emit.spill(rooftops, x + w / 2, SIDEWALK - 2, 20, hex("#d9b061"), 0.5, "evening");
      // lettering in the window, over the light: dull red by day, neon after dark
      neon(rooftops, emit, x + 5, wy + 1, "OPEN", hex("#7a2f25"), hex("#f0705a"));
      return top;
    }

    // parlor floor: tall windows, and the front door at the head of the stoop
    for (let b = 0; b < 3; b++) {
      if (b !== doorBay) pane(bayX(b), fy + 6, 5, 14, color, 0.5);
    }
    const doorX = bayX(doorBay) - 1;
    rooftops.rect(doorX - 1, fy + 5, 9, 2, shade(color, 1.26)); // door hood
    const transomLit = chance(0.6);
    const transomTone = transomLit ? pick(WARM) : L.pick(WARM);
    rooftops.rect(doorX, fy + 7, 7, 2, hex("#22232c")); // transom
    const transomWhen = transomLit ? "evening" : lateOn();
    if (transomWhen) emit.light(rooftops, doorX, fy + 7, 7, 2, transomTone, transomWhen);
    rooftops.rect(
      doorX,
      fy + 9,
      7,
      15,
      pick(["#2c211c", "#27302b", "#3a2622", "#1f2630"].map(hex)),
    );
    rooftops.rect(doorX + 3, fy + 10, 1, 14, hex("#16110f"));
    rooftops.set(doorX + 5, fy + 17, hex("#b99a5a")); // knob
    fy += parlor;
    rooftops.rect(x, fy, w - 1, 1, shade(color, 0.8));

    // garden level: low windows behind bars, and the gate under the stoop
    for (let b = 0; b < 3; b++) {
      if (b === doorBay) continue;
      const wx = bayX(b);
      const on = chance(0.3);
      const tone = on ? pick(WARM) : null;
      rooftops.rect(wx, fy + 3, 5, 5, hex("#16171d"));
      if (on) emit.light(rooftops, wx, fy + 3, 5, 5, tone, "evening");
      rooftops.rect(wx + 1, fy + 3, 1, 5, iron);
      rooftops.rect(wx + 3, fy + 3, 1, 5, iron);
    }
    // the stoop: treads coming down to the pavement, with railings
    const sx = doorX - 1;
    stoops.push({ x: sx + 4, house: x });
    for (let step = 0; step < 5; step++) {
      const y = fy + step * 2;
      rooftops.rect(sx - step, y, 9 + step * 2, 1, shade(color, 1.26)); // tread
      rooftops.rect(sx - step, y + 1, 9 + step * 2, 1, shade(color, 0.74)); // riser
    }
    for (const side of [sx - 5, sx + 13]) {
      rooftops.rect(side, SIDEWALK - 9, 1, 9, iron); // newel
      rooftops.rect(side - 1, SIDEWALK - 10, 3, 1, iron);
    }
    for (let i = 0; i < 5; i++) {
      rooftops.set(sx - 4 + i, SIDEWALK - 9 - i * 2, iron); // handrails
      rooftops.set(sx + 12 - i, SIDEWALK - 9 - i * 2, iron);
    }
    // front area: railings, and the bins
    for (let fx = x + 1; fx < x + w - 1; fx += 2) {
      if (fx > sx - 7 && fx < sx + 15) continue;
      rooftops.rect(fx, SIDEWALK - 5, 1, 5, iron);
    }
    if (chance(0.5)) {
      const bx = doorBay === 0 ? x + w - 9 : x + 3;
      rooftops.rect(bx, SIDEWALK - 6, 4, 6, hex("#3b423f"));
      rooftops.rect(bx - 1, SIDEWALK - 7, 6, 1, hex("#555d59"));
    }
    return top;
  };

  let shopPlaced = false;
  for (let x = -8; x < W;) {
    const w = between(34, 44);
    const nearArch = x + w > ARCH.x - 34 && x < ARCH.x + ARCH.w + 24;
    const floors = nearArch ? 2 : pick([2, 3, 3, 3, 4]);
    const shop = !shopPlaced && x > 138 && x < 176;
    if (shop) shopPlaced = true;
    const color = pick(stones);
    const top = brownstone(x, w, floors, color, shop);
    houses.push({ x, w, top, color, shop });
    // on the roof
    const extra = rand();
    if (extra < 0.5) {
      const cx = x + (chance(0.5) ? 2 : w - 9);
      const ch = between(7, 13);
      rooftops.rect(cx, top - ch, 6, ch, shade(color, 0.84));
      rooftops.rect(cx - 1, top - ch - 1, 8, 2, shade(color, 1.2));
      rooftops.rect(cx + 1, top - ch - 3, 2, 2, hex("#3a2f2a"));
      rooftops.rect(cx + 4, top - ch - 3, 1, 2, hex("#3a2f2a"));
      chimneys.push([cx + 1, top - ch - 3]);
    } else if (extra < 0.66) {
      rooftops.rect(x + 6, top - 5, 10, 5, D("#6f6e69")); // roof hatch
      rooftops.rect(x + 6, top - 5, 10, 1, D("#8d8b84"));
    } else if (extra < 0.8) {
      rooftops.rect(x + w - 12, top - 12, 1, 12, iron); // aerial
      rooftops.rect(x + w - 15, top - 10, 7, 1, iron);
    }
    if (chance(0.3))
      for (let i = 0; i < between(1, 2); i++)
        rooftops.rect(x + between(4, w - 6), top - 2, 2, 2, hex("#17161a")); // pigeons
    x += w;
  }

  // ------------------------------------------------------------ more shops, and signs
  // Two more houses give their ground floors over to shops: a bakery and a
  // pizza place. Each is the house nearest a chosen spot, so they stay put
  // however the row is dealt.
  const nearest = (spot) =>
    houses
      .filter((house) => !house.shop && !house.taken && house.x > 0 && house.x + house.w < W)
      .sort((a, b) => Math.abs(a.x + a.w / 2 - spot) - Math.abs(b.x + b.w / 2 - spot))[0];
  const shops = [
    {
      at: 346,
      name: "BAKERY",
      sign: D("#39503f"),
      ink: hex("#e9e4d2"),
      awning: [D("#c9c2ae"), D("#39503f")],
      goods: "bread",
      word: "BREAD",
      neonDull: hex("#8a6a2c"),
      neonTone: hex("#fff0c0"),
    },
    {
      at: 462,
      name: "PIZZA",
      sign: D("#8f2a1f"),
      ink: hex("#f0e2b0"),
      awning: [D("#d6cfbd"), D("#8f2a1f")],
      goods: "pies",
      word: "SLICE",
      neonDull: hex("#7a2f25"),
      neonTone: hex("#ff7a5c"),
    },
  ];
  for (const shop of shops) {
    const house = nearest(shop.at);
    if (!house) continue;
    house.taken = true;
    storefront(rooftops, emit, {
      ...shop,
      // a shorter word where the window is narrow
      word: house.w - 16 >= 22 ? shop.word : "OPEN",
      x: house.x,
      w: house.w,
      base: SIDEWALK,
      wall: house.color,
      tone: hex("#e3bd72"),
      tint: dusk,
    });
  }
  // Their stoops went with the parlour floors.
  const seats = stoops.filter((stoop) => !houses.find((h) => h.x === stoop.house)?.taken);

  /** Draws something in daylight colours and sets it into the dusk the block is drawn in. */
  const set = (w, h, x, y, draw) => {
    const piece = canvas(w, h);
    draw(piece);
    stamp(rooftops, piece, x, y + h - 1, { tone: dusk });
  };
  // a board on the pavement outside each shop
  for (const house of houses.filter((h) => h.shop || h.taken)) {
    const face = house.shop ? hex("#2b2d33") : hex("#d6cfbd");
    const ink = house.shop ? hex("#e3cf8c") : hex("#7a3328");
    set(5, 8, house.x + house.w - 18, SIDEWALK - 5, (c) => sandwichBoard(c, 0, 7, face, ink));
  }

  // Parked along the kerb: all sorts, nose to the right like the lane beside them.
  // The old dice are still thrown so the trees after them fall as before; the
  // make and paint of each car come from dice of their own.
  const paints = ["#3a4654", "#5a3d36", "#4a4a48", "#2c3a33", "#6b6558", "#2b2d33"].map(D);
  const park = dealer(dice(808), PARKED);
  for (const x of [22, 96, 204, 262, 356, 438, 548, 598]) {
    if (chance(0.2)) continue;
    pick(paints);
    const car = park();
    stamp(parked, vehicle(car.kind, car.paint), x, PARKED_BASE, { tone: dusk });
    lamps(parked, car, x, PARKED_BASE);
  }
  rooftops.rect(306, SIDEWALK - 6, 3, 6, D("#8f3d2f")); // a hydrant
  rooftops.rect(305, SIDEWALK - 4, 5, 1, D("#8f3d2f"));

  // street trees
  const leaves = ["#253122", "#1b241a", "#3a4630", "#5f6238"].map(hex);
  for (const tx of TREES) {
    const trunk = hex("#1c1714");
    rooftops.rect(tx, 300, 2, SIDEWALK - 300, trunk);
    for (let i = 0; i < 7; i++) {
      rooftops.set(tx - 1 - i, 300 - i, trunk); // boughs
      rooftops.set(tx + 2 + i, 301 - i, trunk);
    }
    rooftops.rect(tx - 3, SIDEWALK - 3, 8, 1, iron); // tree guard
    crown(rooftops, d, tx - 8, 292 + between(-3, 2), between(10, 13), leaves);
    crown(rooftops, d, tx + 9, 291 + between(-3, 2), between(10, 13), leaves);
    crown(rooftops, d, tx + 1, 283 + between(-3, 2), between(11, 15), leaves);
  }

  // street lamps: bishop's crooks, just come on
  for (const lx of [96, 276, 436, 618]) {
    rooftops.rect(lx, 300, 1, SIDEWALK - 300, iron);
    rooftops.rect(lx - 1, SIDEWALK - 4, 3, 4, iron);
    for (const [dx, dy] of [
      [0, -1],
      [1, -2],
      [2, -3],
      [3, -3],
      [4, -2],
      [5, -1],
    ])
      rooftops.set(lx + dx, 300 + dy, iron);
    rooftops.rect(lx + 4, 300, 3, 2, hex("#8f8a7c"));
    emit.light(rooftops, lx + 4, 300, 3, 2, hex("#f2dfa0"), "evening");
    emit.spill(rooftops, lx + 5, 303, 20, hex("#d9b061"), 0.6, "evening");
    emit.custom(
      rooftops,
      (c) => {
        for (let y = 0; y < 5; y++) {
          for (let x = -14; x <= 16; x++) {
            if (1 - Math.abs(x) / 16 > bayer(lx + x, SIDEWALK + y) * 1.2) {
              c.blend(lx + x, SIDEWALK + y, hex("#d9b061"), 0.3); // on the pavement
            }
          }
        }
      },
      "evening",
    );
    for (const [dx, dy] of [
      [3, 0],
      [8, 1],
      [5, 2],
      [11, 0],
    ])
      emit.custom(rooftops, (c) => c.set(lx + dx, 346 + dy, hex("#8a7748")), "evening"); // in the wet road
  }

  // Signs on the lamp posts and along the kerb: where you are, which way the
  // street runs, where the bus stops and where not to park.
  set(40, 7, 97, 307, (c) => streetSign(c, 0, 0, "PARK PL"));
  set(30, 7, 416, 307, (c) => streetSign(c, 0, 0, "7 AV"));
  set(13, 5, 619, 309, (c) => oneWay(c, 0, 0));
  set(5, 24, 222, SIDEWALK - 24, (c) => plateOnPole(c, 2, 24, 24, hex("#34485e"), hex("#e9e4d2")));
  set(5, 22, 520, SIDEWALK - 22, (c) => plateOnPole(c, 2, 22, 22, hex("#e9e4d2"), hex("#a8382c")));

  emit.switching(skyline, "a", lights.a);
  emit.switching(skyline, "c", lights.c);
  emit.switching(rooftops, "b", lights.b);

  const glow = {
    backA: canvas(W, H),
    backB: canvas(W, H),
    frontA: canvas(W, H),
    frontB: canvas(W, H),
  };
  emit.halos(skyline, [glow.backA, glow.backB], dice(61));
  emit.halos(rooftops, [glow.frontA, glow.frontB], dice(62));

  const states = {};
  for (const state of STATES) {
    states[state] = {
      city: emit.render(skyline, state, GRADES[state]),
      rooftops: emit.render(rooftops, state, GRADES[state]),
      parked: emit.render(parked, state, GRADES[state]),
    };
  }
  // Windows still in plain sight: not behind a tree, not swallowed by a shop.
  const windows = panes
    .filter(
      (p) =>
        p.x >= 0 &&
        p.x + p.w <= W &&
        rooftops.owns(p.x, p.y, p.id) &&
        rooftops.owns(p.x + p.w - 1, p.y + p.h - 1, p.id) &&
        rooftops.owns(p.x + 2, p.y + Math.floor(p.h / 2) + 1, p.id),
    )
    .map(({ x, y, w, h, when }) => ({ x, y, w, h, when }));
  const roofs = houses
    .filter((house) => house.x >= 0 && house.x + house.w <= W)
    .map(({ x, w, top }) => ({ x, w, top }));
  return { states, lights, glow, beacons, chimneys, windows, roofs, stoops: seats };
}

/** Where parked cars' wheels rest, and where each lane's do. */
const PARKED_BASE = 348;
const LANES = [
  { base: 353, seconds: 44, reverse: true }, // by the kerb, heading right
  { base: 359, seconds: 52, reverse: false }, // nearer us, heading left
];
const LANE_ROW = 18; // tall enough for a bus
const LANE_SPAN = 3; // the strip is this many pictures long, so the traffic takes a while to repeat

const PARKED = [
  ["sedan", 4],
  ["hatchback", 3],
  ["suv", 3],
  ["pickup", 1.5],
  ["van", 1],
  ["sports", 0.7],
];
const MOVING = [
  ["sedan", 4],
  ["hatchback", 2],
  ["suv", 3],
  ["taxi", 2.2],
  ["pickup", 1.5],
  ["van", 1.5],
  ["sports", 1],
  ["truck", 1],
  ["bus", 0.9],
];

/**
 * What passes on the street: one long seamless strip per lane, in one light.
 * The same dice deal the same traffic in every light; after dark the lamps
 * are on.
 */
function traffic(state) {
  const c = canvas(W * LANE_SPAN, LANE_ROW * LANES.length);
  const d = dice(606);
  const next = dealer(d, MOVING);
  const tone = (p) => GRADES[state](dusk(p));
  const on = state === "dusk" || state === "night";
  LANES.forEach((lane, row) => {
    const base = (row + 1) * LANE_ROW - 1;
    const flip = !lane.reverse; // the strip that slides left carries cars facing left
    let x = d.between(20, 120);
    for (;;) {
      const v = next();
      if (x + v.w > c.w - 60) break;
      stamp(c, vehicle(v.kind, v.paint), x, base, { flip, tone });
      lamps(c, v, x, base, { flip, on });
      x += v.w + d.between(200, 480);
    }
  });
  return c;
}

/** Things on the pavement worth stopping at, by x. */
const TREES = [58, 132, 236, 318, 398, 474, 590];
const HYDRANT = 307;

export function brooklynScene(puff, cast) {
  const scene = block();
  const smokers = scene.chimneys.filter(([x]) => x < 215 || x > 515).slice(0, 2);
  const images = {
    "lights-a.png": scene.lights.a,
    "lights-b.png": scene.lights.b,
    "lights-c.png": scene.lights.c,
    "glow-back-a.png": scene.glow.backA,
    "glow-back-b.png": scene.glow.backB,
    "glow-front-a.png": scene.glow.frontA,
    "glow-front-b.png": scene.glow.frontB,
  };
  for (const state of STATES) {
    images[`traffic-${state}.png`] = traffic(state);
    images[`city-${state}.png`] = scene.states[state].city;
    images[`rooftops-${state}.png`] = scene.states[state].rooftops;
    images[`parked-${state}.png`] = scene.states[state].parked;
    // The cast is drawn in daylight colours; bring it into this block's dusk
    // palette first, then light it like everything else here.
    images[`people-${state}.png`] = cast.people.graded(dusk).graded(GRADES[state]);
    images[`props-${state}.png`] = cast.props.graded(dusk).graded(GRADES[state]);
    images[`wheels-${state}.png`] = cast.wheels.graded(dusk).graded(GRADES[state]);
  }
  return {
    images,
    config: {
      label: "brooklyn",
      hint: "a brownstone block by Prospect Park",
      clouds: {
        far: { top: "2%", height: pctY(150), seconds: 520 },
        near: { top: "6%", height: pctY(170), seconds: 320 },
      },
      smoke: smokers.map(([x, y], i) => ({
        left: pctX(x - 3),
        top: pctY(y - puff.frameH / 2 + 2),
        width: pctX(puff.frameW / 2),
        height: pctY(puff.frameH / 2),
        delay: i ? "-1.7s" : "0s",
        opacity: 0.5,
        front: true,
      })),
      lanes: LANES.map((lane, row) => ({
        left: "0%",
        top: pctY(lane.base - LANE_ROW + 1),
        width: "100%",
        height: pctY(LANE_ROW),
        rows: LANES.length,
        row,
        reverse: lane.reverse,
        seconds: lane.seconds,
        steps: W * LANE_SPAN,
        span: LANE_SPAN,
        front: true,
      })),
      beacons: scene.beacons.map(([x, y]) => ({ left: pctX(x), top: pctY(y), delay: "0s" })),
      birds: { top: "13%", seconds: 84 },
      // Street life: people cross the whole picture along the pavement.
      life: {
        kind: "street",
        // where feet may fall: from just in front of the railings to the kerb
        near: CURB - 1,
        far: SIDEWALK + 2,
        from: -14,
        to: W + 14,
        // where a dog insists on stopping, and where people tend to
        // where cyclists ride: in the road, between the parked cars and the traffic
        road: PARKED_BASE + 3,
        sniff: [...TREES.map((x) => x + 1), HYDRANT],
        linger: [164, 176, 300, 452],
        // the roofs of the houses, for the odd barbecue
        roofs: scene.roofs,
        // where people sit: the middle of each stoop, and the row its bottom step is on
        stoops: scene.stoops.map((stoop) => ({ x: stoop.x, y: SIDEWALK - 1 })),
      },
      // Lit windows in plain view, for the people and pets seen moving behind them.
      windows: scene.windows,
    },
  };
}
