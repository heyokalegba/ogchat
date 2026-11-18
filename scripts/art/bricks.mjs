/**
 * The wall the chat is written on: a 320x320 tile of old running-bond
 * brickwork. No two bricks are alike. Most are muted tan, but there are
 * browns, greys, dull reds, limewashed pale ones and sooty ones, and each
 * carries its own wear: faces peeling to another layer, discolouration,
 * mottling, scraps of old paint, score marks, chipped corners. Over the whole
 * wall run a few cracks, damp patches and drip marks.
 *
 * How light the whole wall is comes from one dial, LIGHTNESS, below. It sits
 * in the middle: dark enough to read as old city brick, light enough for
 * black text to stay readable.
 */
import { bayer, canvas, dice, hex, mix, shade } from "./lib.mjs";

const BW = 16; // brick pitch, including 1px of mortar
const BH = 8;
const COLS = 20;
const ROWS = 40;

/**
 * How light the wall is, from 0 (dark and gritty) to 1 (pale). Every colour
 * below is given as a [dark, light] pair and this picks the point between
 * them. Darker reads more like old city brick; lighter makes black text
 * easier to read. Change it, then run `npm run art`.
 */
const LIGHTNESS = 0.5;

const between2 = ([dark, light]) => mix(hex(dark), hex(light), LIGHTNESS);
const factor = (dark, light) => dark + (light - dark) * LIGHTNESS;

/** Brick colours by family, with how common each family is. Each tone is [dark, light]. */
const FAMILIES = [
  {
    name: "tan",
    weight: 38,
    tones: [
      ["#b39b7b", "#cdb695"],
      ["#af9676", "#c9b190"],
      ["#aa9170", "#c4ab89"],
      ["#b7a080", "#d1bb9b"],
      ["#ad9474", "#c7ae8d"],
      ["#b89f7e", "#d3bd9c"],
      ["#a68d6c", "#bfa685"],
    ],
  },
  {
    name: "brown",
    weight: 17,
    tones: [
      ["#9d8063", "#b89c7d"],
      ["#96795c", "#b09475"],
      ["#a28669", "#bda283"],
      ["#8f7458", "#ab8f71"],
    ],
  },
  {
    name: "grey",
    weight: 15,
    tones: [
      ["#a8a093", "#c2bbae"],
      ["#9e978b", "#b8b1a5"],
      ["#b0a99c", "#c9c2b5"],
      ["#979186", "#b1ab9f"],
    ],
  },
  {
    name: "dull red",
    weight: 15,
    tones: [
      ["#a87a6a", "#c39686"],
      ["#a07162", "#bb8d7d"],
      ["#ad8273", "#c89d8e"],
      ["#996b5d", "#b58778"],
    ],
  },
  {
    name: "limewashed",
    weight: 8,
    tones: [
      ["#c2b59d", "#dccfb8"],
      ["#c8bca5", "#e2d6c0"],
      ["#bcae95", "#d6c8af"],
    ],
  },
  {
    name: "sooty",
    weight: 7,
    tones: [
      ["#877766", "#a59584"],
      ["#7f7061", "#9e8e7d"],
      ["#8b7b6b", "#aa9a88"],
    ],
  },
];
/** What is left of old paint. */
const PAINT = [
  ["#a9b4b8", "#bcc6c9"],
  ["#cdc4ad", "#ddd4bd"],
  ["#9ca891", "#b3bea8"],
  ["#b9a89a", "#cbbcae"],
];
const MORTAR = ["#8f7a60", "#a8937a"];

