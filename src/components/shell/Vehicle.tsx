"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./backdrop.module.css";
import { onTheRoad } from "./life";

/**
 * One vehicle on a lane. It drives its lap for ever; whether it is actually
 * out on the road depends on how much traffic the hour calls for.
 *
 * Each vehicle has a fixed place in the order, and is out while the traffic
 * level is above it, so the same cars are the ones about at three in the
 * morning every night. It only ever joins or leaves the road at the turn of
 * its lap, which is off the edge of the picture: nothing appears or
 * vanishes in view.
 */
export function Vehicle(props: {
  /** This vehicle's place in the order, 0 to 1. */
  place: number;
  /** How much traffic there should be, 0 to 1. */
  level: number;
  style: CSSProperties;
}) {
  const { place, level, style } = props;
  const wanted = useRef(level);
  useEffect(() => {
    wanted.current = level;
  }, [level]);
  const [out, setOut] = useState(() => onTheRoad(place, level));
  return (
    <div
      className={styles.vehicle}
      style={{ ...style, visibility: out ? "visible" : "hidden" }}
      onAnimationIteration={() => setOut(onTheRoad(place, wanted.current))}
    />
  );
}
