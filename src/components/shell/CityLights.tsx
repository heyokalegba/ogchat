"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { glowFor, litWindows, nightAt, prepare, type WindowSet } from "@/lib/citylights";
import styles from "./backdrop.module.css";

/** The scene is drawn 640 by 360; this layer is drawn at exactly that and scaled up with it. */
const W = 640;
const H = 360;

/**
 * The lit windows of one layer of the city.
 *
 * The pictures show every window dark. This lays the lit ones over them: it
 * asks which windows have a light on at this moment (lib/citylights.ts) and
 * copies each of those, and only those, out of a picture that has every
 * window lit. Because the copy comes from the art, a window half hidden by
 * a tree is lit only where it shows.
 *
 * It looks at the clock about once a minute. Lights come on and go off as
 * they would: one here, a floor there. By day there is nothing to draw and
 * nothing is drawn.
 */
export function CityLights(props: {
  windows: WindowSet;
  /** The picture with every window lit. */
  src: string;
  /** The scene's time, in milliseconds. */
  now: number;
  /** How dark it is out, 0 day to 1 night. */
  dark: number;
  /** Keeps this layer's nights apart from the other layers'. */
  salt: number;
}) {
  const { windows, src, now, dark, salt } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const prepared = useMemo(() => prepare(windows), [windows]);
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const drawn = useRef<{ picture: HTMLImageElement | null; lit: Uint8Array | null }>({
    picture: null,
    lit: null,
  });

  useEffect(() => {
    let current = true;
    const image = new Image();
    image.onload = () => current && setPicture(image);
    image.src = src;
    return () => {
      current = false;
    };
  }, [src]);

  // The minute, and the darkness in steps: what the windows are asked about. Changing
  // either is the only thing that can change the answer, so nothing is redone in between.
  const minute = Math.floor(now / 60_000);
  const step = Math.round(dark * 40) / 40;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !picture) return;
    const lit = litWindows(prepared, nightAt(minute * 60_000, step), salt);
    const before = drawn.current;
    const same =
      before.picture === picture &&
      before.lit?.length === lit.length &&
      before.lit.every((value, i) => value === lit[i]);
    if (same) return;
    drawn.current = { picture, lit };

    const { x, y, w, h } = prepared;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // A soft glow round the larger windows first, so the windows themselves sit on top of it.
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i] || w[i]! * h[i]! < 6) continue;
      ctx.globalAlpha = 0.07;
      ctx.drawImage(
        picture,
        x[i]!,
        y[i]!,
        w[i]!,
        h[i]!,
        x[i]! - 2,
        y[i]! - 2,
        w[i]! + 4,
        h[i]! + 4,
      );
      ctx.globalAlpha = 0.12;
      ctx.drawImage(
        picture,
        x[i]!,
        y[i]!,
        w[i]!,
        h[i]!,
        x[i]! - 1,
        y[i]! - 1,
        w[i]! + 2,
        h[i]! + 2,
      );
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i]) continue;
      // The glow may have spilled onto this window from its neighbour: clear it, then copy.
      ctx.clearRect(x[i]!, y[i]!, w[i]!, h[i]!);
      ctx.drawImage(picture, x[i]!, y[i]!, w[i]!, h[i]!, x[i]!, y[i]!, w[i]!, h[i]!);
    }
  }, [prepared, picture, minute, step, salt]);

  return (
    <canvas
      ref={canvas}
      className={styles.cityLights}
      width={W}
      height={H}
      style={{ opacity: glowFor(dark) }}
      aria-hidden="true"
    />
  );
}
