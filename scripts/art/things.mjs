/**
 * The small things a street has on it besides houses and people: what the
 * weather and the calendar and the working day bring. Umbrellas, rubbish out
 * for collection, pumpkins on the steps, pigeons, a squirrel, a rat; the
 * vehicles that come by on business (a school bus, a sanitation truck, a
 * parcel van, an ice cream truck, a street sweeper); and the pictures laid
 * over the block when a shop has its shutters down, when the ground is wet,
 * when the snow is deep, and when the Christmas lights are up.
 *
 * Everything small goes on one sheet, so the scene loads one picture for
 * the lot. `map` says where each thing is on it.
 */
import { bayer, canvas, hex, luma, mix, shade } from "./lib.mjs";
import { VEHICLES, vehicle } from "./vehicles.mjs";

const put = (c, ox, oy, rows, palette) => {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== "." && palette[ch]) c.set(ox + x, oy + y, palette[ch]);
    });
  });
};

/** Umbrellas, from the side: a canopy and the top of its handle. */
const UMBRELLAS = ["#17171a", "#27384d", "#8f2a1f", "#566b4a", "#c9c2ae", "#b79a4c"].map(hex);
function umbrella(c, ox, oy, color) {
  put(c, ox, oy, ["...aaa...", ".aaAaAaa.", "aAaAaAaAa", "....s....", "....s...."], {
    a: color,
    A: shade(color, 1.35),
    s: hex("#2a2a2e"),
  });
}

const SERVICE = ["schoolbus", "garbage", "parcel", "icecream", "sweeper"];

/**
 * The sheet, in daylight colours, and where everything is on it. Vehicles
 * are along the top with their wheels on one line; the small things below.
 */
export function streetThings() {
  const map = {};
  let x = 0;
  const top = 20;
  const sheet = canvas(256, 48);
  for (const kind of SERVICE) {
    const type = VEHICLES[kind];
    const sprite = vehicle(kind, null);
    for (let sy = 0; sy < type.h; sy++) {
      for (let sx = 0; sx < type.w; sx++) {
        const p = sprite.get(sx, sy);
        if (p) sheet.set(x + sx, top - type.h + sy, p);
      }
    }
    map[kind] = { x, y: top - type.h, w: type.w, h: type.h, frames: 1 };
    x += type.w + 2;
  }

  let sx = 0;
  const sy = 24;
  const place = (name, w, h, frames, draw) => {
    for (let f = 0; f < frames; f++) draw(sheet, sx + f * w, sy, f);
    map[name] = { x: sx, y: sy, w, h, frames };
    sx += w * frames + 2;
  };
  // Umbrellas: one sprite a colour, side by side, so `frames` here counts colours.
  place("umbrella", 9, 5, UMBRELLAS.length, (c, ox, oy, f) => umbrella(c, ox, oy, UMBRELLAS[f]));
  // Rubbish out for collection: black bags, a white one, clear bags of recycling.
  place("rubbish", 16, 7, 1, (c, ox, oy) =>
    put(
      c,
      ox,
      oy,
      [
        "...bb......cc...",
        "..bBbb....cCcc..",
        ".bbbbBb.wwcccCc.",
        "bbBbbbbwWwwccccc",
        "bbbbbbbwwwwcCccc",
        "bbBbbbbbwwwccccc",
        ".bbbbbb.www.ccc.",
      ],
      {
        b: hex("#1a1a1e"),
        B: hex("#3a3a42"),
        w: hex("#c9c9c0"),
        W: hex("#e6e6dc"),
        c: hex("#7d93a8"),
        C: hex("#a9bccb"),
      },
    ),
  );
  // A pumpkin on a step, and one that has been carved.
  place("pumpkin", 4, 4, 2, (c, ox, oy, f) =>
    put(c, ox, oy, [".g..", "oOoo", f ? "okok" : "oooo", ".oo."], {
      g: hex("#3f6b34"),
      o: hex("#d0752a"),
      O: hex("#e8963f"),
      k: hex("#2a1608"),
    }),
  );
  // A pigeon: standing, and with its head down at something on the pavement.
  place("pigeon", 5, 4, 2, (c, ox, oy, f) =>
    put(
      c,
      ox,
      oy,
      f ? [".....", ".ggg.", "hGgg.", ".f.f."] : ["..h..", ".ggg.", ".Ggg.", ".f.f."],
      {
        g: hex("#7f8791"),
        G: hex("#a9b0b8"),
        h: hex("#4d5560"),
        f: hex("#c07a4a"),
      },
    ),
  );
  // A squirrel at a run: gathered, and stretched out.
  place("squirrel", 8, 5, 2, (c, ox, oy, f) =>
    put(
      c,
      ox,
      oy,
      f
        ? ["tt......", "ttt.....", ".tbbbbh.", "..bbbbb.", ".l....l."]
        : [".tt.....", ".ttt.h..", "..tbbb..", "..bbbb..", "...ll..."],
      { t: hex("#8a6a4a"), b: hex("#6f5238"), h: hex("#7d5e40"), l: hex("#4d3826") },
    ),
  );
  // A rat, low to the ground and in a hurry.
  place("rat", 7, 3, 2, (c, ox, oy, f) =>
    put(c, ox, oy, f ? ["..rrr..", "trrrrr.", ".l..l.."] : ["..rrr..", "trrrrrh", "..l..l."], {
      r: hex("#3d3a38"),
      h: hex("#55504c"),
      t: hex("#6b5a55"),
      l: hex("#2a2725"),
    }),
  );
  return { sheet, map, service: SERVICE };
}

