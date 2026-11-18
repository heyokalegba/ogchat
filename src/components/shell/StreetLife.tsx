"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PEOPLE, SCENES, SKY, type SceneId, type SkyState } from "./art";
import styles from "./backdrop.module.css";
import {
  castRoofVisit,
  castStanding,
  castWalkers,
  MAX_HEADS,
  wantedHeads,
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

function MemberView({ member, sheets }: { member: Member; sheets: Sheets }) {
  const cell =
    member.sheet === "people"
      ? PEOPLE.person
      : member.sheet === "props"
        ? PEOPLE.prop
        : PEOPLE.wheel;
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
      el.dataset.gait = "walk";
      if (step.kind === "walk") {
        if (step.to !== x) el.dataset.facing = step.to > x ? "right" : "left";
        x = step.to;
      } else {
        lift = step.to;
      }
      place(step.seconds);
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
          <MemberView key={index} member={member} sheets={sheets} />
        ))}
      </div>
    </div>
  );
});

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
}) {
  const { scene, light } = props;
  const art = SCENES[scene];
  const life: LifeConfig = art.config.life;
  const [parties, setParties] = useState<Party[]>([]);
  const live = useRef<Party[]>([]);
  const night = useRef(props.night);
  useEffect(() => {
    night.current = props.night;
  }, [props.night]);

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
      if (fresh.length) commit([...live.current, ...fresh]);
    };
    const onRoofs = life.kind === "roofs";
    const one = (room: number, midway = false) =>
      onRoofs
        ? castRoofVisit(rand, PEOPLE, life, { room, delay: midway ? rand() * 6 : 0 })
        : castWalkers(rand, PEOPLE, life, { room, midway });

    // Less motion asked for: a few people standing about, and nothing else.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      add(...Array.from({ length: 3 }, () => castStanding(rand, PEOPLE, life)));
      return () => commit([]);
    }

    // Open on a street that is already lived in, not an empty one filling up.
    let wanted = wantedHeads(rand, night.current);
    // Often somebody is already out on a doorstep.
    if (life.stoops.length > 0 && rand() < 0.75) {
      add(castWalkers(rand, PEOPLE, life, { seated: true, room: 3 }));
    }
    for (let n = 0; n < 6 && heads() < wanted; n++) add(one(wanted - heads(), true));

    const seconds = () => performance.now() / 1000;
    let nextArrival = seconds() + 2 + rand() * 6;
    let nextGroup = seconds() + 45 + rand() * 90;

    let away = false;
    const tick = () => {
      if (document.hidden) {
        away = true;
        return;
      }
      const now = seconds();
      if (away) {
        // Back from another tab: everyone has walked off meanwhile. Fill the street again.
        away = false;
        for (let n = 0; n < 6 && heads() < wanted; n++) add(one(wanted - heads(), true));
      }
      if (now >= nextArrival && heads() < wanted) {
        add(one(Math.min(wanted + 1, MAX_HEADS) - heads()));
        nextArrival = now + 2 + rand() * 7;
        wanted = wantedHeads(rand, night.current);
      }
      if (now >= nextGroup) {
        nextGroup = now + 150 + rand() * 250;
        // Groups are a daytime and evening thing; late at night most are skipped.
        if (rand() < night.current * 0.6) return;
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
      commit([]);
    };
  }, [life, commit]);

  // ---- the barbecue: guests come up while it lasts, and are sent home if it is called off
  const partyRoof = props.party?.roof ?? null;
  const partyEnds = props.party?.endsAt ?? 0;
  const sceneNow = useRef(props.now ?? 0);
  useEffect(() => {
    sceneNow.current = props.now ?? 0;
  }, [props.now]);
  useEffect(() => {
    if (partyRoof === null) return;
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
      if (!document.hidden && guests() < 4) invite(2 + Math.floor(rand() * 2));
    }, 25_000);
    return () => {
      clearInterval(timer);
      commit(live.current.filter((party) => !party.guest));
    };
  }, [partyRoof, partyEnds, life, commit]);

  const sheets: Sheets = {
    people: art.people[light],
    props: art.props[light],
    wheels: art.wheels[light],
  };
  const street = parties.filter((party) => party.roof === null && !party.road);
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
                {here.map((party) => (
                  <PartyView key={party.id} party={party} sheets={sheets} onDone={onDone} />
                ))}
              </div>
            </div>
          )
        );
      })}
      {/* Nearest last, so they pass in front. */}
      {[...street]
        .sort((a, b) => a.y - b.y || a.id - b.id)
        .map((party) => (
          <PartyView key={party.id} party={party} sheets={sheets} onDone={onDone} />
        ))}
      {props.kerb}
      {road.map((party) => (
        <PartyView key={party.id} party={party} sheets={sheets} onDone={onDone} />
      ))}
    </div>
  );
}
