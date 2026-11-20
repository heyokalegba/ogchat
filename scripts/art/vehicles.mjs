/**
 * What drives down the block and what is parked on it: sedans, hatchbacks,
 * SUVs, pickups, vans, a box truck, a city bus, sports cars and yellow cabs,
 * in a spread of paints.
 *
 * Every vehicle is drawn nose to the right on a small canvas of its own, with
 * its wheels on the bottom row, and then stamped into a scene either way
 * round. Lamps are a separate pass, so the same vehicle can be shown by day
 * (lamps off) and after dark (lamps on, a pool of light on the road ahead).
 */
import { bayer, canvas, hex, shade } from "./lib.mjs";

const GLASS = hex("#1b1d26");
const SHINE = hex("#474a66");
const TYRE = hex("#0e0e11");
const HUB = hex("#4a4a4e");

/**
 * Paints for ordinary cars. Strong enough to stay themselves once a scene
 * has graded them for the hour: reds, blues, greens, black, white, silver.
 */
export const PAINTS = [
  "#27384d", // navy
  "#7a2a20", // red
  "#2a2a2e", // black
  "#2c4a38", // green
  "#93938f", // silver
  "#cfccc0", // white
  "#4a6a8a", // blue
  "#8a6a2c", // gold
  "#5a3d36", // oxblood
  "#3f5560", // teal grey
  "#a8552f", // rust orange
  "#6b6558", // sand
  "#5d4a70", // plum
  "#55704a", // moss
].map(hex);

function wheel(c, x, y, r = 2) {
  // a tyre with a pale hub, `r` deciding how big
  const size = r * 2 + 1;
  for (let dy = 0; dy < size - 1; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const corner = (dx === 0 || dx === size - 1) && dy === 0 && size > 4;
      if (!corner) c.set(x + dx, y + dy, TYRE);
    }
  }
  c.set(x + r, y + Math.floor((size - 1) / 2), HUB);
}

/** Side windows: a dark band split by pillars, with a glint at the front. */
function glazing(c, x, y, w, h, pillars = []) {
  c.rect(x, y, w, h, GLASS);
  for (const p of pillars) c.rect(x + p, y, 1, h, shade(GLASS, 2.2));
  c.set(x + w - 2, y, SHINE);
}

/**
 * The kinds of vehicle. Each has a size, where its lamps are, and a draw
 * function that paints it nose-right onto a canvas of exactly that size.
 */
