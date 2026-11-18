"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SKY, type SkyState } from "./art";
import styles from "./backdrop.module.css";

/**
 * Now and then an airliner goes over, high and slow, or a helicopter comes
 * across lower down. One at a time, a minute or three apart. Each is a
 * single small sprite on a CSS animation; script only decides when the next
 * one sets off, and never while the tab is hidden.
 */

interface Flight {
  id: number;
  kind: "plane" | "helicopter";
  /** Height in the sky, percent from the top, and how far it climbs or sinks on the way. */
  top: number;
  rise: number;
  seconds: number;
  leftward: boolean;
}

function schedule(id: number): Flight {
  const plane = Math.random() < 0.6;
  return {
    id,
    kind: plane ? "plane" : "helicopter",
    top: plane ? 4 + Math.random() * 14 : 15 + Math.random() * 14,
    rise: (Math.random() - 0.5) * (plane ? 9 : 4),
    seconds: plane ? 62 + Math.random() * 26 : 38 + Math.random() * 16,
    leftward: Math.random() < 0.5,
  };
}

export function SkyTraffic({ light }: { light: SkyState }) {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seconds = () => performance.now() / 1000;
    let next = seconds() + 12 + Math.random() * 40;
    let id = 0;
    const timer = setInterval(() => {
      if (document.hidden || seconds() < next) return;
      next = seconds() + 60 + Math.random() * 120;
      setFlights((current) => (current.length >= 2 ? current : [...current, schedule(++id)]));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const { flier } = SKY;
  return (
    <>
      {flights.map((flight) => (
        <div
          key={flight.id}
          className={`${styles.flightPath} ${flight.leftward ? styles.flightLeft : ""}`}
          style={
            {
              top: `${flight.top}%`,
              animationDuration: `${flight.seconds}s`,
              "--rise": `${flight.rise}vh`,
            } as CSSProperties
          }
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            setFlights((current) => current.filter((other) => other.id !== flight.id));
          }}
        >
          <div
            className={styles.flier}
            style={{
              width: `calc(var(--u) * ${flier.w})`,
              height: `calc(var(--u) * ${flier.h})`,
            }}
          >
            <div
              className={`${styles.flierFrames} ${flight.kind === "helicopter" ? styles.rotor : ""}`}
              style={{
                backgroundImage: `url(${SKY.fliers[light]})`,
                backgroundSize: `100% ${flier.rows * 100}%`,
                backgroundPosition: `0 ${(flier[flight.kind] / (flier.rows - 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
