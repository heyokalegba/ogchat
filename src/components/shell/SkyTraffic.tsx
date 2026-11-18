"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SKY, type SkyState } from "./art";
import styles from "./backdrop.module.css";

/**
 * Now and then an airliner goes over, high and slow, or a helicopter comes
 * across lower down. One at a time, a minute or three apart. Each is a
 * single small sprite on a CSS animation; script only decides when the next
 * one sets off, and never while the tab is hidden.
 */

/** A few birds going somewhere together: across the picture, low, quick, wings going. */
interface Flock {
  id: number;
  top: number;
  seconds: number;
  leftward: boolean;
  /** Each bird's place in the flock, and where in its wingbeat it starts. */
  birds: { dx: number; dy: number; beat: number }[];
}

function gather(id: number): Flock {
  const count = 1 + Math.floor(Math.random() * Math.random() * 7);
  return {
    id,
    top: 10 + Math.random() * 42,
    seconds: 13 + Math.random() * 11,
    leftward: Math.random() < 0.5,
    birds: Array.from({ length: count }, (_, n) => ({
      dx: n * (5 + Math.random() * 6),
      dy: (Math.random() - 0.5) * 16,
      beat: Math.random(),
    })),
  };
}

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

export function SkyTraffic({ light, night }: { light: SkyState; night: number }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const dark = useRef(night);
  useEffect(() => {
    dark.current = night;
  }, [night]);

  // Birds: a few every so often while there is light to fly by.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seconds = () => performance.now() / 1000;
    let next = seconds() + 3 + Math.random() * 8;
    let id = 0;
    const timer = setInterval(() => {
      if (document.hidden || seconds() < next) return;
      next = seconds() + 9 + Math.random() * 24;
      if (dark.current > 0.6) return; // gone to roost
      setFlocks((current) => (current.length >= 3 ? current : [...current, gather(++id)]));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

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

  const { flier, bird } = SKY;
  return (
    <>
      {flocks.map((flock) => (
        <div
          key={flock.id}
          className={`${styles.flightPath} ${flock.leftward ? styles.flightLeft : ""}`}
          style={
            {
              top: `${flock.top}%`,
              animationDuration: `${flock.seconds}s`,
              "--rise": "-4vh",
            } as CSSProperties
          }
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            setFlocks((current) => current.filter((other) => other.id !== flock.id));
          }}
        >
          <div className={styles.flockBob}>
            {flock.birds.map((member, index) => (
              <div
                key={index}
                className={styles.flier}
                style={{
                  left: `calc(var(--u) * ${-member.dx})`,
                  top: `calc(var(--u) * ${member.dy})`,
                  width: `calc(var(--u) * ${bird.w})`,
                  height: `calc(var(--u) * ${bird.h})`,
                }}
              >
                <div
                  className={`${styles.flierFrames} ${styles.wingbeat}`}
                  style={{
                    backgroundImage: `url(${bird.src})`,
                    backgroundSize: "100% 100%",
                    animationDelay: `${(-member.beat * 0.36).toFixed(2)}s`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
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