export const VEHICLES = {
  sedan: {
    w: 28,
    h: 11,
    draw(c, paint) {
      c.rect(7, 0, 12, 1, shade(paint, 1.15)); // roof
      c.rect(6, 1, 15, 3, paint);
      c.set(21, 3, paint); // the screen rakes forward
      c.set(5, 3, paint);
      glazing(c, 7, 1, 13, 3, [6]);
      c.rect(0, 4, 28, 5, paint);
      c.rect(0, 4, 28, 1, shade(paint, 1.25));
      c.rect(0, 8, 28, 1, shade(paint, 0.6));
      wheel(c, 3, 7);
      wheel(c, 20, 7);
    },
  },
  hatchback: {
    w: 22,
    h: 11,
    draw(c, paint) {
      c.rect(3, 0, 12, 1, shade(paint, 1.15));
      c.rect(2, 1, 15, 3, paint);
      c.set(17, 3, paint);
      glazing(c, 3, 1, 13, 3, [6]);
      c.rect(1, 4, 21, 5, paint);
      c.rect(1, 4, 21, 1, shade(paint, 1.25));
      c.rect(1, 8, 21, 1, shade(paint, 0.6));
      wheel(c, 2, 7);
      wheel(c, 15, 7);
    },
  },
  suv: {
    w: 30,
    h: 13,
    draw(c, paint) {
      c.rect(4, 0, 17, 1, shade(paint, 1.15));
      c.rect(3, 1, 20, 4, paint);
      c.set(23, 4, paint);
      glazing(c, 4, 1, 18, 3, [6, 12]);
      c.rect(1, 5, 29, 6, paint);
      c.rect(1, 5, 29, 1, shade(paint, 1.25));
      c.rect(1, 10, 29, 1, shade(paint, 0.6));
      c.rect(2, 0, 1, 1, shade(paint, 0.7)); // roof rail end
      wheel(c, 3, 8, 2);
      wheel(c, 21, 8, 2);
    },
  },
  pickup: {
    w: 34,
    h: 12,
    draw(c, paint) {
      c.rect(16, 0, 9, 1, shade(paint, 1.15));
      c.rect(15, 1, 11, 4, paint);
      c.set(26, 4, paint);
      glazing(c, 16, 1, 9, 3, [4]);
      c.rect(0, 4, 15, 1, shade(paint, 1.25)); // the bed's rim
      c.rect(0, 5, 34, 5, paint);
      c.rect(15, 5, 19, 1, shade(paint, 1.25));
      c.rect(0, 9, 34, 1, shade(paint, 0.6));
      c.rect(14, 5, 1, 4, shade(paint, 0.7)); // gap between cab and bed
      wheel(c, 4, 8, 2);
      wheel(c, 25, 8, 2);
    },
  },
  van: {
    w: 32,
    h: 15,
    draw(c, paint) {
      c.rect(0, 0, 25, 1, shade(paint, 1.15));
      c.rect(0, 1, 27, 11, paint);
      c.rect(27, 5, 5, 7, paint); // the short bonnet
      c.rect(26, 2, 1, 3, paint);
      c.rect(27, 4, 2, 1, paint);
      glazing(c, 20, 2, 6, 4, []);
      c.rect(0, 11, 32, 1, shade(paint, 0.6));
      c.rect(18, 1, 1, 10, shade(paint, 0.8)); // sliding door
      c.rect(2, 6, 14, 1, shade(paint, 1.3)); // a stripe of lettering
      wheel(c, 4, 10, 2);
      wheel(c, 23, 10, 2);
    },
  },
  truck: {
    w: 46,
    h: 18,
    draw(c, paint) {
      const box = hex("#c9c2ae");
      c.rect(0, 0, 30, 13, box);
      c.rect(0, 0, 30, 1, shade(box, 1.1));
      c.rect(0, 12, 30, 1, shade(box, 0.7));
      for (let x = 5; x < 30; x += 6) c.rect(x, 1, 1, 11, shade(box, 0.9)); // ribs
      c.rect(3, 5, 24, 2, paint); // the firm's stripe
      c.rect(32, 4, 10, 10, paint); // cab
      c.rect(32, 4, 10, 1, shade(paint, 1.2));
      c.rect(42, 8, 4, 6, paint); // bonnet
      c.set(42, 7, paint);
      glazing(c, 35, 5, 7, 4, []);
      c.rect(30, 12, 16, 2, shade(paint, 0.6)); // chassis
      c.rect(0, 13, 30, 1, hex("#1c1c20"));
      wheel(c, 5, 13, 2);
      wheel(c, 11, 13, 2);
      wheel(c, 36, 13, 2);
    },
  },
  bus: {
    w: 62,
    h: 18,
    draw(c) {
      const white = hex("#d6d2c4");
      const blue = hex("#2f4f7a");
      c.rect(0, 0, 62, 15, white);
      c.rect(0, 0, 62, 1, shade(white, 0.8));
      c.rect(0, 9, 62, 3, blue); // the stripe
      c.rect(0, 14, 62, 1, shade(white, 0.6));
      for (let x = 3; x < 50; x += 7) glazing(c, x, 3, 6, 5, []);
      c.rect(52, 3, 8, 10, GLASS); // the front door and screen
      c.set(58, 3, SHINE);
      c.rect(55, 3, 1, 10, shade(GLASS, 2.2));
      c.rect(20, 1, 22, 1, hex("#c7a23a")); // destination board
      wheel(c, 8, 13, 2);
      wheel(c, 47, 13, 2);
    },
  },
  sports: {
    w: 28,
    h: 9,
    draw(c, paint) {
      c.rect(10, 0, 8, 1, shade(paint, 1.15));
      c.rect(8, 1, 12, 2, paint);
      c.set(20, 2, paint);
      c.set(21, 2, paint);
      c.set(7, 2, paint);
      glazing(c, 10, 1, 9, 2, []);
      c.rect(0, 3, 28, 4, paint);
      c.rect(2, 3, 26, 1, shade(paint, 1.3));
      c.rect(0, 6, 28, 1, shade(paint, 0.6));
      c.rect(0, 2, 2, 1, shade(paint, 0.8)); // a little wing
      wheel(c, 3, 5);
      wheel(c, 20, 5);
    },
  },
  taxi: {
    w: 28,
    h: 12,
    draw(c) {
      const cab = hex("#c9a227");
      const inner = canvas(28, 11);
      VEHICLES.sedan.draw(inner, cab);
      for (let y = 0; y < 11; y++) {
        for (let x = 0; x < 28; x++) {
          const p = inner.get(x, y);
          if (p) c.set(x, y + 1, p);
        }
      }
      c.rect(11, 0, 5, 1, hex("#e9e2c4")); // the roof light
      for (let x = 2; x < 26; x += 2) c.set(x, 7, hex("#1c1c20")); // the chequer
    },
  },
};

