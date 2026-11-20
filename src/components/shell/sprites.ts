import type { CSSProperties } from "react";

/** Scene pixels as a CSS length (see --u in backdrop.module.css). */
export const u = (n: number) => `calc(var(--u) * ${n})`;

/** Where one of the small things is on its sheet: its corner, its size, how many frames across. */
export interface Thing {
  x: number;
  y: number;
  w: number;
  h: number;
  frames: number;
}

/** What a scene with a street says about it (see scripts/art/brooklyn.mjs). */
export interface StreetConfig {
  things: Record<string, Thing>;
  sheet: { w: number; h: number };
  pavement: number;
  kerb: number;
  lane: number;
  shops: readonly string[];
  piles: readonly number[];
  manholes: readonly (readonly number[])[];
  trees: readonly number[];
}

/** The CSS that shows one thing from the sheet, at its own size. `frame` picks among its frames. */
export function thingStyle(
  sheet: { w: number; h: number },
  thing: Thing,
  src: string,
  frame = 0,
): CSSProperties {
  return {
    width: u(thing.w),
    height: u(thing.h),
    backgroundImage: `url(${src})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${u(sheet.w)} ${u(sheet.h)}`,
    backgroundPosition: `${u(-(thing.x + frame * thing.w))} ${u(-thing.y)}`,
  };
}
