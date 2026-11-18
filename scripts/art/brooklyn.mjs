/**
 * Scene two: a brownstone block in Brooklyn at dusk.
 *
 * Prospect Heights by way of Bed-Stuy and Flatbush: a row of brownstones with
 * stoops, cornices and bay fronts, a corner bodega, street trees and
 * bishop's-crook lamps coming on. Behind the roofs stand prewar apartment
 * houses with water towers and a church steeple; behind those, the dark
 * canopy of Prospect Park with the memorial arch at its gate, and the clock
 * tower downtown catching the last light. The sun has just gone.
 */
import {
  bandedSky,
  bayer,
  canvas,
  clouds,
  desat,
  dice,
  glow,
  H,
  hex,
  mix,
  pctX,
  pctY,
  shade,
  W,
  waterTower,
  weather,
} from "./lib.mjs";

const SIDEWALK = 334; // top of the pavement; house fronts stand on it
const CURB = 342;
const PARK_BASE = 262; // where the far towers and the park meet the roofs
const ARCH = { x: 560, w: 50, top: 204, base: 270 };

/** Dusk falls on everything: darker, cooler, a little violet. */
const VIOLET = hex("#3a3050");
const dusk = (c) => desat(mix(shade(c, 0.78), VIOLET, 0.14), 0.1);
const D = (h) => dusk(hex(h));

const WARM = ["#e0b565", "#d29a50", "#ecd08a", "#b98548", "#dfa85a"].map(hex);

