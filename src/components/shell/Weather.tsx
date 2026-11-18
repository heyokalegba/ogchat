import type { CSSProperties } from "react";
import type { Weather as Kind } from "@/lib/weather";
import { SKY } from "./art";
import styles from "./backdrop.module.css";

/**
 * What the weather puts between you and the scene: a grey over everything
 * when the sky is covered, rain or snow falling in two depths, fog lying in
 * the street, a flicker of lightning in a storm, and in autumn a few leaves
 * coming down on the wind. Each is a small tile repeated across the scene
 * and slid along by CSS; nothing here runs in script.
 */

/** A tile repeated over the scene and a little beyond, so it can slide a tile's length. */
function falling(tile: { src: string; size: number }, scale = 1): CSSProperties {
  const size = `calc(var(--u) * ${tile.size * scale})`;
  return {
    backgroundImage: `url(${tile.src})`,
    backgroundSize: `${size} ${size}`,
    "--tile": size,
  } as CSSProperties;
}

export function WeatherLayer(props: {
  weather: Kind;
  grey: number;
  leaves: boolean;
  night: number;
}) {
  const { weather, grey, leaves, night } = props;
  const wet = weather === "rain" || weather === "storm";
  return (
    <>
      {/* A covered sky flattens the light and takes the colour out of everything a little. */}
      {grey > 0 && (
        <div
          className={styles.overcast}
          style={{
            opacity: grey * (0.5 - night * 0.2),
            background: night > 0.5 ? "#141a2a" : "#6f7783",
          }}
        />
      )}
      {weather === "fog" && <div className={styles.fog} />}
      {wet && (
        <>
          <div className={`${styles.fall} ${styles.rainFar}`} style={falling(SKY.rain, 0.75)} />
          <div className={`${styles.fall} ${styles.rainNear}`} style={falling(SKY.rain)} />
          {weather === "storm" && (
            <div className={`${styles.fall} ${styles.rainHard}`} style={falling(SKY.rain, 1.25)} />
          )}
        </>
      )}
      {weather === "storm" && <div className={styles.lightning} />}
      {weather === "snow" && (
        <div className={styles.sway}>
          <div className={`${styles.fall} ${styles.snowFar}`} style={falling(SKY.snow, 0.7)} />
          <div className={`${styles.fall} ${styles.snowNear}`} style={falling(SKY.snow)} />
        </div>
      )}
      {leaves && !wet && weather !== "snow" && (
        <div className={styles.sway}>
          <div className={`${styles.fall} ${styles.leafFall}`} style={falling(SKY.leaves)} />
        </div>
      )}
    </>
  );
}
