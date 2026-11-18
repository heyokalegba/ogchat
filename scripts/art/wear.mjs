/**
 * Wear and tear, at the speed it really happens.
 *
 * A scene does not age in one go. This deals out some hundreds of small
 * marks (a streak under a window sill, a crack in the pavement, a patch in
 * the road, a chipped kerb, a sticker on a lamp post, a stain on a wall) and
 * gives each the day it appears, spread evenly over twenty years. The
 * backdrop shows the ones whose day has come, counted from the day the
 * street was first opened. That is a mark every week or so: nothing you will
 * catch happening, and a different street in a few years.
 *
 * Marks are flat rectangles in a handful of colours, mostly dark and
 * see-through, so they sit on the pictures in any light and any season.
 */
import { dice } from "./lib.mjs";

export const WEAR_YEARS = 20;
const DAYS = WEAR_YEARS * 365;

const COLORS = [
  "#15110e", // soot, damp
  "#2a2019", // rust brown
  "#55555a", // road patch
  "#c9c2ae", // chipped stone, a faded sticker
  "#b79a4c", // sticker, mustard
  "#8fb0a0", // sticker, green
  "#c98a7a", // sticker, pink
  "#3c4a34", // moss
];
const SOOT = 0;
const RUST = 1;
const PATCH = 2;
const CHIP = 3;
const MOSS = 7;

/**
 * `site` says what there is to wear:
 *   w, h       the picture's size
 *   panes      every window, lit or not, as { x, y, w, h }: stains run from their sills, and
 *              nothing else is ever put on glass
 *   walls      stretches of plain wall, as { x, w, top, bottom }
 *   pavement   { top, bottom } rows, or null     road   { top, bottom } rows, or null
 *   kerb       the kerb's row, or null           poles  x of each lamp post, with `foot` its base row
 *   tags       whether walls get the odd scribble of paint low down
 */
