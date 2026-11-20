"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BrooklynDay } from "@/lib/daylight";
import { calendarOf, chance, rubbishOut } from "@/lib/nycday";
import { SKY } from "./art";
import styles from "./backdrop.module.css";
import type { LifeConfig, ServiceRun } from "./life";
import { thingStyle, u, type StreetConfig } from "./sprites";

/**
 * A vehicle that comes down the block on business: in from the left, a stop
 * wherever it has one to make, and away to the right. While it is stopped
 * in the road its hazard lights blink.
 */
export function ServiceCar(props: {
  run: ServiceRun;
  street: StreetConfig;
  src: string;
  /** The row its wheels are on, and where the picture ends on the right. */
  base: number;
  far: number;
  onStop: (run: ServiceRun, index: number) => void;
  onGone: (id: number) => void;
}) {
  const { run, street, src, base, far, onStop, onGone } = props;
  const thing = street.things[run.kind];
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onStop, onGone });
  useEffect(() => {
    callbacks.current = { onStop, onGone };
  });
  useEffect(() => {
    const el = element.current;
    if (!el || !thing) return;
    const at = (x: number) => `translate(${u(x)}, ${u(base - thing.h + 1)})`;
    let x = -thing.w - 14;
    el.style.transform = at(x);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let clock = 0.1; // seconds from now
    const drive = (to: number, ease: string) => {
      const seconds = Math.abs(to - x) / run.speed;
      const from = clock;
      timers.push(
        setTimeout(() => {
          el.dataset.stopped = "";
          el.style.transition = `transform ${seconds}s ${ease}`;
          el.style.transform = at(to);
        }, from * 1000),
      );
      clock += seconds;
      x = to;
    };
    run.stops.forEach((stop, index) => {
      drive(stop.x, index === 0 ? "cubic-bezier(0.2, 0.6, 0.35, 1)" : "ease-in-out");
      const arrived = clock;
      timers.push(
        setTimeout(() => {
          el.dataset.stopped = "yes";
          callbacks.current.onStop(run, index);
        }, arrived * 1000),
      );
      clock += stop.stay;
    });
    drive(far + 24, run.stops.length ? "cubic-bezier(0.5, 0, 0.8, 0.6)" : "linear");
    timers.push(setTimeout(() => callbacks.current.onGone(run.id), (clock + 0.5) * 1000));
    return () => timers.forEach(clearTimeout);
  }, [run, thing, base, far]);
  if (!thing) return null;
  return (
    <div ref={element} className={styles.serviceCar} style={thingStyle(street.sheet, thing, src)}>
      {run.hazards && (
        <>
          <span className={styles.hazard} style={{ left: 0, top: u(thing.h - 6) }} />
          <span className={styles.hazard} style={{ left: u(thing.w - 1), top: u(thing.h - 6) }} />
        </>
      )}
    </div>
  );
}

interface Dash {
  id: number;
  kind: "squirrel" | "rat";
  from: number;
  to: number;
  y: number;
  seconds: number;
}

/**
 * What is on the street that is not a person or a car: rubbish out for
 * collection, pumpkins on the steps in October, a few pigeons by day, a
 * squirrel going from tree to tree, a rat along the kerb at night, and
 * steam coming up through the manholes when it is cold.
 */
