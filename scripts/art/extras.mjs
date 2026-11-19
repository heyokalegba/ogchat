/**
 * Small things for the scenes' occasional events: who is seen moving behind
 * a lit window, and what goes up on a roof for a barbecue.
 */
import { canvas, hex, mix } from "./lib.mjs";

/** One silhouette's cell. Rows: a person, a taller person, a cat, a dog. Two frames each. */
export const SHADOW = { w: 6, h: 9, frames: 2, rows: 4, person: 0, tall: 1, cat: 2, dog: 3 };

/** Figures seen against a lit window: just their dark shapes. */
export function shadows() {
  const c = canvas(SHADOW.w * SHADOW.frames, SHADOW.h * SHADOW.rows);
  const ink = hex("#17120f");
  const draw = (row, frame, pixels) => {
    for (const [x, y] of pixels) c.set(frame * SHADOW.w + x, row * SHADOW.h + y, ink);
  };
  const box = (x0, y0, x1, y1) => {
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
  };
  for (let frame = 0; frame < 2; frame++) {
    // someone at the window: head and shoulders, shifting a little
    draw(SHADOW.person, frame, [...box(1 + frame, 2, 3 + frame, 4), ...box(0, 5, 4, 8)]);
    // someone taller, an arm up on the second frame (a curtain, a wave)
    draw(SHADOW.tall, frame, [
      ...box(1, 0, 3, 2),
      ...box(0, 3, 4, 8),
      ...(frame
        ? [
            [5, 2],
            [5, 1],
          ]
        : []),
    ]);
    // a cat on the sill: ears, a round back, a tail that flicks
    draw(SHADOW.cat, frame, [
      [1, 4],
      [3, 4],
      ...box(1, 5, 3, 6),
      ...box(0, 7, 3, 8),
      ...(frame
        ? [
            [4, 8],
            [5, 7],
          ]
        : [
            [4, 8],
            [5, 8],
          ]),
    ]);
    // a dog with its paws up: a square head, an ear that lifts
    draw(SHADOW.dog, frame, [
      ...box(1, 4, 4, 6),
      [5, 5],
      [1, frame ? 2 : 3],
      [4, 3],
      ...box(1, 7, 3, 8),
    ]);
  }
  return c;
}

/** The string of lights: one 16-pixel span, as it looks unlit (top row) and lit (bottom row). */
export const PARTY_LIGHTS = { w: 16, h: 6 };
/** The grill: cold, and with its coals glowing. */
export const GRILL = { w: 10, h: 11 };

export function partyLights() {
  const c = canvas(PARTY_LIGHTS.w, PARTY_LIGHTS.h * 2);
  const wire = hex("#17161a");
  const bulbs = ["#e9c46a", "#d2553f", "#5a9fd6", "#7fbf7a"].map(hex);
  for (let row = 0; row < 2; row++) {
    const oy = row * PARTY_LIGHTS.h;
    for (let x = 0; x < PARTY_LIGHTS.w; x++) {
      // the wire sags between the points it is tied at
      const sag = Math.round(Math.sin((x / PARTY_LIGHTS.w) * Math.PI) * 2);
      c.set(x, oy + sag, wire);
      if (x % 4 === 2) {
        const bulb = bulbs[(x >> 2) % bulbs.length];
        c.set(x, oy + sag + 1, row ? bulb : hex("#6b6558"));
        if (row) c.setAlpha(x, oy + sag + 2, bulb, 0.45);
      }
    }
  }
  return c;
}

export function grill() {
  const c = canvas(GRILL.w, GRILL.h * 2);
  const iron = hex("#17161a");
  for (let row = 0; row < 2; row++) {
    const oy = row * GRILL.h;
    c.rect(2, oy + 2, 6, 1, hex("#3a3a3e")); // lid
    c.rect(1, oy + 3, 8, 2, hex("#232326"));
    c.set(4, oy + 1, iron); // handle
    c.set(5, oy + 1, iron);
    c.rect(1, oy + 5, 8, 2, iron); // bowl
    c.rect(2, oy + 7, 6, 1, iron);
    c.set(2, oy + 8, iron); // legs
    c.set(7, oy + 8, iron);
    c.set(1, oy + 9, iron);
    c.set(8, oy + 9, iron);
    c.set(1, oy + 10, iron);
    c.set(8, oy + 10, iron);
    c.set(5, oy + 10, iron);
    c.set(5, oy + 9, iron);
    if (row) {
      c.rect(2, oy + 5, 6, 1, hex("#e0703a")); // coals showing at the rim
      c.set(3, oy + 5, hex("#f4c66a"));
      c.set(6, oy + 5, hex("#f4c66a"));
    }
  }
  return c;
}

/**
 * The app's icon: a patch of the brick wall with the prompt on it, as a
 * rounded square that fills the whole picture, edge to edge, with nothing
 * but transparency outside its corners. That is the shape the Dock expects,
 * drawn at full size so the icon is as large as an icon can be.
 *
 * The wall is pixel art (a 32 by 32 drawing scaled up); the outline is not:
 * it is a smooth curve with softened edges, so the corners do not look
 * chewed at small sizes.
 */
export function appIcon(size) {
  const small = canvas(32, 32);
  const ink = hex("#0d0c0b");
  const brick = hex("#c9ad8a");
  const mortar = hex("#b59a78");
  small.rect(0, 0, 32, 32, brick);
  for (const y of [10, 20]) small.rect(0, y, 32, 2, mortar); // courses
  for (const [x, y, h] of [
    [15, 0, 10],
    [8, 12, 8],
    [22, 12, 8],
    [15, 22, 10],
  ]) {
    small.rect(x, y, 2, h, mortar);
  }
  // the prompt: a chevron, three pixels thick
  for (let i = 0; i < 6; i++) {
    small.rect(8 + i, 10 + i, 3, 1, ink);
    small.rect(8 + i, 22 - i, 3, 1, ink);
  }
  small.rect(17, 20, 8, 3, hex("#7e2e20")); // the caret

  // The outline: a superellipse, which is the rounded square macOS draws its
  // icons in. `reach` is how far out a point is: 1 on the edge of the shape.
  const reach = (x, y) => {
    const u = Math.abs((x / size) * 2 - 1);
    const v = Math.abs((y / size) * 2 - 1);
    return (u ** 5 + v ** 5) ** (1 / 5);
  };
  const RIM = 0.945; // inside this the wall shows; between it and the edge is the dark rim
  const SAMPLES = 4;
  const out = canvas(size, size);
  const scale = size / 32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wall = small.get(
        Math.min(31, Math.floor(x / scale)),
        Math.min(31, Math.floor(y / scale)),
      );
      // Sample the pixel a few times across, for soft edges on both curves.
      let covered = 0;
      let rim = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const r = reach(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES);
          if (r <= 1) covered++;
          if (r <= 1 && r > RIM) rim++;
        }
      }
      if (covered === 0) continue;
      const color = mix(wall, ink, rim / covered);
      const at = (y * size + x) * 4;
      out.data[at] = color[0];
      out.data[at + 1] = color[1];
      out.data[at + 2] = color[2];
      out.data[at + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return out;
}