export function bricks() {
  const W = BW * COLS;
  const H = BH * ROWS;
  const c = canvas(W, H);
  const d = dice(1898);
  const { rand, between, pick, chance } = d;
  const wrap = (x, y) => [((x % W) + W) % W, ((y % H) + H) % H];
  const tint = (x, y, f) => c.tint(...wrap(x, y), f);

  const total = FAMILIES.reduce((n, f) => n + f.weight, 0);
  const family = () => {
    let roll = rand() * total;
    for (const f of FAMILIES) if ((roll -= f.weight) < 0) return f;
    return FAMILIES[0];
  };

  const mortar = between2(MORTAR);
  c.rect(0, 0, W, H, mortar);
  const isMortar = new Uint8Array(W * H).fill(1);

  const bw = BW - 1; // the brick face, without its mortar
  const bh = BH - 1;

  for (let row = 0; row < ROWS; row++) {
    const offset = row % 2 ? BW / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      const fam = family();
      // Its own colour: a family tone, nudged lighter or darker, warmer or cooler.
      let base = shade(between2(pick(fam.tones)), 0.95 + rand() * 0.1);
      base = mix(
        base,
        chance(0.5) ? between2(["#b08a6a", "#c9a585"]) : between2(["#8f9694", "#aab0ae"]),
        rand() * 0.07,
      );

      // The face of this one brick, drawn into a small grid and then worn.
      const face = Array.from({ length: bh }, (_, y) =>
        Array.from({ length: bw }, () => {
          let color = base;
          if (y === 0)
            color = shade(base, 1.04); // lit top edge
          else if (y === bh - 1) color = shade(base, 0.95); // shaded bottom edge
          const speck = rand();
          if (speck < 0.07) color = shade(color, 0.93);
          else if (speck < 0.085)
            color = shade(color, factor(0.84, 0.88)); // pit
          else if (speck > 0.955) color = shade(color, 1.05);
          return color;
        }),
      );

      // Discolouration: one end or one edge has gone darker or paler.
      if (chance(0.24)) {
        const along = chance(0.7);
        const from = chance(0.5) ? factor(0.89, 0.92) : 1.065;
        const flip = chance(0.5);
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            let t = along ? x / (bw - 1) : y / (bh - 1);
            if (flip) t = 1 - t;
            if (1 - t > bayer(x + col * 3, y + row)) face[y][x] = shade(face[y][x], from);
          }
        }
      }

      // Mottling: blotches of a neighbouring colour worked into the face.
      if (chance(0.16)) {
        const other = between2(pick(family().tones));
        for (let n = 0; n < between(3, 7); n++) {
          const mx = between(0, bw - 2);
          const my = between(0, bh - 1);
          for (let x = mx; x < Math.min(bw, mx + between(2, 4)); x++)
            face[my][x] = mix(face[my][x], other, 0.55);
        }
      }

      // Scraps of old paint.
      if (chance(0.11)) {
        const paint = between2(pick(PAINT));
        const px = between(0, bw - 1);
        const py = between(0, bh - 1);
        const r = between(4, 9);
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const dist = Math.hypot(x - px, (y - py) * 1.6) / r;
            if (dist < 1 && 1 - dist > bayer(x + col, y + row * 3) * 0.95)
              face[y][x] = mix(face[y][x], paint, 0.7);
          }
        }
      }

      // Peeling: the fired skin has flaked off part of the face, showing the body under it.
      if (chance(0.26)) {
        const under = chance(0.6)
          ? mix(shade(base, 1.09), between2(["#c9bda6", "#e0d5bf"]), 0.29) // a paler core
          : mix(shade(base, factor(0.86, 0.91)), between2(["#7a6a58", "#9a8a76"]), 0.3); // or a darker one
        const sx = chance(0.5) ? between(-1, 2) : between(bw - 3, bw);
        const sy = chance(0.5) ? between(-1, 1) : between(bh - 2, bh);
        const r = between(3, 7);
        const lobe = rand() * Math.PI * 2;
        const peeled = (x, y) => {
          if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
          const angle = Math.atan2(y - sy, x - sx);
          return (
            Math.hypot(x - sx, (y - sy) * 1.5) < r * (0.72 + 0.28 * Math.sin(angle * 3 + lobe))
          );
        };
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            if (peeled(x, y)) {
              face[y][x] = rand() < 0.14 ? shade(under, 0.93) : under;
            } else if (peeled(x + 1, y) || peeled(x, y + 1)) {
              face[y][x] = shade(face[y][x], factor(0.82, 0.86)); // the lip of the layer left, in shadow
            }
          }
        }
      }

      // A score mark across the face.
      if (chance(0.09)) {
        const y = between(1, bh - 2);
        const from = between(0, 5);
        for (let x = from; x < Math.min(bw, from + between(5, 11)); x++)
          face[y][x] = shade(face[y][x], factor(0.84, 0.88));
      }

      // A chipped corner or a broken edge: the mortar shows through.
      const chip = rand();
      const corner = between(0, 3);
      const chipSize = chip < 0.07 ? between(3, 5) : chip < 0.27 ? between(1, 2) : 0;

      const x0 = col * BW + offset;
      const y0 = row * BH;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const dx = corner % 2 ? bw - 1 - x : x;
          const dy = corner > 1 ? bh - 1 - y : y;
          if (chipSize && dx + dy < chipSize) continue;
          const [wx, wy] = wrap(x0 + x, y0 + y);
          c.set(wx, wy, face[y][x]);
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
      if (roll < 0.07) c.tint(x, y, factor(0.82, 0.86));
      else if (roll < 0.085) c.set(x, y, between2(["#86845f", "#a3a07c"]));
    }
  }

  // Damp and soot: soft dark patches across several bricks. Salt bloom: pale ones.
  const blob = (cx, cy, rx, ry, factor) => {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const dist = Math.hypot(x / rx, y / ry);
        if (dist <= 1 && 1 - dist > bayer(cx + x, cy + y) * 1.15) tint(cx + x, cy + y, factor);
      }
    }
  };
  for (let i = 0; i < 18; i++)
    blob(between(0, W), between(0, H), between(14, 36), between(9, 20), factor(0.94, 0.955));
  for (let i = 0; i < 8; i++)
    blob(between(0, W), between(0, H), between(10, 24), between(6, 12), 1.05);

  // Drip marks running down from a course.
  for (let i = 0; i < 24; i++) {
    const x = between(0, W);
    const top = between(0, ROWS - 1) * BH;
    const length = between(18, 58);
    const width = between(1, 2);
    for (let y = 0; y < length; y++) {
      for (let dx = 0; dx < width; dx++) {
        if (1 - y / length > bayer(x + dx, top + y) * 0.9)
          tint(x + dx, top + y, factor(0.92, 0.945));
      }
    }
  }

  // Hairline cracks: a jagged dark line with a thin lit edge beside it.
  for (let i = 0; i < 9; i++) {
    let x = between(10, W - 10);
    let y = between(0, H);
    const length = between(22, 70);
    let drift = chance(0.5) ? -1 : 1;
    for (let step = 0; step < length; step++) {
      tint(x, y, factor(0.68, 0.74));
      tint(x + 1, y, 1.05);
      const roll = rand();
      if (roll < 0.3) x += drift;
      else if (roll < 0.36) drift = -drift;
      if (roll > 0.2) y += 1;
    }
  }

  return c;
}