/**
 * A police cruiser: a white sedan with the blue stripes down its side and a
 * light bar on the roof. The bar is drawn dark; the scene lights it when the
 * car is on a call.
 */
VEHICLES.police = {
  w: 28,
  h: 12,
  /** Where the light bar is on the sprite, for the scene to flash. */
  bar: { x: 11, y: 0, w: 5, h: 1 },
  draw(c) {
    const white = hex("#d9d7cf");
    const blue = hex("#27457c");
    const inner = canvas(28, 11);
    VEHICLES.sedan.draw(inner, white);
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 28; x++) {
        const p = inner.get(x, y);
        if (p) c.set(x, y + 1, p);
      }
    }
    c.rect(11, 0, 5, 1, hex("#3a3d46")); // the light bar, unlit
    c.rect(1, 7, 26, 1, blue); // the stripes
    c.rect(1, 9, 26, 1, shade(blue, 0.8));
    c.rect(8, 6, 1, 1, blue); // a shield on the door
    c.rect(15, 6, 3, 1, blue);
  },
};

/** Sports cars come in louder colours than the rest of the street. */
const HOT = ["#8f2a1f", "#b79a4c", "#1c1c20", "#c9c2ae", "#2f4f7a"].map(hex);

/** A vehicle of the given kind and paint, as a sprite. */
export function vehicle(kind, paint) {
  const type = VEHICLES[kind];
  const c = canvas(type.w, type.h);
  type.draw(c, paint);
  return c;
}

/**
 * Returns a function that deals vehicles: a kind by weight (`kinds` is a list
 * of [kind, weight]) and a paint from a shuffled rack, so neighbours on the
 * street are not the same colour until the rack has gone round.
 */
export function dealer(d, kinds) {
  const total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
  let rack = [];
  const paint = () => {
    if (rack.length === 0) {
      rack = [...PAINTS];
      for (let i = rack.length - 1; i > 0; i--) {
        const j = Math.floor(d.rand() * (i + 1));
        [rack[i], rack[j]] = [rack[j], rack[i]];
      }
    }
    return rack.pop();
  };
  return () => {
    let roll = d.rand() * total;
    let kind = kinds[0][0];
    for (const [name, weight] of kinds) {
      roll -= weight;
      if (roll <= 0) {
        kind = name;
        break;
      }
    }
    return { kind, paint: kind === "sports" ? d.pick(HOT) : paint(), ...VEHICLES[kind] };
  };
}

/**
 * Stamps a sprite onto a scene with its bottom-left corner at (x, base),
 * optionally mirrored, passing every pixel through `tone` on the way.
 */
export function stamp(target, sprite, x, base, { flip = false, tone = (p) => p } = {}) {
  for (let y = 0; y < sprite.h; y++) {
    for (let sx = 0; sx < sprite.w; sx++) {
      const p = sprite.get(sx, y);
      if (!p) continue;
      const dx = flip ? sprite.w - 1 - sx : sx;
      target.set(x + dx, base - sprite.h + 1 + y, tone(p));
    }
  }
}

/**
 * A vehicle's lamps, drawn over it after it has been stamped and graded.
 * `on`: lit, with a pool of light thrown ahead on the road. Otherwise just
 * the lenses.
 */
export function lamps(target, { w, h }, x, base, { flip = false, on = false } = {}) {
  const nose = flip ? x : x + w - 1;
  const tail = flip ? x + w - 1 : x;
  const dir = flip ? -1 : 1;
  const y = base - Math.min(5, Math.round(h * 0.42));
  target.set(nose, y, on ? hex("#f4e6a8") : hex("#a39c82"));
  target.set(tail, y, on ? hex("#d2483a") : hex("#6e2a22"));
  if (!on) return;
  target.set(nose, y + 1, hex("#e0cf8e"));
  // The pool of light on the road: see-through, so it lies over whatever road is there.
  for (let i = 1; i <= 14; i++) {
    if (bayer(nose + i * dir, base) < 0.85 - i * 0.055) {
      target.setAlpha(nose + i * dir, base, hex("#b3a26a"), 0.5);
      if (i < 9) target.setAlpha(nose + i * dir, base - 1, hex("#b3a26a"), 0.22);
    }
  }
}