function sky() {
  // Indigo overhead, through mauve, down to the afterglow.
  const bands = [
    "#252c48",
    "#2f3558",
    "#434467",
    "#5c5173",
    "#7a5e77",
    "#986b71",
    "#b47c67",
    "#c59268",
  ].map(hex);
  const c = bandedSky(bands, 252, 21);
  const d = dice(22);
  // Where the sun went down: a warmer bloom low on the right.
  for (let y = 150; y < 262; y++) {
    for (let x = 300; x < W; x++) {
      const amount = 1 - Math.hypot((x - 478) / 170, (y - 256) / 96);
      if (amount > bayer(x, y)) c.blend(x, y, hex("#d9a36c"), Math.min(0.5, amount * 0.7));
    }
  }
  // First stars, high up.
  for (let n = 0; n < 54; n++) {
    const x = d.between(0, W - 1);
    const y = d.between(2, 128);
    if (d.chance(1 - y / 150)) c.set(x, y, d.chance(0.35) ? hex("#d2cfdc") : hex("#8e8ea9"));
  }
  // A thin moon.
  const MOON = { x: 92, y: 54, r: 9 };
  for (let y = -MOON.r - 5; y <= MOON.r + 5; y++) {
    for (let x = -MOON.r - 5; x <= MOON.r + 5; x++) {
      const dist = Math.hypot(x, y);
      const cut = Math.hypot(x - 4, y + 2);
      if (dist <= MOON.r && cut > MOON.r - 0.5) c.set(MOON.x + x, MOON.y + y, hex("#d9d3c1"));
      else if (
        dist <= MOON.r + 5 &&
        cut > MOON.r &&
        1 - (dist - MOON.r) / 5 > bayer(MOON.x + x, MOON.y + y) * 2.2
      ) {
        c.blend(MOON.x + x, MOON.y + y, hex("#9c98b0"), 0.5);
      }
    }
  }
  return c;
}

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
  const lights = { a: canvas(W, H), b: canvas(W, H), c: canvas(W, H) };
  const d = dice(1127);
  const { rand, pick, between, chance } = d;
  const iron = hex("#15151a");
  const woods = [D("#5c4434"), D("#66493a")];
  const beacons = [];
  const chimneys = [];

  // ------------------------------------------------------------ far: downtown in the haze
  const far = ["#4b4966", "#52506c", "#45445e", "#58556f"].map(hex);
  for (let x = -6; x < 320;) {
    const w = between(9, 20);
    const h = Math.round(between(34, 96) * (0.45 + Math.exp(-(((x - 128) / 95) ** 2))));
    const color = pick(far);
    skyline.rect(x, PARK_BASE - h, w, h, color);
    skyline.rect(x + w - 2, PARK_BASE - h, 2, h, shade(color, 0.88));
    if (chance(0.3))
      skyline.rect(x + Math.floor(w / 2), PARK_BASE - h - between(6, 16), 1, 16, color);
    for (let wy = PARK_BASE - h + 4; wy < PARK_BASE - 4; wy += 4) {
      for (let wx = x + 2; wx < x + w - 3; wx += 3) {
        const roll = rand();
        if (roll < 0.16) skyline.set(wx, wy, hex("#b89f66"));
        else if (roll < 0.22) (chance(0.5) ? lights.a : lights.c).set(wx, wy, hex("#c9ae70"));
        else if (roll < 0.6) skyline.set(wx, wy, shade(color, 0.86));
      }
    }
    x += w;
  }
  // The clock tower: a slender stepped shaft under a dome, its clock face lit.
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
        for (let wx = left + 3; wx < left + w - 4; wx += 3)
          skyline.set(wx, wy, chance(0.2) ? hex("#c4aa6c") : shade(stone, 0.8));
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
      skyline.set(cx + dx, y + 20 + dy, hex("#e6d49a")); // clock face
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
    skyline.rect(x - 1, 251, 3, 2, hex("#ecd592"));
    glow(skyline, x, 252, 11, hex("#c9a25c"), 0.5);
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
    glow(skyline, x + w / 2, base - 6, 26, hex("#d2a862"), 0.42); // floodlit from below
  }

  // ------------------------------------------------------------ mid: apartment houses and a church
  const midFlicker = () => (chance(0.5) ? lights.a : lights.c);
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
        skyline.rect(wx, wy, 3, 5, on ? tone : hex("#1b1c25"));
        if (on && chance(0.45)) skyline.rect(wx, wy, 3, 2, shade(tone, 0.7));
        if (!on) skyline.set(wx, wy, hex("#3d3e58")); // the sky in the glass
        skyline.rect(wx - 1, wy + 5, 5, 1, shade(color, 1.22));
        skyline.tint(wx + 1, wy + 6, 0.84);
        if (!on && chance(0.12)) midFlicker().rect(wx, wy, 3, 5, pick(WARM));
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
    skyline.rect(x + 25, 254, 4, 6, hex("#b98a4c")); // window in the gable
    skyline.rect(x, 178, 12, SIDEWALK - 178, stone); // tower
    skyline.rect(x + 9, 178, 3, SIDEWALK - 178, shade(stone, 0.74));
    weather(skyline, d, x, 178, 12, 90);
    skyline.rect(x - 1, 176, 14, 2, shade(stone, 1.15));
    for (const wy of [186, 204, 224]) {
      skyline.rect(x + 4, wy, 3, 8, wy === 224 ? hex("#a87f48") : hex("#17171d")); // louvres, one lit
      skyline.set(x + 5, wy - 1, wy === 224 ? hex("#a87f48") : hex("#17171d"));
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
    rooftops.rect(wx, wy, ww, wh, on ? tone : hex("#191a22"));
    if (on) {
      if (chance(0.45))
        rooftops.rect(wx, wy, ww, Math.ceil(wh * 0.4), shade(tone, 0.68)); // a shade pulled down
      else if (chance(0.3)) rooftops.rect(wx, wy, 1, wh, shade(tone, 0.6)); // a curtain
    } else {
      rooftops.rect(wx, wy, 2, 2, hex("#3b3c57")); // the sky in the glass
    }
    rooftops.rect(wx, wy + Math.floor(wh / 2), ww, 1, on ? shade(tone, 0.55) : hex("#0f1015")); // sash
    rooftops.rect(wx - 1, wy + wh, ww + 2, 1, shade(color, 1.3)); // sill
    rooftops.tint(wx + 1, wy + wh + 1, 0.82);
    rooftops.tint(wx + 2, wy + wh + 2, 0.9);
    if (!on && chance(0.32)) {
      lights.b.rect(wx, wy, ww, wh, tone);
      lights.b.rect(wx, wy + Math.floor(wh / 2), ww, 1, shade(tone, 0.55));
    }
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
      for (let lx = x + 4; lx < x + w - 5; lx += 2)
        if (chance(0.72)) rooftops.rect(lx, sy + 2, 1, 2, hex("#d6bd72"));
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
      rooftops.rect(x + 3, wy, w - 16, 14, hex("#e3bd72"));
      for (let lx = x + 4; lx < x + w - 14; lx += 3)
        rooftops.rect(lx, wy + 8 + (lx % 2), 2, 6 - (lx % 2), hex("#7a5a34")); // stock on the shelves
      rooftops.rect(x + 3, wy + 6, w - 16, 1, hex("#a67c44"));
      rooftops.rect(x + w - 11, wy - 1, 8, 21, hex("#3a2a22")); // door
      rooftops.rect(x + w - 10, wy, 6, 12, hex("#d8ae66"));
      for (const [cx, tone] of [
        [x + 3, "#7b8c4a"],
        [x + 9, "#b0683c"],
        [x + 15, "#b9a04a"],
      ]) {
        rooftops.rect(cx, SIDEWALK - 5, 5, 5, hex("#4a3628")); // crates
        rooftops.rect(cx, SIDEWALK - 6, 5, 2, hex(tone));
      }
      glow(rooftops, x + w / 2, SIDEWALK - 2, 20, hex("#d9b061"), 0.5);
      // the neon in the window comes and goes
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [4, 0],
        [4, 1],
        [4, 2],
        [5, 0],
        [6, 0],
        [6, 1],
        [5, 1],
      ]) {
        lights.b.set(x + 6 + dx, wy + 2 + dy, hex("#e0735e"));
      }
      return top;
    }

    // parlor floor: tall windows, and the front door at the head of the stoop
    for (let b = 0; b < 3; b++) {
      if (b !== doorBay) pane(bayX(b), fy + 6, 5, 14, color, 0.5);
    }
    const doorX = bayX(doorBay) - 1;
    rooftops.rect(doorX - 1, fy + 5, 9, 2, shade(color, 1.26)); // door hood
    rooftops.rect(doorX, fy + 7, 7, 2, chance(0.6) ? pick(WARM) : hex("#22232c")); // transom
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
      rooftops.rect(wx, fy + 3, 5, 5, on ? pick(WARM) : hex("#16171d"));
      rooftops.rect(wx + 1, fy + 3, 1, 5, iron);
      rooftops.rect(wx + 3, fy + 3, 1, 5, iron);
    }
    // the stoop: treads coming down to the pavement, with railings
    const sx = doorX - 1;
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

  // parked cars along the kerb
  const paints = ["#3a4654", "#5a3d36", "#4a4a48", "#2c3a33", "#6b6558", "#2b2d33"].map(D);
  for (const x of [22, 96, 204, 262, 356, 438, 548, 598]) {
    if (chance(0.2)) continue;
    const body = pick(paints);
    const y = 338;
    rooftops.rect(x + 6, y, 14, 4, body); // cabin
    rooftops.rect(x + 7, y + 1, 5, 3, hex("#1b1d26"));
    rooftops.rect(x + 13, y + 1, 6, 3, hex("#1b1d26"));
    rooftops.set(x + 8, y + 1, hex("#474a66"));
    rooftops.rect(x, y + 4, 28, 5, body);
    rooftops.rect(x, y + 4, 28, 1, shade(body, 1.25));
    rooftops.rect(x, y + 8, 28, 1, shade(body, 0.6));
    rooftops.rect(x + 3, y + 8, 5, 3, hex("#0e0e11")); // wheels
    rooftops.rect(x + 20, y + 8, 5, 3, hex("#0e0e11"));
    rooftops.set(x, y + 5, hex("#8a3a30")); // tail light
    rooftops.set(x + 27, y + 5, hex("#bdb48c"));
  }
  rooftops.rect(306, SIDEWALK - 6, 3, 6, D("#8f3d2f")); // a hydrant
  rooftops.rect(305, SIDEWALK - 4, 5, 1, D("#8f3d2f"));

  // street trees
  const leaves = ["#253122", "#1b241a", "#3a4630", "#5f6238"].map(hex);
  for (const tx of [58, 132, 236, 318, 398, 474, 590]) {
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
    rooftops.rect(lx + 4, 300, 3, 2, hex("#f2dfa0"));
    glow(rooftops, lx + 5, 303, 20, hex("#d9b061"), 0.6);
    for (let y = 0; y < 5; y++) {
      for (let x = -14; x <= 16; x++) {
        if (1 - Math.abs(x) / 16 > bayer(lx + x, SIDEWALK + y) * 1.2)
          rooftops.blend(lx + x, SIDEWALK + y, hex("#d9b061"), 0.3); // on the pavement
      }
    }
    for (const [dx, dy] of [
      [3, 0],
      [8, 1],
      [5, 2],
      [11, 0],
    ])
      rooftops.set(lx + dx, 346 + dy, hex("#8a7748")); // in the wet road
    // a faint shimmer, for the flicker layer
    lights.c.rect(lx + 4, 299, 3, 1, hex("#fff0bd"));
    lights.c.set(lx + 3, 301, hex("#e8cf8c"));
    lights.c.set(lx + 7, 301, hex("#e8cf8c"));
  }

  return { skyline, rooftops, lights, beacons, chimneys };
}