export function wearFor(site, seed, count = 800) {
  const d = dice(seed);
  const marks = [];
  const blocked = (x, y, w, h) =>
    x < 0 ||
    y < 0 ||
    x + w > site.w ||
    y + h > site.h ||
    site.panes.some(
      (p) => x < p.x + p.w + 1 && x + w > p.x - 1 && y < p.y + p.h + 1 && y + h > p.y - 1,
    );
  const add = (color, alpha, rects) => {
    // Kept inside the picture: whatever runs over an edge is cut off there.
    const fit = rects
      .map(([x, y, w, h]) => {
        const left = Math.max(0, x);
        const top = Math.max(0, y);
        return [left, top, Math.min(x + w, site.w) - left, Math.min(y + h, site.h) - top];
      })
      .filter(([, , w, h]) => w > 0 && h > 0);
    if (fit.length === 0) return;
    marks.push([d.between(0, DAYS), color, Math.round(alpha * 100), ...fit.flat()]);
  };
  const onWall = () => {
    const wall = d.pick(site.walls);
    return wall
      ? { wall, x: d.between(wall.x, wall.x + wall.w - 1), y: d.between(wall.top, wall.bottom) }
      : null;
  };

  const kinds = [];
  const share = (kind, weight, when = true) => when && kinds.push([kind, weight]);
  share("streak", 28, site.panes.length > 0);
  share("stain", 12, site.walls.length > 0);
  share("crack", 7, site.walls.length > 0);
  share("tag", 3, site.tags && site.walls.length > 0);
  share("paving", 22, Boolean(site.pavement));
  share("spot", 12, Boolean(site.pavement));
  share("road", 14, Boolean(site.road));
  share("chip", 5, site.kerb != null);
  share("sticker", 3, site.poles?.length > 0);
  share("moss", 3, Boolean(site.pavement));
  const total = kinds.reduce((sum, [, weight]) => sum + weight, 0);

  for (let n = 0; n < count; n++) {
    let roll = d.rand() * total;
    let kind = kinds[0][0];
    for (const [name, weight] of kinds) {
      roll -= weight;
      if (roll <= 0) {
        kind = name;
        break;
      }
    }
    if (kind === "streak") {
      // run-off from a sill: a thin dark line down the wall under a window
      const p = d.pick(site.panes);
      const x = p.x + d.between(0, p.w - 1);
      const y = p.y + p.h + 2;
      const length = d.between(2, 6);
      if (!blocked(x, y, 1, length))
        add(d.chance(0.3) ? RUST : SOOT, 0.2 + d.rand() * 0.2, [[x, y, 1, length]]);
    } else if (kind === "stain") {
      const at = onWall();
      if (!at) continue;
      const rects = [];
      for (let i = 0; i < d.between(2, 4); i++) {
        const r = [at.x + d.between(-2, 2), at.y + i, d.between(2, 5), 1];
        if (!blocked(...r)) rects.push(r);
      }
      add(SOOT, 0.12 + d.rand() * 0.1, rects);
    } else if (kind === "crack") {
      const at = onWall();
      if (!at) continue;
      const rects = [];
      let { x, y } = at;
      const lean = d.chance(0.5) ? 1 : -1;
      for (let i = 0; i < d.between(4, 9); i++) {
        if (!blocked(x, y, 1, 1)) rects.push([x, y, 1, 1]);
        y += 1;
        if (d.chance(0.5)) x += lean;
      }
      add(SOOT, 0.4, rects);
    } else if (kind === "tag") {
      // paint, low on a wall: a short scribble in a faded colour
      const wall = d.pick(site.walls);
      let x = d.between(wall.x + 2, wall.x + wall.w - 12);
      let y = Math.min(site.h - 4, wall.bottom - d.between(0, 6));
      const rects = [];
      for (let i = 0; i < d.between(6, 11); i++) {
        if (!blocked(x, y, 1, 1)) rects.push([x, y, 1, 1]);
        x += 1;
        y += d.between(-1, 1);
      }
      add(d.between(3, 6), 0.75, rects);
    } else if (kind === "paving") {
      // a crack running across the flags
      let x = d.between(0, site.w - 8);
      let y = d.between(site.pavement.top, site.pavement.bottom);
      const rects = [];
      for (let i = 0; i < d.between(3, 8); i++) {
        rects.push([x, y, d.between(1, 2), 1]);
        x += d.between(1, 2);
        y = Math.min(site.pavement.bottom, Math.max(site.pavement.top, y + d.between(-1, 1)));
      }
      add(SOOT, 0.42, rects);
    } else if (kind === "spot") {
      const x = d.between(0, site.w - 1);
      const y = d.between(site.pavement.top, site.pavement.bottom);
      add(SOOT, 0.3 + d.rand() * 0.25, [[x, y, d.chance(0.25) ? 2 : 1, 1]]);
    } else if (kind === "road") {
      const x = d.between(0, site.w - 20);
      const y = d.between(site.road.top, site.road.bottom);
      const what = d.rand();
      if (what < 0.4)
        add(PATCH, 0.3, [[x, y, d.between(4, 9), d.between(1, 2)]]); // a patch of new tar gone grey
      else if (what < 0.7)
        add(SOOT, 0.55, [[x, y, d.between(2, 3), 1]]); // a pothole starting
      else add(SOOT, 0.22, [[x, y, d.between(8, 22), 1]]); // a seam
    } else if (kind === "chip") {
      add(d.chance(0.5) ? CHIP : SOOT, 0.5, [
        [d.between(0, site.w - 2), site.kerb, d.between(1, 2), 1],
      ]);
    } else if (kind === "sticker") {
      const pole = d.pick(site.poles);
      add(d.between(3, 6), 0.85, [
        [pole.x - (d.chance(0.5) ? 1 : 0), pole.foot - d.between(8, 22), 2, d.between(2, 3)],
      ]);
    } else if (kind === "moss") {
      // in the angle where the pavement meets the area railings
      add(MOSS, 0.5, [[d.between(0, site.w - 3), site.pavement.top, d.between(1, 3), 1]]);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  return { colors: COLORS, marks };
}
