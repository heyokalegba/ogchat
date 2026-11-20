import type { CSSProperties } from "react";
import { LIGHT_AIR, type Wind } from "@/lib/nycday";
import type { Conditions } from "@/lib/weather";
import { SKY } from "./art";
import styles from "./backdrop.module.css";

/**
 * What the weather puts between you and the scene: a dimness over everything
 * when the sky is covered, rain or snow falling in up to three depths
 * (fewer when it is only spitting, all of them when it is coming down hard),
 * fog lying in the street, a flicker of lightning in a storm, and in autumn
 * a few leaves coming down on the wind. Each is a small tile repeated across the scene
 * and slid along by CSS; nothing here runs in script.
 */

/** A tile repeated over the scene and a little beyond, so it can slide a tile's length. */
function falling(tile: { src: string; size: number }, scale = 1, drift?: number): CSSProperties {
  const size = `calc(var(--u) * ${tile.size * scale})`;
  return {
    backgroundImage: `url(${tile.src})`,
    backgroundSize: `${size} ${size}`,
    "--tile": size,
    // How far sideways it is carried for each tile it falls: the wind's doing.
    ...(drift === undefined ? {} : { "--drift": drift.toFixed(2) }),
  } as CSSProperties;
}

export function WeatherLayer(props: {
  conditions: Conditions;
  grey: number;
  leaves: boolean;
  night: number;
  /** The wind: which way it carries what is falling, and how hard. */
  wind?: Wind;
}) {
  const { conditions, grey, leaves, night } = props;
  const wind = props.wind ?? LIGHT_AIR;
  // Rain slants with the wind; snow and leaves are carried a good deal further by it.
  const slant = wind.push * 1.3;
  const carried = wind.push * 2.2;
  const { kind: weather, force } = conditions;
  const wet = weather === "rain" || weather === "storm";
  const hard = weather === "storm" || force === "heavy";
  return (
    <>
      {/*
        A covered sky takes the brightness down. It is a dark slate, not a pale
        grey: a pale one lifts the shadows and reads as fog, which is not what
        cloud does to a street.
      */}
      {grey > 0.05 && (
        <div
          className={styles.overcast}
          style={{
            opacity: grey * (0.26 - night * 0.1),
            background: night > 0.5 ? "#0b0f1a" : "#39424f",
          }}
        />
      )}
      {weather === "fog" && <div className={styles.fog} />}
      {wet && (
        <>
          <div
            className={`${styles.fall} ${styles.rainFar}`}
            style={falling(SKY.rain, 0.75, slant)}
          />
          {(hard || force !== "light") && (
            <div
              className={`${styles.fall} ${styles.rainNear}`}
              style={falling(SKY.rain, 1, slant)}
            />
          )}
          {hard && (
            <div
              className={`${styles.fall} ${styles.rainHard}`}
              style={falling(SKY.rain, 1.25, slant * 1.15)}
            />
          )}
        </>
      )}
      {weather === "storm" && <div className={styles.lightning} />}
      {weather === "snow" && (
        <div className={styles.sway}>
          <div
            className={`${styles.fall} ${styles.snowFar}`}
            style={falling(SKY.snow, 0.7, carried * 0.8)}
          />
          {force !== "light" && (
            <div
              className={`${styles.fall} ${styles.snowNear}`}
              style={falling(SKY.snow, 1, carried)}
            />
          )}
          {force === "heavy" && (
            <div
              className={`${styles.fall} ${styles.snowHard}`}
              style={falling(SKY.snow, 1.3, carried * 1.1)}
            />
          )}
        </div>
      )}
      {leaves && !wet && weather !== "snow" && (
        <div className={styles.sway}>
          <div
            className={`${styles.fall} ${styles.leafFall}`}
            style={falling(SKY.leaves, 1, carried * 1.2 || -0.3)}
          />
        </div>
      )}
    </>
  );
}
