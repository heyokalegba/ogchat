"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { brooklynDay } from "@/lib/daylight";
import { chance, rubbishOut, visitsOn, type VisitKind, type Wardrobe } from "@/lib/nycday";
import { PEOPLE, SCENES, SKY, type SceneId, type SkyState } from "./art";
import { thingStyle, type StreetConfig, type Thing } from "./sprites";
import { ServiceCar, StreetExtras } from "./StreetExtras";
import styles from "./backdrop.module.css";
import {
  castCabRide,
  castErrand,
  castMailCarrier,
  errandSeconds,
  castPatrol,
  castSleeper,
  castRoofVisit,
  castStanding,
  castWalkers,
  MAX_HEADS,
  wantedHeads,
  type CabRide,
  type Patrol,
  type ServiceRun,
  type LifeConfig,
  type Member,
  type Party,
} from "./life";

/**
 * The people in the scene: a few out walking at any time, now and then a
 * group, never a crowd (see life.ts for who they are and what they do).
 *
 * Cheap by construction. Each party is a handful of tiny sprites. The browser
 * slides them along with a CSS transition and steps their legs with a CSS
 * animation, both on the compositor. Script only wakes once a second to
 * decide whether someone new should turn up, and at each party's stops.
 * Nothing runs while the tab is hidden.
 */

/** Scene pixels as a CSS length (see --u in backdrop.module.css). */
const u = (n: number) => `calc(var(--u) * ${n})`;

const ROOF_BOX = 22; // how much room above a roof line its people get

/** Whether a row of the people sheet is a child or a runner: nobody who carries an umbrella. */
const CHILD_ROWS = (row: number) =>
  row >= PEOPLE.cast.children[0] && row < PEOPLE.cast.runners[0] + PEOPLE.cast.runners[1];

/** An umbrella to hold over somebody: which colour, and the sheet it is cut from. */
interface Brolly {
  src: string;
  sheet: { w: number; h: number };
  thing: Thing;
}

function MemberView(props: {
  member: Member;
  sheets: Sheets;
  /** The colour of the umbrella this one has up, or null for none. */
  umbrella: number | null;
  brolly: Brolly | null;
}) {
  const { member, sheets, umbrella, brolly } = props;
  const cell =
    member.sheet === "people"
      ? PEOPLE.person
      : member.sheet === "props"
        ? PEOPLE.prop
        : PEOPLE.wheel;
  return (
    <>
      {umbrella !== null && brolly && (
        <div
          className={styles.umbrella}
          data-seat={member.seat ? "" : undefined}
          style={
            {
              left: u(member.dx),
              // The canopy clears the head; the handle comes down to the hand.
              top: u(member.dy - cell.h + 1 - 2),
              ...thingStyle(brolly.sheet, brolly.thing, brolly.src, umbrella),
              "--sx": member.seat?.dx ?? 0,
              "--sy": member.seat?.dy ?? 0,
            } as CSSProperties
          }
        />
      )}
      <MemberSprite member={member} sheets={sheets} cell={cell} />
    </>
  );
}

function MemberSprite({
  member,
  sheets,
  cell,
}: {
  member: Member;
  sheets: Sheets;
  cell: { w: number; h: number; rows: number };
}) {
  return (
    <div
      className={styles.member}
      // Those with a seat move to it, and sit, when the party sits down.
      data-seat={member.seat ? "" : undefined}
      style={
        {
          left: u(member.dx),
          top: u(member.dy - cell.h + 1),
          width: u(cell.w),
          height: u(cell.h),
          "--sx": member.seat?.dx ?? 0,
          "--sy": member.seat?.dy ?? 0,
        } as CSSProperties
      }
    >
      <div
        className={styles.frames}
        style={
          {
            backgroundImage: `url(${sheets[member.sheet]})`,
            // One column wide, every row tall: show this character's row.
            backgroundSize: `100% ${cell.rows * 100}%`,
            backgroundPosition: `0 ${(member.row / (cell.rows - 1)) * 100}%`,
            "--cadence": `${member.cadence}s`,
            "--phase": `${(-member.phase * member.cadence).toFixed(2)}s`,
            "--idle": `${member.idle}s`,
          } as CSSProperties
        }
      />
    </div>
  );
}

