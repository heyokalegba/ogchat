import { useMemo } from "react";
import type { SceneId } from "./art";
import { WEAR } from "./art/wear";
import styles from "./backdrop.module.css";

/**
 * Wear and tear, at the speed it really happens: the marks whose day has
 * come, out of the hundreds dealt to each scene over twenty years (see
 * scripts/art/wear.mjs). `days` is how old the street is. They are plain
 * rectangles that never move, so however many there get to be they cost
 * nothing to keep on screen.
 */
export function Wear({ scene, days, night }: { scene: SceneId; days: number; night: number }) {
  const { colors, marks } = WEAR[scene]!;
  const shown = useMemo(() => {
    // Sorted by day: everything up to the first mark still to come.
    const upTo = marks.findIndex((mark) => mark[0]! > days);
    return upTo === -1 ? marks : marks.slice(0, upTo);
  }, [marks, days]);
  if (shown.length === 0) return null;
  const px = (n: number) => `calc(var(--u) * ${n})`;
  return (
    // Stains do not glow: they dim with the light like the walls they are on.
    <div className={styles.wear} style={{ filter: `brightness(${(1 - night * 0.62).toFixed(2)})` }}>
      {shown.map((mark, index) => {
        const [, color, alpha, ...rects] = mark;
        const pieces = [];
        for (let i = 0; i + 3 < rects.length; i += 4) {
          pieces.push(
            <span
              key={`${index}-${i}`}
              style={{
                left: px(rects[i]!),
                top: px(rects[i + 1]!),
                width: px(rects[i + 2]!),
                height: px(rects[i + 3]!),
                background: colors[color!],
                opacity: alpha! / 100,
              }}
            />,
          );
        }
        return pieces;
      })}
    </div>
  );
}
