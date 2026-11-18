/**
 * The wall the chat is written on: a 320x320 tile of old running-bond
 * brickwork. No two bricks are alike. Most are muted tan, but there are
 * browns, greys, dull dark reds, limewashed pale ones and sooty ones, and each
 * carries its own wear: faces peeling to another layer, discolouration,
 * mottling, scraps of old paint, score marks, chipped corners. Over the whole
 * wall run a few cracks, damp patches and drip marks.
 *
 * Everything is kept light and shallow enough for black text to read on it.
 */
import { bayer, canvas, dice, hex, mix, shade } from "./lib.mjs";

const BW = 16; // brick pitch, including 1px of mortar
const BH = 8;
const COLS = 20;
const ROWS = 40;

/** Brick colours by family, with how common each family is. */
const FAMILIES = [
  {
    weight: 38,
    tones: ["#b39b7b", "#af9676", "#aa9170", "#b7a080", "#ad9474", "#b89f7e", "#a68d6c"],
  }, // tan
  { weight: 17, tones: ["#9d8063", "#96795c", "#a28669", "#8f7458"] }, // brown
  { weight: 15, tones: ["#a8a093", "#9e978b", "#b0a99c", "#979186"] }, // grey
  { weight: 15, tones: ["#a87a6a", "#a07162", "#ad8273", "#996b5d"] }, // dull dark red
  { weight: 8, tones: ["#c2b59d", "#c8bca5", "#bcae95"] }, // limewashed
  { weight: 7, tones: ["#877766", "#7f7061", "#8b7b6b"] }, // sooty
];
const PAINT = ["#a9b4b8", "#cdc4ad", "#9ca891", "#b9a89a"]; // what is left of old paint
const MORTAR = "#8f7a60";

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

  const mortar = hex(MORTAR);
  c.rect(0, 0, W, H, mortar);
  const isMortar = new Uint8Array(W * H).fill(1);

  const bw = BW - 1; // the brick face, without its mortar
  const bh = BH - 1;

  for (let row = 0; row < ROWS; row++) {
    const offset = row % 2 ? BW / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      const fam = family();
      // Its own colour: a family tone, nudged lighter or darker, warmer or cooler.
      let base = shade(hex(pick(fam.tones)), 0.95 + rand() * 0.1);
      base = mix(base, chance(0.5) ? hex("#b08a6a") : hex("#8f9694"), rand() * 0.07);

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
            color = shade(color, 0.84); // pit
          else if (speck > 0.955) color = shade(color, 1.05);
          return color;
        }),
      );

      // Discolouration: one end or one edge has gone darker or paler.
      if (chance(0.24)) {
        const along = chance(0.7);
        const from = chance(0.5) ? 0.89 : 1.07;
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
        const other = hex(pick(family().tones));
        for (let n = 0; n < between(3, 7); n++) {
          const mx = between(0, bw - 2);
          const my = between(0, bh - 1);
          for (let x = mx; x < Math.min(bw, mx + between(2, 4)); x++)
            face[my][x] = mix(face[my][x], other, 0.55);
        }
      }

      // Scraps of old paint.
      if (chance(0.11)) {
        const paint = hex(pick(PAINT));
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
          ? mix(shade(base, 1.1), hex("#c9bda6"), 0.28) // a paler core
          : mix(shade(base, 0.86), hex("#7a6a58"), 0.3); // or a darker one
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
              face[y][x] = shade(face[y][x], 0.82); // the lip of the layer that is left, in shadow
            }
          }
        }
      }

      // A score mark across the face.
      if (chance(0.09)) {
        const y = between(1, bh - 2);
        const from = between(0, 5);
        for (let x = from; x < Math.min(bw, from + between(5, 11)); x++)
          face[y][x] = shade(face[y][x], 0.84);
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
      if (roll < 0.07) c.tint(x, y, 0.82);
      else if (roll < 0.085) c.set(x, y, hex("#86845f"));
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
    blob(between(0, W), between(0, H), between(14, 36), between(9, 20), 0.94);
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
        if (1 - y / length > bayer(x + dx, top + y) * 0.9) tint(x + dx, top + y, 0.92);
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
      tint(x, y, 0.68);
      tint(x + 1, y, 1.05);
      const roll = rand();
      if (roll < 0.3) x += drift;
      else if (roll < 0.36) drift = -drift;
      if (roll > 0.2) y += 1;
    }
  }

  return c;
}