/**
 * What passes on the street, as two seamless strips six pixels tall: one
 * row heading right (a car, a bus), one heading left (a car, a cyclist).
 */
function traffic() {
  const c = canvas(W, 12);
  const car = (x, y, dir, body) => {
    c.rect(x + 4, y, 8, 2, shade(body, 1.2)); // cabin
    c.rect(x + 5, y, 2, 2, hex("#4a5266"));
    c.rect(x + 9, y, 2, 2, hex("#4a5266"));
    c.rect(x, y + 2, 16, 3, body);
    c.rect(x + 2, y + 5, 3, 1, hex("#0c0c0e"));
    c.rect(x + 11, y + 5, 3, 1, hex("#0c0c0e"));
    const nose = dir > 0 ? x + 15 : x;
    const tail = dir > 0 ? x : x + 15;
    c.set(nose, y + 3, hex("#f4e6a8"));
    c.set(tail, y + 3, hex("#b8402f"));
    for (let i = 1; i <= 10; i++) {
      if (bayer(nose + i * dir, y + 3) < 0.8 - i * 0.07)
        c.set(nose + i * dir, y + 4, hex("#9c8f62")); // light on the road
    }
  };
  const bus = (x, y) => {
    c.rect(x, y, 34, 5, hex("#3d566e"));
    c.rect(x, y + 3, 34, 1, hex("#c9c5b6"));
    for (let wx = x + 2; wx < x + 31; wx += 4) c.rect(wx, y + 1, 3, 2, hex("#d8c68e"));
    c.rect(x + 3, y + 5, 4, 1, hex("#0c0c0e"));
    c.rect(x + 26, y + 5, 4, 1, hex("#0c0c0e"));
    c.set(x + 33, y + 4, hex("#f4e6a8"));
    c.set(x, y + 4, hex("#b8402f"));
    for (let i = 1; i <= 10; i++)
      if (bayer(x + 33 + i, y) < 0.8 - i * 0.07) c.set(x + 33 + i, y + 5, hex("#9c8f62"));
  };
  car(120, 0, 1, hex("#23262d"));
  bus(418, 0);
  car(306, 6, -1, hex("#3a2a28"));
  // a cyclist with a front light
  c.rect(540, 10, 2, 2, hex("#0c0c0e"));
  c.rect(546, 10, 2, 2, hex("#0c0c0e"));
  c.rect(541, 9, 6, 1, hex("#2a2a2e"));
  c.rect(543, 6, 2, 3, hex("#3b4a5c"));
  c.set(544, 5, hex("#8a6a55"));
  c.set(539, 9, hex("#f4e6a8"));
  return c;
}