/**
 * A shop with its shutters down: a rolled steel gate over each of the given
 * openings, drawn only where nothing has been put in front of the shop
 * since it was built (`then` is the canvas's count from that moment).
 */
export function shutters(source, openings, then, tone) {
  const out = canvas(source.w, source.h);
  const steel = hex("#7c7f86");
  for (const [x, y, w, h] of openings) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (source.since(xx, yy, then)) continue;
        // corrugated: a bright rib, a dark one, a plain one
        const rib = (yy - y) % 3;
        const base = rib === 0 ? shade(steel, 1.12) : rib === 1 ? shade(steel, 0.78) : steel;
        const edge = xx === x || xx === x + w - 1 ? 0.8 : 1;
        out.set(xx, yy, tone(shade(base, edge)));
      }
    }
    // the box the gate rolls up into, and a padlock at the bottom
    for (let xx = x; xx < x + w; xx++) {
      if (!source.since(xx, y, then)) out.set(xx, y, tone(shade(steel, 0.6)));
    }
    const lock = x + Math.floor(w / 2);
    if (!source.since(lock, y + h - 1, then)) out.set(lock, y + h - 1, tone(hex("#b79a4c")));
  }
  return out;
}

/** A see-through pixel, written straight to a canvas. */
function veil(c, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.data[i] = color[0];
  c.data[i + 1] = color[1];
  c.data[i + 2] = color[2];
  c.data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
}

/**
 * Wet ground. The pavement and the road go darker, and whatever is bright
 * above them (a lamp, a shop window, a pale house front) shows in them
 * upside down, stretched and broken up, the way it does in wet asphalt.
 * `picture` is the block as drawn in one light.
 */
export function wetGround(picture, { pavement, kerb }) {
  const out = canvas(picture.w, picture.h);
  for (let y = pavement; y < picture.h; y++) {
    const road = y > kerb;
    const depth = y - (road ? kerb : pavement);
    const reach = road ? picture.h - kerb : kerb - pavement;
    for (let x = 0; x < picture.w; x++) {
      const here = picture.get(x, y);
      if (!here) continue;
      // What is mirrored here: higher up the wall the farther out into the road you look.
      const up = pavement - 2 - Math.round(depth * (road ? 2.4 : 1.5));
      const ripple = y % 3 === 0 && bayer(x, y) < 0.5 ? 1 : 0;
      const above = up >= 0 ? picture.get(x + ripple, up) : null;
      const gain = above ? luma(above) - luma(here) : 0;
      if (above && gain > 24 && bayer(x, y + 1) < (road ? 0.66 : 0.42)) {
        const fade = 1 - depth / (reach + 2);
        veil(
          out,
          x,
          y,
          mix(above, [255, 255, 255], 0.06),
          Math.min(0.62, 0.16 + gain / 190) * fade,
        );
      } else {
        veil(out, x, y, [9, 11, 20], road ? 0.24 : 0.15); // simply wet: darker
      }
    }
  }
  return out;
}

/**
 * Deep snow: what the ploughs leave along the kerb and what builds up
 * against the houses once there is more than a dusting. Laid over the
 * snowy picture when the snow on the ground is really deep.
 */
export function snowBanks(w, h, { pavement, kerb }, snow) {
  const out = canvas(w, h);
  const lump = (x, seed) =>
    Math.sin(x * 0.21 + seed) * 0.9 +
    Math.sin(x * 0.07 + seed * 2.3) * 1.3 +
    Math.sin(x * 0.53) * 0.4;
  for (let x = 0; x < w; x++) {
    // the bank the plough leaves, straddling the kerb
    const high = Math.max(1, Math.round(2.4 + lump(x, 1.7)));
    for (let r = 0; r < high; r++) {
      const y = kerb + 1 - r;
      out.set(x, y, shade(snow, r === high - 1 ? 1.08 : 0.94 - (bayer(x, y) < 0.3 ? 0.08 : 0)));
    }
    if (bayer(x, kerb + 2) < 0.6) out.set(x, kerb + 2, shade(snow, 0.8)); // slush in the gutter
    // and what has drifted against the house fronts
    const drift = Math.max(0, Math.round(0.8 + lump(x, 4.1) * 0.7));
    for (let r = 0; r < drift; r++) out.set(x, pavement + r, shade(snow, 0.98));
  }
  return out;
}

/**
 * Christmas lights: a string of coloured bulbs along the cornice of most
 * houses. Two pictures with the colours moved along one, so that taking
 * turns they twinkle. Bulbs are lights: they are not graded with the hour.
 */
export function christmasLights(w, h, houses) {
  const bulbs = ["#ff5a4a", "#5fd06a", "#ffd25a", "#5aa0ff", "#f4eee0"].map(hex);
  const pictures = [canvas(w, h), canvas(w, h)];
  houses.forEach((house, n) => {
    if ((n * 7 + 3) % 10 < 3) return; // not everybody bothers
    const y = house.top + 2;
    for (let x = house.x + 1, i = 0; x < house.x + house.w - 2; x += 3, i++) {
      const sag = i % 2; // the string dips between its hooks
      pictures.forEach((picture, turn) => {
        picture.set(x, y + sag, bulbs[(i + n + turn * 2) % bulbs.length]);
      });
    }
  });
  return pictures;
}