interface Sheets {
  people: string;
  props: string;
  wheels: string;
}

/** One party, playing its script from start to finish and then asking to be removed. */
const PartyView = memo(function PartyView(props: {
  party: Party;
  sheets: Sheets;
  /** How many of the grown-ups have an umbrella up, 0 to 1. */
  umbrellas?: number;
  brolly?: Brolly | null;
  onDone: (id: number) => void;
}) {
  const { party, sheets, onDone } = props;
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = element.current;
    if (!el) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let x = party.x;
    let lift = party.lift;
    const place = (seconds: number) => {
      el.style.transition = seconds ? `transform ${seconds}s linear` : "none";
      el.style.transform = `translate(${u(x)}, ${u(party.y + lift)})`;
    };
    const play = (index: number) => {
      if (cancelled) return;
      const step = party.steps[index];
      if (!step) {
        onDone(party.id);
        return;
      }
      const next = () => play(index + 1);
      if (step.kind === "wait") {
        el.dataset.gait = "idle";
        if (Number.isFinite(step.seconds)) timer = setTimeout(next, step.seconds * 1000);
        return;
      }
      if (step.kind === "sit") {
        // Down onto the doorstep, and at the end a moment to get back up before moving on.
        el.dataset.gait = "sit";
        timer = setTimeout(() => {
          el.dataset.gait = "idle";
          timer = setTimeout(next, 800);
        }, step.seconds * 1000);
        return;
      }
      if (step.kind === "rant") {
        // An arm in the air, facing wherever they were headed, saying their piece.
        el.dataset.gait = "hail";
        timer = setTimeout(next, step.seconds * 1000);
        return;
      }
      if (step.kind === "hail") {
        // Facing the traffic that will bring the cab, which comes from the left.
        el.dataset.gait = "hail";
        el.dataset.facing = "left";
        timer = setTimeout(next, step.seconds * 1000);
        return;
      }
      el.dataset.gait = "walk";
      if (step.kind === "walk") {
        if (step.to !== x) el.dataset.facing = step.to > x ? "right" : "left";
        x = step.to;
      } else if (step.kind === "board") {
        // Down off the kerb and round to the door: gone from view as they reach the cab.
        lift = step.drop;
        el.dataset.facing = "right";
      } else {
        lift = step.to;
      }
      place(step.seconds);
      if (step.kind === "board") {
        el.style.transition += `, opacity ${step.seconds}s steps(1, end)`;
        el.style.opacity = "0";
      }
      timer = setTimeout(next, step.seconds * 1000);
    };
    place(0);
    // Two frames: the starting position has to be on screen before the first move can glide.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => play(0));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [party, onDone]);

  return (
    <div ref={element} className={styles.party} data-gait="idle" data-facing="right">
      <div className={styles.formation}>
        {party.members.map((member, index) => (
          <MemberView
            key={index}
            member={member}
            sheets={sheets}
            brolly={props.brolly ?? null}
            umbrella={
              // Grown-ups on foot, as many as the weather calls for; always the same ones.
              member.sheet === "people" &&
              !CHILD_ROWS(member.row) &&
              chance(party.id, index) < (props.umbrellas ?? 0)
                ? Math.floor(chance(party.id * 7 + index, 3) * (props.brolly?.thing.frames ?? 1))
                : null
            }
          />
        ))}
      </div>
    </div>
  );
});

/**
 * The cab that answers a hail. It waits out of sight until it is due, runs in
 * from the left along its lane and eases in to the kerb, and once its fare is
 * aboard pulls away to the right. Three timers and two CSS transitions.
 */
