/**
 * Things with words on them: shop signs, lettering in shop windows, street
 * signs, sandwich boards on the pavement and billboards on the roofs. And
 * what the shops have in their windows.
 *
 * The lettering is a three-by-five pixel alphabet, which is about as small
 * as letters can be and still be read.
 */
import { hex, mix, shade } from "./lib.mjs";

const GLYPHS = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "111101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  0: "111101101101111",
  1: "010110010010111",
  2: "110001010100111",
  3: "110001010001110",
  4: "101101111001001",
  5: "111100110001110",
  6: "011100110101010",
  7: "111001010010010",
  8: "010101010101010",
  9: "010101011001110",
  "-": "000000111000000",
  ".": "000000000000010",
  "!": "010010010000010",
  ">": "100010001010100",
};

/** How many pixels wide `string` comes out. */
export function textWidth(string) {
  let width = 0;
  for (const ch of string.toUpperCase()) width += ch === " " ? 2 : 4;
  return Math.max(0, width - 1);
}

/** Every pixel of `string` with its top-left corner at (x, y), handed to `plot`. */
function eachPixel(x, y, string, plot) {
  let cx = x;
  for (const ch of string.toUpperCase()) {
    if (ch === " ") {
      cx += 2;
      continue;
    }
    const glyph = GLYPHS[ch];
    if (glyph) {
      for (let i = 0; i < 15; i++) if (glyph[i] === "1") plot(cx + (i % 3), y + Math.floor(i / 3));
    }
    cx += 4;
  }
}

/** Writes `string` on a canvas. */
export function text(c, x, y, string, color) {
  eachPixel(x, y, string, (px, py) => c.set(px, py, color));
}

/** Writes `string` centred in a band `width` wide. */
export function textCentred(c, x, width, y, string, color) {
  text(c, x + Math.floor((width - textWidth(string)) / 2), y, string, color);
}

/** Lettering in neon: dull by day, lit from `when` on. */
export function neon(c, emit, x, y, string, dull, bright, when = "evening") {
  eachPixel(x, y, string, (px, py) => {
    c.set(px, py, dull);
    emit.light(c, px, py, 1, 1, bright, when);
  });
}

// ---------------------------------------------------------------- what is in the shop windows

/** A row of loaves, rolls and baguettes along a shelf whose top is row `y`. */
function bread(c, x, y, width) {
  const crust = hex("#a9743c");
  const top = hex("#cf9a55");
  for (let bx = x + 1; bx + 4 < x + width; bx += 6) {
    if (((bx - x) / 6) % 3 === 2) {
      // a baguette, propped up
      for (let i = 0; i < 6; i++) c.set(bx + Math.floor(i / 2), y - 1 - i, i % 2 ? top : crust);
      continue;
    }
    c.rect(bx, y - 2, 5, 2, crust);
    c.rect(bx + 1, y - 3, 3, 1, top);
    c.set(bx + 2, y - 2, top);
  }
}

/** Pies on stands. */
function pies(c, x, y, width) {
  for (let bx = x + 1; bx + 5 < x + width; bx += 8) {
    c.rect(bx, y - 2, 6, 1, hex("#c98a3c"));
    c.rect(bx + 1, y - 3, 4, 1, hex("#b8402f"));
    c.set(bx + 2, y - 3, hex("#e3c27a"));
    c.rect(bx + 2, y - 1, 2, 1, hex("#6b6558"));
  }
}

/** Fruit and tins, piled. */
function groceries(c, x, y, width) {
  const tones = ["#7b8c4a", "#b0683c", "#b9a04a", "#a8382c", "#4f6a80"].map(hex);
  for (let bx = x + 1; bx + 1 < x + width; bx += 2) {
    const tone = tones[((bx - x) >> 1) % tones.length];
    c.set(bx, y - 1, tone);
    if (((bx - x) >> 1) % 2) c.set(bx, y - 2, shade(tone, 1.2));
  }
}

const GOODS = { bread, pies, groceries };

/** A sandwich board on the pavement, standing on row `base`. */
export function sandwichBoard(c, x, base, face, ink) {
  c.rect(x, base - 7, 5, 6, face);
  c.rect(x, base - 7, 5, 1, shade(face, 1.2));
  c.set(x + 1, base - 5, ink);
  c.set(x + 2, base - 5, ink);
  c.set(x + 3, base - 5, ink);
  c.set(x + 1, base - 3, ink);
  c.set(x + 2, base - 3, ink);
  c.set(x, base - 1, hex("#17161a")); // legs
  c.set(x + 4, base - 1, hex("#17161a"));
  c.set(x, base, hex("#17161a"));
  c.set(x + 4, base, hex("#17161a"));
}

/**
 * A shopfront across the ground floor of a house: a lettered sign, an awning,
 * a lit window with goods and a word in it, a glazed door, and a board out on
 * the pavement. `spec`:
 *   x, w, base       the house's left edge and width, and the pavement row
 *   wall             the house's colour, to clear what was there
 *   name             on the sign          sign, ink     its colours
 *   awning           [a, b] stripes       goods         "bread" | "pies" | "groceries"
 *   word             in the window, in neon (or null)   neonTone
 *   tone             the light in the window            tint: dusk(...) for this scene
 */
