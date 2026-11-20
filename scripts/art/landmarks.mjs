/**
 * The towers people look for: One World Trade Center, the Empire State
 * Building and the Chrysler Building, drawn to be told apart at a glance by
 * their outlines rather than their detail.
 *
 * Each takes the canvas, where its centre line and its foot are, how tall
 * its body should stand, and a stone or glass colour to work from, and
 * returns the y of the very top of its mast. Windows are given to `emit`
 * so they come on with the rest of the city.
 */
import { mix, shade } from "./lib.mjs";

/** Sparse lit windows on a face, decided by the lighting dice so nothing else shifts. */
function windows(c, emit, L, left, top, w, h, color, lit, share = 0.22) {
  if (!emit) return;
  emit.building("office");
  for (let y = top + 2; y < top + h - 1; y += 4) {
    for (let x = left + 1; x < left + w - 1; x += 3) {
      c.set(x, y, shade(color, 0.9));
      // The same rolls as ever; they no longer decide which windows are lit.
      let tone = null;
      if (L.chance(share)) {
        tone = L.pick(lit);
        L.chance(0.3);
      }
      emit.home(c, x, y, 1, 1, tone);
    }
  }
}

/**
 * One World Trade Center: a glass shaft whose corners are cut away into long
 * triangles, so it shows a bright upright blade between two darker ones,
 * under a flat crown and a tall mast.
 */
export function oneWorldTrade(c, { x, base, height, width, glass, emit, L, lit }) {
  const top = base - height;
  const podium = Math.round(height * 0.1);
  const bright = mix(glass, [255, 255, 255], 0.22);
  const dim = shade(glass, 0.84);
  for (let y = top; y < base; y++) {
    const t = Math.min(1, (y - top) / (height - podium)); // 0 at the crown, 1 where the taper ends
    // The outline narrows a little toward the top; the bright blade widens toward the foot.
    const half = Math.round((width / 2) * (0.74 + 0.26 * t));
    const blade = y >= base - podium ? half : Math.round(half * t);
    for (let dx = -half; dx <= half; dx++) {
      c.set(x + dx, y, Math.abs(dx) <= blade ? bright : dx > 0 ? dim : glass);
    }
  }
  windows(
    c,
    emit,
    L,
    x - Math.round(width * 0.3),
    top + 6,
    Math.round(width * 0.6),
    height - 10,
    glass,
    lit,
    0.12,
  );
  // crown: a parapet a touch wider than the top, then the ring and the mast
  const cap = Math.round((width / 2) * 0.74);
  c.rect(x - cap, top - 2, cap * 2 + 1, 2, bright);
  c.rect(x - 2, top - 5, 5, 3, dim);
  const mast = Math.round(height * 0.24);
  c.rect(x - 1, top - 5 - Math.round(mast * 0.35), 3, Math.round(mast * 0.35), glass);
  c.rect(x, top - 5 - mast, 1, mast, bright);
  if (emit) emit.light(c, x - cap, top - 2, cap * 2 + 1, 1, lit[0], "evening"); // the lit crown
  return top - 5 - mast;
}

/**
 * The Empire State Building: a broad limestone slab that steps in
 * symmetrically, then a narrow crown and its mast. The top is floodlit.
 */
export function empireState(c, { x, base, height, width, stone, emit, L, lit, flood }) {
  let y = base;
  const tiers = [
    [1, 0.16], // the base block
    [0.72, 0.5], // the main shaft
    [0.56, 0.1],
    [0.4, 0.09],
    [0.26, 0.06],
  ];
  let crownTop = base;
  for (const [share, part] of tiers) {
    const w = Math.max(3, Math.round(width * share));
    const h = Math.max(2, Math.round(height * part));
    y -= h;
    const left = x - Math.floor(w / 2);
    c.rect(left, y, w, h, stone);
    c.rect(
      left + w - Math.max(1, Math.round(w * 0.18)),
      y,
      Math.max(1, Math.round(w * 0.18)),
      h,
      shade(stone, 0.84),
    );
    // the piers: thin vertical stripes are what make it read as limestone and steel
    for (let px = left + 1; px < left + w - 1; px += 2)
      c.rect(px, y + 1, 1, h - 1, shade(stone, 0.93));
    windows(c, emit, L, left, y, w, h, stone, lit, 0.16);
    crownTop = y;
  }
  // the mooring mast and the antenna
  const neck = Math.max(3, Math.round(height * 0.05));
  c.rect(x - 1, crownTop - neck, 3, neck, shade(stone, 1.08));
  const mast = Math.round(height * 0.16);
  c.rect(x, crownTop - neck - mast, 1, mast, stone);
  if (emit && flood) {
    const fh = Math.round(height * 0.15);
    for (let fy = crownTop - neck; fy < crownTop + fh; fy++) {
      for (let fx = x - Math.round(width * 0.2); fx <= x + Math.round(width * 0.2); fx++) {
        if (c.get(fx, fy))
          emit.light(
            c,
            fx,
            fy,
            1,
            1,
            mix(flood, stone, (fy - crownTop + neck) / (fh + neck)),
            "evening",
          );
      }
    }
  }
  return crownTop - neck - mast;
}

/**
 * The Chrysler Building: a slim shaft under a crown of stacked arches that
 * narrows to a needle, with the crown's triangular windows lit after dark.
 */
export function chrysler(c, { x, base, height, width, steel, emit, L, lit }) {
  const shaft = Math.round(height * 0.7);
  let y = base - shaft;
  const left = x - Math.floor(width / 2);
  c.rect(left, y, width, shaft, steel);
  c.rect(left + width - 2, y, 2, shaft, shade(steel, 0.84));
  c.rect(x, y, 1, shaft, shade(steel, 1.1)); // the bright centre bay
  windows(c, emit, L, left, y, width, shaft, steel, lit, 0.16);
  // shoulders
  const sw = Math.max(3, width - 4);
  const sh = Math.round(height * 0.06);
  y -= sh;
  c.rect(x - Math.floor(sw / 2), y, sw, sh, steel);
  // the crown: each arch a little narrower and a little taller than it is wide
  const bright = mix(steel, [255, 255, 255], 0.3);
  let w = sw;
  while (w >= 1) {
    const h = Math.max(2, Math.round(height * 0.035));
    y -= h;
    const l = x - Math.floor(w / 2);
    c.rect(l, y, w, h, bright);
    c.rect(l + w - 1, y, 1, h, steel);
    // the sunburst windows
    if (w >= 3) {
      c.set(x, y + h - 1, shade(steel, 0.7));
      if (emit) emit.light(c, x, y + h - 1, 1, 1, lit[0], "evening");
      if (w >= 5) {
        c.set(x - 2, y + h - 1, shade(steel, 0.7));
        c.set(x + 2, y + h - 1, shade(steel, 0.7));
        if (emit) {
          emit.light(c, x - 2, y + h - 1, 1, 1, lit[0], "evening");
          emit.light(c, x + 2, y + h - 1, 1, 1, lit[0], "evening");
        }
      }
    }
    w -= 2;
  }
  const needle = Math.round(height * 0.14);
  c.rect(x, y - needle, 1, needle, bright);
  return y - needle;
}