export function StreetExtras(props: {
  street: StreetConfig;
  life: LifeConfig;
  /** The sheet of small things, in the light it is now. */
  src: string;
  day: BrooklynDay;
  night: number;
  tempC: number;
  /** Raining or snowing: the pigeons are somewhere dry. */
  wet: boolean;
  still: boolean;
  /** Which of the rubbish piles the truck has already taken, by index. */
  collected: readonly number[];
  /** Things to show at once, for a look: "squirrel", "rat". */
  preview?: readonly string[];
}) {
  const { street, life, src, day, night, tempC, wet, still, collected } = props;
  const { things, sheet } = street;
  const season = calendarOf(day);
  const out = rubbishOut(day);

  // Pigeons: a few, in places that change every couple of minutes, by day and in the dry.
  const flock = Math.floor(day.minute / 2);
  const pigeons =
    night < 0.5 && !wet
      ? Array.from({ length: 2 + Math.floor(chance(day.dayId, flock) * 4) }, (_, n) => ({
          key: `${flock}-${n}`,
          x: Math.round(30 + chance(flock * 31 + n, day.dayId) * 580),
          y:
            street.pavement +
            2 +
            Math.floor(chance(flock, n * 7 + 3) * (street.kerb - street.pavement - 3)),
          delay: -chance(n, flock) * 3,
          flip: chance(n * 13, flock) < 0.5,
        }))
      : [];

  // A squirrel between two trees by day; a rat along the kerb at night. One at a time.
  const [dashes, setDashes] = useState<Dash[]>([]);
  const mood = useRef({ night, wet });
  useEffect(() => {
    mood.current = { night, wet };
  }, [night, wet]);
  const preview = props.preview?.join(",") ?? "";
  useEffect(() => {
    if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    const send = (kind: Dash["kind"]) => {
      const trees = street.trees;
      if (kind === "squirrel" && trees.length >= 2) {
        const a = Math.floor(Math.random() * (trees.length - 1));
        const leftward = Math.random() < 0.5;
        const from = trees[leftward ? a + 1 : a]!;
        const to = trees[leftward ? a : a + 1]!;
        const dash = {
          id: ++id,
          kind,
          from,
          to,
          y: street.pavement + 2,
          seconds: Math.abs(to - from) / 34,
        };
        setDashes((current) => [...current, dash]);
      } else if (kind === "rat") {
        const from = 40 + Math.random() * 500;
        const to = from + (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 90);
        const dash = {
          id: ++id,
          kind,
          from,
          to,
          y: street.kerb - 1,
          seconds: Math.abs(to - from) / 52,
        };
        setDashes((current) => [...current, dash]);
      }
    };
    const first = setTimeout(() => {
      for (const name of preview.split(",")) if (name === "squirrel" || name === "rat") send(name);
    }, 1800);
    const timer = setInterval(() => {
      const { night: dark, wet: raining } = mood.current;
      if (raining || document.hidden) return;
      // About one squirrel every three minutes of daylight; a rat every five or so of night.
      if (dark < 0.4 && Math.random() < 20 / 180) send("squirrel");
      else if (dark > 0.75 && Math.random() < 20 / 320) send("rat");
    }, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [still, street, preview]);

  const at = (x: number, bottom: number, h: number): CSSProperties => ({
    position: "absolute",
    left: u(x),
    top: u(bottom - h + 1),
  });

  return (
    <>
      {/* Steam through the manholes when it is cold: the city's heating, leaking. */}
      {tempC < 7 &&
        street.manholes.map(([x, y]) => (
          <div
            key={`steam-${x}`}
            className={styles.steam}
            style={{ left: u(x! - 5), top: u(y! - 15), width: u(10), height: u(16) }}
          >
            <div className={styles.smokeStrip} style={{ backgroundImage: `url(${SKY.smoke})` }} />
          </div>
        ))}
      {out &&
        things.rubbish &&
        street.piles.map(
          (x, index) =>
            !collected.includes(index) && (
              <div
                key={`pile-${x}`}
                style={{
                  ...at(x, street.kerb - 1, things.rubbish!.h),
                  ...thingStyle(sheet, things.rubbish!, src),
                }}
              />
            ),
        )}
      {season.pumpkins &&
        things.pumpkin &&
        life.stoops.map((stoop, n) => {
          if (chance(n, 41) > 0.62) return null;
          const carved = chance(n, 43) < 0.5;
          return (
            <div
              key={`pumpkin-${stoop.x}`}
              className={carved && night > 0.4 ? styles.lantern : undefined}
              style={{
                ...at(stoop.x + (chance(n, 47) < 0.5 ? 3 : -7), stoop.y - 2, things.pumpkin!.h),
                ...thingStyle(sheet, things.pumpkin!, src, carved ? 1 : 0),
              }}
            />
          );
        })}
      {things.pigeon &&
        pigeons.map((bird) => (
          <div
            key={bird.key}
            className={styles.pigeon}
            style={{
              ...at(bird.x, bird.y, things.pigeon!.h),
              width: u(things.pigeon!.w),
              height: u(things.pigeon!.h),
              transform: bird.flip ? "scaleX(-1)" : undefined,
            }}
          >
            <div
              className={styles.peck}
              style={{
                ...thingStyle(sheet, things.pigeon!, src),
                width: u(things.pigeon!.w * 2),
                animationDelay: `${bird.delay}s`,
              }}
            />
          </div>
        ))}
      {dashes.map((dash) => {
        const thing = things[dash.kind];
        if (!thing) return null;
        return (
          <div
            key={dash.id}
            className={styles.dash}
            style={
              {
                top: u(dash.y - thing.h + 1),
                width: u(thing.w),
                height: u(thing.h),
                animationDuration: `${dash.seconds}s`,
                "--from": dash.from,
                "--to": dash.to,
              } as CSSProperties
            }
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              setDashes((current) => current.filter((other) => other.id !== dash.id));
            }}
          >
            <div
              className={styles.scurry}
              style={{
                ...thingStyle(sheet, thing, src),
                width: u(thing.w * 2),
                transform: dash.to < dash.from ? "scaleX(-1)" : undefined,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