export function brooklynScene(puff) {
  const scene = block();
  const smokers = scene.chimneys.filter(([x]) => x < 215 || x > 515).slice(0, 2);
  const tones = ["#4d4a66", "#645d78", "#93707a", "#c58d71"].map(hex); // lit from below
  return {
    images: {
      "sky.png": sky(),
      "clouds-far.png": clouds(131, 150, 4, 0.8, tones),
      "clouds-near.png": clouds(177, 170, 3, 1.3, tones),
      "skyline.png": scene.skyline,
      "rooftops.png": scene.rooftops,
      "lights-a.png": scene.lights.a,
      "lights-b.png": scene.lights.b,
      "lights-c.png": scene.lights.c,
      "traffic.png": traffic(),
    },
    config: {
      label: "brooklyn",
      hint: "a brownstone block at dusk",
      sky: "#252c48",
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
      lanes: [
        {
          left: "0%",
          top: pctY(345),
          width: "100%",
          height: pctY(6),
          rows: 2,
          row: 0,
          reverse: true,
          seconds: 38,
          steps: W,
          front: true,
        },
        {
          left: "0%",
          top: pctY(352),
          width: "100%",
          height: pctY(6),
          rows: 2,
          row: 1,
          reverse: false,
          seconds: 52,
          steps: W,
          front: true,
        },
      ],
      beacons: scene.beacons.map(([x, y]) => ({ left: pctX(x), top: pctY(y), delay: "0s" })),
      birds: { top: "13%", seconds: 84 },
    },
  };
}