export function storefront(c, emit, spec) {
  const { x, w, base, wall, tint } = spec;
  const fy = base - 34;
  c.rect(x, fy + 1, w - 1, 33, wall); // the parlour floor and the stoop make way
  c.rect(x + w - 1, fy + 1, 1, 33, shade(wall, 0.66));
  const sy = fy + 3;
  c.rect(x + 1, sy, w - 3, 7, spec.sign);
  c.rect(x + 1, sy, w - 3, 1, shade(spec.sign, 1.25));
  textCentred(c, x + 1, w - 3, sy + 1, spec.name, spec.ink);
  for (let ax = x; ax < x + w - 1; ax++) {
    c.rect(ax, sy + 7, 1, 4, Math.floor((ax - x) / 3) % 2 ? spec.awning[0] : spec.awning[1]);
  }
  c.rect(x, sy + 11, w - 1, 1, hex("#2a1a17"));

  const wy = sy + 13;
  const ww = w - 16;
  c.rect(x + 3, wy, ww, 14, hex("#2b2a2e"));
  emit.light(c, x + 3, wy, ww, 14, spec.tone, "always");
  // shelves and what is on them: drawn after the light, so they show against it
  const shelf = tint(hex("#8a6238"));
  c.rect(x + 3, wy + 8, ww, 1, shelf);
  GOODS[spec.goods](c, x + 3, wy + 8, ww);
  GOODS[spec.goods](c, x + 3, wy + 14, ww);
  if (spec.word) neon(c, emit, x + 5, wy + 1, spec.word, spec.neonDull, spec.neonTone);
  c.rect(x + 2, wy + 14, ww + 2, 1, shade(wall, 0.7)); // sill

  // the door, glazed, with a handle
  const dx = x + w - 11;
  c.rect(dx, wy - 1, 8, 20, tint(hex("#4a3628")));
  c.rect(dx + 1, wy, 6, 12, hex("#2b2a2e"));
  emit.light(c, dx + 1, wy, 6, 12, shade(spec.tone, 0.94), "always");
  c.set(dx + 2, wy + 14, hex("#b99a5a"));
  emit.spill(c, x + w / 2, base - 2, 20, hex("#d9b061"), 0.5, "evening");
}

/** A street sign blade on a pole: white letters on green. */
export function streetSign(c, x, y, name) {
  const width = textWidth(name) + 4;
  c.rect(x, y, width, 7, hex("#2c5a40"));
  c.rect(x, y, width, 1, hex("#3f7a58"));
  text(c, x + 2, y + 1, name, hex("#e9e4d2"));
  return width;
}

/** A one-way sign: a white arrow on black. */
export function oneWay(c, x, y) {
  c.rect(x, y, 13, 5, hex("#141416"));
  for (let i = 0; i < 8; i++) c.set(x + 2 + i, y + 2, hex("#e9e4d2"));
  c.set(x + 8, y + 1, hex("#e9e4d2"));
  c.set(x + 8, y + 3, hex("#e9e4d2"));
  c.set(x + 10, y + 2, hex("#e9e4d2"));
}

/** A parking or bus-stop plate on a thin pole standing on `base`. */
export function plateOnPole(c, x, base, height, plate, mark) {
  c.rect(x, base - height, 1, height, hex("#2b2d33"));
  c.rect(x - 2, base - height, 5, 6, plate);
  c.rect(x - 1, base - height + 2, 3, 2, mark);
}

/** Flyers pasted up: a few small sheets in faded colours. */
export function flyers(c, d, x, y, count) {
  const sheets = ["#c9c2ae", "#b79a4c", "#8fb0a0", "#c98a7a", "#d6cfbd"].map(hex);
  for (let i = 0; i < count; i++) {
    const fx = x + i * 4 + d.between(0, 1);
    const fy = y + d.between(0, 3);
    c.rect(fx, fy, 3, 4, d.pick(sheets));
    c.set(fx + 1, fy + 1, hex("#3a3a3e"));
  }
}

/**
 * A billboard on a roof whose top row is `roofTop`: a lettered panel on legs,
 * with lamps along its top that light it after dark. `tint` brings its
 * daylight colours into the scene's palette.
 */
export function billboard(c, emit, { x, roofTop, lines, face, ink, tint = (p) => p }) {
  const width = Math.max(...lines.map(textWidth)) + 8;
  const height = lines.length * 6 + 5;
  const top = roofTop - height - 5;
  const iron = hex("#17161a");
  for (const lx of [x + 3, x + width - 4]) c.rect(lx, top + height, 1, 5, iron);
  for (let i = 0; i < 4; i++) c.set(x + 4 + i, top + height + i, iron); // a brace
  c.rect(x, top, width, height, tint(face));
  c.rect(x, top, width, 1, tint(shade(face, 1.2)));
  c.rect(x, top + height - 1, width, 1, tint(shade(face, 0.7)));
  lines.forEach((line, i) => textCentred(c, x, width, top + 3 + i * 6, line, tint(ink)));
  // after dark the lamps wash the panel back to its daylight colours
  emit.custom(
    c,
    (out) => {
      for (let yy = 0; yy < height; yy++) {
        for (let xx = 0; xx < width; xx++) {
          const fall = 1 - (yy / height) * 0.35;
          out.set(x + xx, top + yy, mix(hex("#1a1612"), face, fall));
        }
      }
      lines.forEach((line, i) => textCentred(out, x, width, top + 3 + i * 6, line, ink));
    },
    "evening",
  );
  for (let lx = x + 3; lx < x + width - 2; lx += 6) {
    c.set(lx, top - 1, iron);
    emit.light(c, lx, top - 1, 1, 1, hex("#f2dfa0"), "evening");
  }
  return { x, w: width, top };
}