function Cab(props: {
  ride: CabRide;
  cab: NonNullable<LifeConfig["cab"]>;
  sprite: string;
  /** Scene pixels the picture is wide: where "off the right-hand edge" is. */
  far: number;
  onGone: (id: number) => void;
}) {
  const { ride, cab, sprite, far, onGone } = props;
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    const at = (x: number, base: number) => `translate(${u(x)}, ${u(base - cab.h + 1)})`;
    el.style.transform = at(-cab.w - 12, cab.lane);
    const timers = [
      setTimeout(
        () => {
          el.style.visibility = "visible";
          el.style.transition = `transform ${ride.arriveFor}s cubic-bezier(0.16, 0.6, 0.3, 1)`;
          el.style.transform = at(ride.stopX, cab.kerb);
        },
        Math.max(0, ride.arriveAt) * 1000,
      ),
      setTimeout(() => {
        el.style.transition = "transform 5.5s cubic-bezier(0.5, 0, 0.85, 0.55)";
        el.style.transform = at(far + 20, cab.lane);
      }, ride.leaveAt * 1000),
      setTimeout(() => onGone(ride.id), (ride.leaveAt + 5.8) * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [ride, cab, far, onGone]);
  return (
    <div
      ref={element}
      className={styles.cab}
      style={{
        width: u(cab.w),
        height: u(cab.h),
        backgroundImage: `url(${sprite})`,
        visibility: "hidden",
      }}
    />
  );
}

/**
 * A police car going by. Most of the time it is a slow patrol down the
 * block; now and then it is on a call, lights going, and gone in seconds.
 * One CSS transition takes it across; it is removed when it has left.
 */
function PatrolCar(props: {
  patrol: Patrol;
  car: NonNullable<LifeConfig["patrol"]>;
  sprite: string;
  far: number;
  /** After dark the light bar throws its colours wider. */
  night: number;
  onGone: (id: number) => void;
}) {
  const { patrol, car, sprite, far, night, onGone } = props;
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    const at = (x: number) => `translate(${u(x)}, ${u(car.lane - car.h + 1)})`;
    el.style.transform = at(-car.w - 14);
    // Two frames: the start has to be on screen (just off it) before the drive can glide.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        el.style.transition = `transform ${patrol.seconds}s linear`;
        el.style.transform = at(far + 20);
      });
    });
    const gone = setTimeout(() => onGone(patrol.id), (patrol.seconds + 0.6) * 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(gone);
    };
  }, [patrol, car, far, onGone]);
  return (
    <div
      ref={element}
      className={styles.cab}
      style={{ width: u(car.w), height: u(car.h), backgroundImage: `url(${sprite})` }}
    >
      {patrol.lights && (
        <span
          className={styles.patrolBar}
          style={
            {
              left: u(car.bar.x),
              top: u(car.bar.y),
              width: u(car.bar.w),
              height: u(car.bar.h),
              "--throw": 0.35 + 0.65 * night,
            } as CSSProperties
          }
        />
      )}
    </div>
  );
}

/**
 * What goes up for a barbecue: a string of lights between two poles, and a
 * grill at one end with its smoke. After dark the bulbs and the coals glow.
 */
function RoofDecor({ width, night }: { width: number; night: number }) {
  const { partyLights, grill, smoke } = SKY;
  const glow = Math.min(1, night * 1.4);
  const lights = (lit: boolean): CSSProperties => ({
    backgroundImage: `url(${partyLights.src})`,
    backgroundSize: `${u(partyLights.w)} ${u(partyLights.h * 2)}`,
    backgroundPosition: `0 ${lit ? u(-partyLights.h) : "0"}`,
  });
  const grillAt = (lit: boolean): CSSProperties => ({
    backgroundImage: `url(${grill.src})`,
    backgroundSize: `100% 200%`,
    backgroundPosition: lit ? "0 100%" : "0 0",
  });
  const span = { left: u(3), width: u(width - 6), top: u(ROOF_BOX - 19), height: u(partyLights.h) };
  return (
    <>
      <div className={styles.partyPole} style={{ left: u(2), top: u(ROOF_BOX - 19) }} />
      <div className={styles.partyPole} style={{ left: u(width - 3), top: u(ROOF_BOX - 19) }} />
      <div className={styles.partyLights} style={{ ...span, ...lights(false) }} />
      {glow > 0.02 && (
        <div className={styles.partyGlow} style={{ opacity: glow }}>
          <div className={styles.partyLights} style={{ ...span, ...lights(true) }} />
        </div>
      )}
      <div
        className={styles.partySmoke}
        style={{ left: u(4), top: u(ROOF_BOX - grill.h - 10), width: u(10), height: u(12) }}
      >
        <div className={styles.smokeStrip} style={{ backgroundImage: `url(${smoke})` }} />
      </div>
      <div
        className={styles.partyGrill}
        style={{
          left: u(5),
          top: u(ROOF_BOX - grill.h),
          width: u(grill.w),
          height: u(grill.h),
          ...grillAt(false),
        }}
      />
      {glow > 0.02 && (
        <div
          className={styles.partyGrill}
          style={{
            left: u(5),
            top: u(ROOF_BOX - grill.h),
            width: u(grill.w),
            height: u(grill.h),
            opacity: glow,
            ...grillAt(true),
          }}
        />
      )}
    </>
  );
}

