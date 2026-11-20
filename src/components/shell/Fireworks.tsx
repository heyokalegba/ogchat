"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./backdrop.module.css";

interface Burst {
  id: number;
  /** Where it goes off, in percent of the scene. */
  x: number;
  y: number;
  tone: string;
  /** How far the sparks are thrown, in scene pixels, and for how long they live. */
  reach: number;
  life: number;
  sparks: number;
}

const TONES = ["#ff5a4a", "#ffd25a", "#7fe08a", "#6ab0ff", "#f4eee0", "#ff8ad0", "#ffa23a"];

/**
 * Fireworks over the skyline: bursts going off one after another, each a
 * ring of sparks thrown out from a point and fading as they fall. Shown on
 * the nights there are fireworks (see fireworksAt in lib/nycday.ts) and at
 * no other time. `onBang` is told about each one, for anybody who wants to
 * make a noise about it.
 */
export function Fireworks(props: { active: boolean; still: boolean; onBang?: () => void }) {
  const { active, still, onBang } = props;
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    if (!active || still) {
      setBursts([]);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    let timer: ReturnType<typeof setTimeout>;
    const fire = () => {
      timer = setTimeout(fire, 250 + Math.random() * 1100);
      if (document.hidden) return;
      const burst: Burst = {
        id: ++id,
        x: 12 + Math.random() * 76,
        y: 8 + Math.random() * 30,
        tone: TONES[Math.floor(Math.random() * TONES.length)]!,
        reach: 24 + Math.random() * 30,
        life: 1.3 + Math.random() * 0.9,
        sparks: 20 + Math.floor(Math.random() * 12),
      };
      onBang?.();
      // No more than a few in the air at once, however fast they come.
      setBursts((current) => [...current.slice(-6), burst]);
    };
    timer = setTimeout(fire, 400);
    return () => clearTimeout(timer);
  }, [active, still, onBang]);

  if (bursts.length === 0) return null;
  return (
    <div className={styles.fireworks} aria-hidden="true">
      {bursts.map((burst) =>
        Array.from({ length: burst.sparks }, (_, n) => {
          const angle = (n / burst.sparks) * Math.PI * 2;
          // Two rings, one inside the other; a little unevenness; and gravity pulls it all down.
          const ring = n % 3 === 0 ? 0.5 : 1;
          const far = burst.reach * ring * (0.8 + ((n * 7) % 5) / 14);
          return (
            <span
              key={`${burst.id}-${n}`}
              className={styles.spark}
              style={
                {
                  left: `${burst.x}%`,
                  top: `${burst.y}%`,
                  "--tone": burst.tone,
                  "--life": `${burst.life}s`,
                  "--dx": (Math.cos(angle) * far).toFixed(1),
                  "--dy": (Math.sin(angle) * far + far * 0.35).toFixed(1),
                } as CSSProperties
              }
            />
          );
        }),
      )}
    </div>
  );
}