export function StreetLife(props: {
  scene: SceneId;
  light: SkyState;
  night: number;
  /** Whatever stands at the kerb: drawn over the pavement and under the road. */
  kerb?: ReactNode;
  /** A barbecue going on now: which of the scene's roofs, and when (scene time) it ends. */
  party?: { roof: number; endsAt: number } | null;
  /** The scene's time now, in milliseconds. */
  now?: number;
  /** Frozen: a few people standing where they are, and nothing else. */
  still?: boolean;
  /** How busy the street should be: about 1 on an ordinary busy pavement, near 0 when deserted. */
  bustle?: number;
  /** Past the hour for children and ball games. */
  late?: boolean;
  /** Too cold or wet for anyone to sit out on a doorstep. */
  noSitting?: boolean;
  /** What people are wearing for the temperature, and how many have an umbrella up. */
  wardrobe?: Wardrobe;
  umbrellas?: number;
  /** How much the hour is one for ordering in, 0 to 1. */
  hungry?: number;
  /** The temperature, and whether it is raining or snowing. */
  tempC?: number;
  wet?: boolean;
  /** Told when a police car comes through with its siren going. */
  onSiren?: () => void;
}) {
  const { scene, light } = props;
  const art = SCENES[scene];
  const life: LifeConfig = art.config.life;
  // The street's furniture and the sheet of small things, where the scene has a street.
  const street: StreetConfig | null =
    "street" in art.config ? (art.config.street as StreetConfig) : null;
  const thingsSrc = art.things ? art.things[light] : null;
  /** Vehicles on business making their way down the block. */
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const onRunGone = useCallback(
    (id: number) => setRuns((current) => current.filter((run) => run.id !== id)),
    [],
  );
  /** Which rubbish piles the truck has taken this morning, by index. */
  const [collected, setCollected] = useState<number[]>([]);
  const pilesOf = useRef(new Map<number, number[]>());
  const onRunStop = useCallback((run: ServiceRun, index: number) => {
    const pile = pilesOf.current.get(run.id)?.[index];
    if (pile !== undefined) setCollected((current) => [...current, pile]);
  }, []);
  const [previewed, setPreviewed] = useState<string[]>([]);
  const siren = useRef(props.onSiren);
  useEffect(() => {
    siren.current = props.onSiren;
  });
  const still = props.still ?? false;
  const [parties, setParties] = useState<Party[]>([]);
  const live = useRef<Party[]>([]);
  /** Cabs on their way to, or away from, somebody who hailed one. */
  const [cabs, setCabs] = useState<CabRide[]>([]);
  const onCabGone = useCallback(
    (id: number) => setCabs((current) => current.filter((ride) => ride.id !== id)),
    [],
  );
  /** Police cars on their way down the block. Rarely any. */
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const onPatrolGone = useCallback(
    (id: number) => setPatrols((current) => current.filter((one) => one.id !== id)),
    [],
  );
  // How the street is just now, for the spawner to read whenever it next looks.
  const mood = useRef({
    bustle: 1,
    late: false,
    noSitting: false,
    wardrobe: "mild" as Wardrobe,
    hungry: 0,
    tempC: 15,
    wet: false,
  });
  useEffect(() => {
    mood.current = {
      bustle: props.bustle ?? 1,
      late: props.late ?? false,
      noSitting: props.noSitting ?? false,
      wardrobe: props.wardrobe ?? "mild",
      hungry: props.hungry ?? 0,
      tempC: props.tempC ?? 15,
      wet: props.wet ?? false,
    };
  }, [
    props.bustle,
    props.late,
    props.noSitting,
    props.wardrobe,
    props.hungry,
    props.tempC,
    props.wet,
  ]);

  const commit = useCallback((next: Party[]) => {
    live.current = next;
    setParties(next);
  }, []);
  const onDone = useCallback(
    (id: number) => commit(live.current.filter((party) => party.id !== id)),
    [commit],
  );

  useEffect(() => {
    const rand = Math.random;
    // People up at a barbecue are counted apart from the usual comings and goings.
    const heads = () =>
      live.current.reduce((sum, party) => sum + (party.guest ? 0 : party.heads), 0);
    const add = (...cast: (Party | null)[]) => {
      const fresh = cast.filter((party): party is Party => party !== null);
      // Dressed for the weather as it is when they come out, and they stay that way.
      for (const party of fresh) party.wardrobe ??= mood.current.wardrobe;
      if (fresh.length) commit([...live.current, ...fresh]);
    };
    const onRoofs = life.kind === "roofs";
    const one = (room: number, midway = false) =>
      onRoofs
        ? castRoofVisit(rand, PEOPLE, life, { room, delay: midway ? rand() * 6 : 0 })
        : castWalkers(rand, PEOPLE, life, {
            room,
            midway,
            late: mood.current.late,
            noSitting: mood.current.noSitting,
            hungry: mood.current.hungry,
          });

    // Frozen, or less motion asked for: a few people standing about, and nothing else.
    if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCabs([]);
      add(...Array.from({ length: 3 }, () => castStanding(rand, PEOPLE, life)));
      return () => commit([]);
    }

    // Open on a street that is already lived in, not an empty one filling up.
    let wanted = wantedHeads(rand, mood.current.bustle);
    // Often somebody is already out on a doorstep, when it is a time and a day for it.
    if (
      life.stoops.length > 0 &&
      !mood.current.noSitting &&
      rand() < 0.75 * Math.min(1, mood.current.bustle)
    ) {
      add(castWalkers(rand, PEOPLE, life, { seated: true, room: 3 }));
    }
    for (let n = 0; n < 6 && heads() < wanted; n++) add(one(wanted - heads(), true));

    const seconds = () => performance.now() / 1000;
    let nextArrival = seconds() + 2 + rand() * 6;
    let nextGroup = seconds() + 45 + rand() * 90;
    // Now and then somebody flags down a cab. Only where there is a kerb to do it from.
    let nextCab = seconds() + 35 + rand() * 80;
    // Rarer things. A police car comes by a couple of times an hour at most, and
    // somebody sleeping out on a doorstep is looked for every several minutes.
    let nextPatrol = seconds() + 600 + rand() * 1500;
    let nextSleeper = seconds() + 90 + rand() * 420;

    // For a look at the rare things without waiting for them: set
    // localStorage "ogchat:preview" to any of patrol, call, sleeper, canner, pacer.
    let preview: string[] = [];
    try {
      preview = (window.localStorage.getItem("ogchat:preview") ?? "").split(/[\s,]+/);
    } catch {
      // no storage: nothing to preview
    }
    const pending: ReturnType<typeof setTimeout>[] = [];
    const later = (seconds: number, run: () => void) => {
      pending.push(setTimeout(run, seconds * 1000));
    };

    // The vehicles and people that come down the block on business (see lib/nycday.ts
    // for when). Each sets off from the left; some pull up; some have somebody get out.
    let runId = 0;
    const visit = (kind: VisitKind, afternoon = false) => {
      if (onRoofs || !street || !art.things) return;
      if (kind === "mail") return add(castMailCarrier(rand, PEOPLE, life));
      const things = street.things;
      const send = (run: Omit<ServiceRun, "id">) => {
        const id = --runId; // counted down, so as never to meet a party's id
        setRuns((current) => [...current, { id, ...run }]);
        return id;
      };
      // Somewhere mid-block to pull up, clear of the ends.
      const spot = Math.round(150 + rand() * 300);
      const reach = (x: number, speed: number, w: number) => (x + w + 14) / speed;
      if (kind === "sweeper") {
        send({ kind, stops: [], speed: 13, kerbside: true });
      } else if (kind === "garbage") {
        const out = street.piles.map((x, index) => ({ x, index }));
        const id = send({
          kind,
          // It stops with its hopper, which is at the back, level with each pile.
          stops: out.map(({ x }) => ({ x: x - 2, stay: 3.2 })),
          speed: 24,
        });
        pilesOf.current.set(
          id,
          out.map(({ index }) => index),
        );
      } else if (kind === "schoolbus") {
        send({ kind, stops: [{ x: spot, stay: 9 }], speed: 30, hazards: true });
        // In the afternoon it lets children off, and somebody is there to walk them home.
        if (afternoon) {
          const count = 1 + Math.floor(rand() * 3);
          for (let n = 0; n < count; n++) {
            later(reach(spot, 30, things.schoolbus?.w ?? 58) + 2 + n * 1.6, () =>
              add(
                castErrand(rand, PEOPLE, life, {
                  kind: "child",
                  from: spot + 30 + n * 5,
                  to: spot + 30 + (rand() < 0.5 ? -1 : 1) * (30 + rand() * 60),
                  wait: 1 + rand() * 2,
                  back: false,
                }),
              ),
            );
          }
        }
      } else if (kind === "parcel") {
        // Double-parked, hazards on, and the driver up somebody's steps with a box.
        const door = [...life.stoops].sort(
          (a, b) => Math.abs(a.x - spot) - Math.abs(b.x - spot),
        )[0];
        const driver = castErrand(rand, PEOPLE, life, {
          from: spot + 30,
          to: door?.x ?? spot + 60,
          wait: 4 + rand() * 4,
          back: true,
        });
        send({
          kind,
          stops: [{ x: spot, stay: errandSeconds(driver) + 3.5 }],
          speed: 28,
          hazards: true,
        });
        later(reach(spot, 28, things.parcel?.w ?? 36) + 1.2, () => add(driver));
      } else if (kind === "icecream") {
        send({ kind, stops: [{ x: spot, stay: 40 }], speed: 15 });
        const count = 1 + Math.floor(rand() * 3);
        for (let n = 0; n < count; n++) {
          const side = rand() < 0.5 ? -1 : 1;
          later(reach(spot, 15, things.icecream?.w ?? 34) + 2 + n * 4, () =>
            add(
              castErrand(rand, PEOPLE, life, {
                kind: "child",
                from: spot + 12 + side * (70 + rand() * 90),
                to: spot + 12 + n * 4,
                wait: 8 + rand() * 6,
                back: false,
              }),
            ),
          );
        }
      }
    };
    // What the day has down for this block, read off the scene's clock once a second.
    let seen = -1;
    const business = () => {
      const day = brooklynDay(sceneNow.current);
      const stamp = day.dayId * 1440 + day.minute;
      // Only a minute that has just come round counts: setting the clock is not a day's traffic.
      if (seen !== -1 && stamp > seen && stamp - seen <= 2) {
        for (const due of visitsOn(day, mood.current.tempC, mood.current.wet)) {
          const at = day.dayId * 1440 + due.minute;
          if (at > seen && at <= stamp) visit(due.kind, due.minute > 12 * 60);
        }
      }
      seen = stamp;
    };

    later(1.5, () => {
      if (onRoofs) return;
      setPreviewed(preview);
      for (const name of preview) {
        if (name === "patrol" || name === "call") {
          if (life.patrol) {
            if (name === "call") siren.current?.();
            setPatrols((current) => [...current, { ...castPatrol(rand), lights: name === "call" }]);
          }
        } else if (name === "sleeper") add(castSleeper(rand, PEOPLE, life));
        else if (name === "canner" || name === "pacer" || name === "courier") {
          add(castWalkers(rand, PEOPLE, life, { only: name, midway: name !== "courier" }));
        } else if (
          ["schoolbus", "garbage", "parcel", "icecream", "sweeper", "mail"].includes(name)
        ) {
          visit(name as VisitKind, true);
        }
      }
    });

    // The street carries on whether or not anyone is looking. It used to stop
    // while the window was hidden and fill up again in one go on the way back,
    // and that was people appearing out of nowhere as you swiped to the window.
    // Now there is nothing to catch up on: whoever is there walked there.
    const tick = () => {
      const now = seconds();
      business();
      if (now >= nextArrival) {
        // Looked at afresh each time, so a street that emptied overnight fills again by morning.
        wanted = wantedHeads(rand, mood.current.bustle);
        if (heads() < wanted) add(one(Math.min(wanted + 1, MAX_HEADS) - heads()));
        // People come along more slowly when there are fewer of them about.
        nextArrival = now + (2 + rand() * 7) / Math.max(0.3, Math.min(1.3, mood.current.bustle));
      }
      if (now >= nextPatrol) {
        nextPatrol = now + 1200 + rand() * 1800;
        if (life.patrol) {
          const patrol = castPatrol(rand);
          if (patrol.lights) siren.current?.();
          setPatrols((current) => [...current, patrol]);
        }
      }
      if (now >= nextSleeper) {
        nextSleeper = now + 300 + rand() * 480;
        // More often at night, when the doorsteps are free and there is nowhere else to be.
        const here = live.current.some((party) => party.sleeper);
        if (!onRoofs && !here && rand() < (mood.current.late ? 0.5 : 0.12)) {
          add(castSleeper(rand, PEOPLE, life));
        }
      }
      if (now >= nextCab) {
        nextCab = now + 150 + rand() * 270;
        const ride = castCabRide(rand, PEOPLE, life);
        if (ride) {
          add(ride.party);
          setCabs((current) => [...current, ride.cab]);
        }
      }
      if (now >= nextGroup) {
        nextGroup = now + 150 + rand() * 250;
        // Groups come by when the street is busy; on a quiet one most are skipped.
        if (rand() > mood.current.bustle) return;
        const room = MAX_HEADS - heads();
        const size = Math.min(
          room,
          rand() < 0.15 ? 10 + Math.floor(rand() * 5) : 4 + Math.floor(rand() * 6),
        );
        if (size < 3) return;
        if (!onRoofs) {
          add(castWalkers(rand, PEOPLE, life, { group: size, room }));
          return;
        }
        // A gathering on one roof: people come up a few at a time and stay a good while.
        const roof = Math.floor(rand() * life.roofs.length);
        const stay = 50 + rand() * 70;
        const guests: (Party | null)[] = [];
        let count = 0;
        for (let n = 0; n < size && count < Math.min(size, 8); n++) {
          const guest = castRoofVisit(rand, PEOPLE, life, {
            roof,
            room: size - count,
            delay: n * (2 + rand() * 4),
            stay,
          });
          count += guest?.heads ?? 0;
          guests.push(guest);
        }
        add(...guests);
      }
    };
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      pending.forEach(clearTimeout);
      commit([]);
      setCabs([]);
      setPatrols([]);
      setRuns([]);
    };
  }, [life, commit, still]);

  // ---- the barbecue: guests come up while it lasts, and are sent home if it is called off
  const partyRoof = props.party?.roof ?? null;
  const partyEnds = props.party?.endsAt ?? 0;
  const sceneNow = useRef(props.now ?? 0);
  useEffect(() => {
    sceneNow.current = props.now ?? 0;
  }, [props.now]);
  useEffect(() => {
    if (partyRoof === null || still) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rand = Math.random;
    const guests = () =>
      live.current.reduce((sum, party) => sum + (party.guest ? party.heads : 0), 0);
    const invite = (count: number) => {
      const remaining = (partyEnds - sceneNow.current) / 1000;
      if (remaining < 150) return; // nearly over: nobody new comes up now
      const fresh: Party[] = [];
      let heads = 0;
      for (let n = 0; n < count * 2 && heads < count; n++) {
        const guest = castRoofVisit(rand, PEOPLE, life, {
          roof: partyRoof,
          room: Math.min(2, count - heads),
          delay: n * (3 + rand() * 6),
          // They stay a good while, though never past the end of it.
          stay: Math.min(remaining - 60, 240 + rand() * 900),
          visits: 3 + Math.floor(rand() * 5),
          guest: true,
        });
        if (!guest) continue;
        heads += guest.heads;
        fresh.push(guest);
      }
      if (fresh.length) commit([...live.current, ...fresh]);
    };
    invite(4 + Math.floor(rand() * 3));
    const timer = setInterval(() => {
      if (guests() < 4) invite(2 + Math.floor(rand() * 2));
    }, 25_000);
    return () => {
      clearInterval(timer);
      commit(live.current.filter((party) => !party.guest));
    };
  }, [partyRoof, partyEnds, life, commit, still]);

  // Everybody's sprites, in each wardrobe: a party keeps the one it came out in.
  const sheetsBy = useMemo(() => {
    const of = (wardrobe: Wardrobe): Sheets => ({
      people: art.people[wardrobe][light],
      props: art.props[light],
      wheels: art.wheels[light],
    });
    return { mild: of("mild"), cold: of("cold"), hot: of("hot") };
  }, [art, light]);
  const brolly = useMemo<Brolly | null>(
    () =>
      street?.things.umbrella && thingsSrc
        ? { src: thingsSrc, sheet: street.sheet, thing: street.things.umbrella }
        : null,
    [street, thingsSrc],
  );
  const view = (party: Party) => (
    <PartyView
      key={party.id}
      party={party}
      sheets={sheetsBy[party.wardrobe ?? "mild"]}
      umbrellas={props.umbrellas ?? 0}
      brolly={brolly}
      onDone={onDone}
    />
  );
  const day = brooklynDay(props.now ?? 0);
  // Once the rubbish has gone in, the count of what the truck took starts again.
  const out = rubbishOut(day);
  useEffect(() => {
    if (!out) setCollected([]);
  }, [out]);
  const onFoot = parties.filter((party) => party.roof === null && !party.road);
  const road = parties.filter((party) => party.road);

  return (
    <div className={styles.life}>
      {life.roofs.map((roof, index) => {
        const here = parties.filter((party) => party.roof === index);
        const hosting = partyRoof === index;
        return (
          (here.length > 0 || hosting) && (
            <div
              key={index}
              className={styles.roof}
              style={{
                left: u(roof.x),
                top: u(roof.top - ROOF_BOX),
                width: u(roof.w),
                height: u(ROOF_BOX),
              }}
            >
              {hosting && <RoofDecor width={roof.w} night={props.night} />}
              {/* Feet on the last row of the box, which is the row above the roof line. */}
              <div className={styles.roofLine} style={{ top: u(ROOF_BOX - 1) }}>
                {here.map(view)}
              </div>
            </div>
          )
        );
      })}
      {/* Nearest last, so they pass in front. */}
      {street && thingsSrc && (
        <StreetExtras
          street={street}
          life={life}
          src={thingsSrc}
          day={day}
          night={props.night}
          tempC={props.tempC ?? 15}
          wet={props.wet ?? false}
          still={still}
          collected={collected}
          preview={previewed}
        />
      )}
      {[...onFoot].sort((a, b) => a.y - b.y || a.id - b.id).map(view)}
      {props.kerb}
      {street &&
        thingsSrc &&
        runs.map((run) => (
          <ServiceCar
            key={run.id}
            run={run}
            street={street}
            src={thingsSrc}
            base={run.kerbside && life.cab ? life.cab.kerb : street.lane}
            far={life.to}
            onStop={onRunStop}
            onGone={onRunGone}
          />
        ))}
      {life.patrol &&
        art.cruiser &&
        patrols.map((patrol) => (
          <PatrolCar
            key={patrol.id}
            patrol={patrol}
            car={life.patrol!}
            sprite={art.cruiser![light]}
            far={life.to}
            night={props.night}
            onGone={onPatrolGone}
          />
        ))}
      {life.cab &&
        art.cab &&
        cabs.map((ride) => (
          <Cab
            key={ride.id}
            ride={ride}
            cab={life.cab!}
            sprite={art.cab![light]}
            far={life.to}
            onGone={onCabGone}
          />
        ))}
      {road.map(view)}
    </div>
  );
}
