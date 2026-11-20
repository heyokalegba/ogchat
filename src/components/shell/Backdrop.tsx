import { useRef, type CSSProperties } from "react";
import { darkness } from "@/lib/citylights";
import { brooklynClock, brooklynDay, type SkyView } from "@/lib/daylight";
import {
  calendarOf,
  fireworksAt,
  kerbClear,
  mealtime,
  shopOpen,
  umbrellasFor,
  wardrobeFor,
  type Wind,
} from "@/lib/nycday";
import {
  conditionsFor,
  greyOf,
  shelterOf,
  USUAL_TEMP_C,
  type Conditions,
  type SeasonName,
} from "@/lib/weather";
import { SCENES, SKY, type SceneId } from "./art";
import styles from "./backdrop.module.css";
import { bustleAt, lateAt, pastBedtime, placeOf, roofPartyAt, trafficAt } from "./life";
import { SkyTraffic } from "./SkyTraffic";
import { Fireworks } from "./Fireworks";
import { StreetLife } from "./StreetLife";
import { Vehicle } from "./Vehicle";
import { Wear } from "./Wear";
import { WeatherLayer } from "./Weather";
import { WindowLife } from "./WindowLife";
import { WINDOWS } from "./art/windows";
import { CityLights } from "./CityLights";

/** Each scene keeps its own diary of rooftop barbecues. */
const PARTY_SALT: Record<SceneId, number> = { skyline: 11, brooklyn: 23 };
const minuteOfDay = (ms: number) => brooklynClock(ms).minutes;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The living scene behind the interface.
 *
 * Two scenes (the harbour skyline, a Brooklyn brownstone block), each drawn
 * in four lights: day, golden hour, dusk and night. `view` says what the sky
 * over Brooklyn looks like at the scene's current moment, and this crossfades
 * the pictures to match: the sun and moon ride across, stars come out, windows
 * and lamps come on and their halos breathe.
 *
 * It is all small pixel-art layers (scripts/make-art.mjs) that CSS slides and
 * fades. There is no video, no canvas and no animation loop in script; the
 * only script is the clock that hands in a new `view` a few times a minute,
 * and the once-a-second decision about who walks into the picture next
 * (StreetLife). Everything stands still for people who ask for reduced motion.
 */

const image = (src: string): CSSProperties => ({ backgroundImage: `url(${src})` });

/** A picture that exists in every light: the `from` state, with `to` faded in over it. */
function Blend(props: {
  className: string | undefined;
  sources: Record<string, string>;
  view: SkyView;
}) {
  const { from, to, mix } = props.view.blend;
  return (
    <>
      <div className={props.className} style={image(props.sources[from]!)} />
      {mix > 0.004 && to !== from && (
        <div className={props.className} style={{ ...image(props.sources[to]!), opacity: mix }} />
      )}
    </>
  );
}

/** What the scene shows when it is told nothing about the weather. */
const FAIR = conditionsFor("clear");

export function Backdrop(props: {
  scene: SceneId;
  view: SkyView;
  /** The scene's time now, in milliseconds: what the timed events go by. */
  now: number;
  /** How old the street is, in days: how much of its wear and tear shows. */
  age?: number;
  /** The season, whether snow is lying (winter drawn white), and the weather over it all. */
  season?: SeasonName;
  snowy?: boolean;
  conditions?: Conditions;
  /** The temperature in °C, when New York's is known. Otherwise the season's usual is assumed. */
  tempC?: number | null;
  /** The wind, and how deep the snow is lying in metres, when New York's are known. */
  wind?: Wind;
  snowDepthM?: number | null;
  /** Told about each firework as it goes off, and each siren, for whoever makes the noise. */
  onBang?: () => void;
  onSiren?: () => void;
  people?: boolean;
  /** Frozen: nothing moves, nobody arrives. The light still follows the clock. */
  still?: boolean;
}) {
  const { scene, view, now, people = true, still = false } = props;
  const { season = "summer", snowy = false, conditions = FAIR } = props;
  /** When it last rained, by the scene's clock: the ground stays wet for a while after. */
  const lastRain = useRef<number | null>(null);
  const weather = conditions.kind;
  // The pictures to show: the season's, or the bare trees under snow.
  const ground = snowy ? "snow" : season;
  // A covered sky hides the sun, the moon and the stars, and keeps people in.
  const grey = greyOf(conditions);
  const indoors = shelterOf(conditions);
  const art = SCENES[scene];
  const config = art.config;
  const { blend, sun, moon } = view;
  const night = blend.night;
  // People are drawn in one light at a time: whichever the scene is nearer to.
  const light = blend.mix > 0.5 ? blend.to : blend.from;
  // Windows that switch on and off are faint by day and full at night.
  const switching = 0.3 + 0.7 * night;

  const smoke = (front: boolean) =>
    config.smoke
      .filter((stack) => stack.front === front)
      .map((stack) => (
        <div
          key={`${stack.left}-${stack.top}`}
          className={styles.smoke}
          style={{
            left: stack.left,
            top: stack.top,
            width: stack.width,
            height: stack.height,
            opacity: stack.opacity * (1 - night * 0.45),
          }}
        >
          <div
            className={styles.smokeStrip}
            style={{ ...image(SKY.smoke), animationDelay: stack.delay }}
          />
        </div>
      ));

  // The hour, as the street lives by it.
  const clock = brooklynClock(now);
  const hour = clock.minutes / 60;
  const weekday = WEEKDAYS.indexOf(clock.weekday);
  // How much traffic is about, and how many windows have gone dark for the night.
  const traffic = trafficAt(hour, weekday, indoors);
  const late = lateAt(hour, weekday);
  // How dark it is out: what decides whether a lit window shows at all.
  const dark = darkness(view.elevation, grey);
  // Every vehicle's place in the order they take to the road: shuffled once, the same
  // every time, and spread evenly, so a tenth of the traffic is a tenth of the vehicles.
  const all = config.lanes.flatMap((lane, index) =>
    lane.vehicles.map((vehicle) => ({
      key: `${index}:${vehicle.x}`,
      at: placeOf(index, vehicle.x),
    })),
  );
  all.sort((a, b) => a.at - b.at);
  const places = new Map(all.map((one, rank) => [one.key, (rank + 0.5) / all.length]));

  /** Scene pixels as a CSS length. */
  const u = (n: number) => `calc(var(--u) * ${n})`;
  const lanes = (front: boolean) =>
    config.lanes
      .map((lane, index) => ({ lane, index }))
      .filter(({ lane }) => lane.front === front)
      .map(({ lane, index }) => {
        const row = `${lane.rows > 1 ? (lane.row / (lane.rows - 1)) * 100 : 0}%`;
        return (
          <div
            key={`${lane.top}-${lane.row}`}
            className={styles.lane}
            style={{ left: lane.left, top: lane.top, width: lane.width, height: lane.height }}
          >
            {lane.vehicles.length === 0 ? (
              // A lane that is only lights (the bridge): one short strip sliding past.
              <div
                className={`${styles.laneStrip} ${lane.reverse ? styles.laneReverse : ""}`}
                style={{
                  ...image(art.traffic[light]),
                  backgroundSize: `50% ${lane.rows * 100}%`,
                  backgroundPosition: `0 ${row}`,
                  animationDuration: `${lane.seconds}s`,
                  animationTimingFunction: `steps(${lane.steps})`,
                  // Lights on a far road thin out as the traffic does.
                  opacity: 0.25 + 0.75 * traffic,
                }}
              />
            ) : (
              // Each vehicle is a small piece of its own, cut from the lane's sheet and
              // driven along the lane. Small pieces are cheap to keep and quick to redraw,
              // where one strip several screens long was neither.
              lane.vehicles.map((vehicle) => {
                const length = lane.steps;
                // Where in its lap this vehicle is at the start, so they keep their spacing.
                const lap = lane.reverse
                  ? (vehicle.x + vehicle.w) / length
                  : (length - vehicle.w - vehicle.x) / length;
                return (
                  <Vehicle
                    key={vehicle.x}
                    place={places.get(`${index}:${vehicle.x}`) ?? 0}
                    level={traffic}
                    style={
                      {
                        ...image(art.traffic[light]),
                        width: u(vehicle.w),
                        backgroundSize: `${u(length)} ${lane.rows * 100}%`,
                        backgroundPosition: `${u(-vehicle.x)} ${row}`,
                        animationDuration: `${lane.seconds}s`,
                        animationDelay: `${(-lap * lane.seconds).toFixed(2)}s`,
                        animationTimingFunction: `steps(${length})`,
                        "--from": lane.reverse ? -vehicle.w : length - vehicle.w,
                        "--to": lane.reverse ? length - vehicle.w : -vehicle.w,
                      } as CSSProperties
                    }
                  />
                );
              })
            )}
          </div>
        );
      });

  /** Halos round the lights: two layers per depth, each breathing on its own rhythm. */
  const glow = (sources: readonly [string, string], phase: "Back" | "Front") =>
    night > 0.03 && (
      <div className={styles.glowGroup} style={{ opacity: night }}>
        <div className={`${styles.layer} ${styles[`glow${phase}A`]}`} style={image(sources[0])} />
        <div className={`${styles.layer} ${styles[`glow${phase}B`]}`} style={image(sources[1])} />
      </div>
    );

  // Is anybody having a barbecue on a roof just now? Only roofs with room for one are asked.
  const hosts = config.life.roofs
    .map((roof, index) => ({ roof, index }))
    .filter(({ roof }) => roof.w >= 34);
  const event = roofPartyAt(now, PARTY_SALT[scene], hosts.length, minuteOfDay);
  // How the street should be just now, the way New York does it: by the hour and the
  // day of the week, by the cold and the heat, and by the weather.
  const tempC = props.tempC ?? USUAL_TEMP_C[season];
  const bustle = bustleAt(hour, weekday, tempC, indoors);
  const tooColdToSit = tempC < 9 || snowy || indoors >= 0.3;
  // Nobody barbecues in the rain or the snow, or in a coat.
  const party =
    event && indoors < 0.3 && tempC >= 12
      ? { roof: hosts[event.roof]!.index, endsAt: event.endsAt }
      : null;
  const beaconGlow = Math.min(1, night * 1.8);

  // The day on the block: what the calendar and the clock have on.
  const today = brooklynDay(now);
  const occasion = calendarOf(today);
  const raining = weather === "rain" || weather === "storm";
  const falling = raining || weather === "snow";
  // Wet ground: while it rains, and for the better part of an hour after it stops.
  if (raining) lastRain.current = now;
  const drying =
    lastRain.current === null ? 0 : 1 - Math.abs(now - lastRain.current) / (45 * 60_000);
  const wetness = snowy
    ? 0
    : raining
      ? conditions.force === "light"
        ? 0.75
        : 1
      : Math.max(0, drying) * 0.8;
  // Alternate side parking: on sweeping mornings the kerb is empty.
  const parked = art.parked && !kerbClear(today) && (
    <Blend className={styles.layer} sources={art.parked[ground]} view={view} />
  );

  return (
    <div className={`${styles.backdrop} ${still ? styles.still : ""}`} aria-hidden="true">
      {/* Keyed by scene, so switching starts the new one's motion from the top. */}
      <div key={scene} className={styles.scene}>
        {/* The glow on the horizon is drawn on the sunset side; flip it for the morning. */}
        <div className={`${styles.skyBox} ${blend.morning ? styles.mirrored : ""}`}>
          <Blend className={styles.layer} sources={SKY.sky} view={view} />
        </div>

        {night > 0.03 && (
          <div className={styles.stars} style={{ opacity: night * (1 - grey) }}>
            <div className={styles.starLayer} style={image(SKY.stars)} />
            <div
              className={`${styles.starLayer} ${styles.twinkle}`}
              style={image(SKY.starsTwinkle)}
            />
          </div>
        )}

        {sun.up && (
          <div
            className={styles.orb}
            style={{ left: `${sun.x}%`, top: `${sun.y}%`, opacity: 1 - grey }}
          >
            <div className={styles.sun} style={{ ...image(SKY.sun), opacity: 1 - sun.low }} />
            <div className={styles.sunLow} style={{ ...image(SKY.sunLow), opacity: sun.low }} />
          </div>
        )}
        {moon.up && moon.opacity > 0 && (
          <div
            className={styles.orb}
            style={{ left: `${moon.x}%`, top: `${moon.y}%`, opacity: moon.opacity * (1 - grey) }}
          >
            <div className={styles.moon}>
              <div
                className={styles.moonStrip}
                style={{ ...image(SKY.moon), transform: `translateX(${-moon.frame * 12.5}%)` }}
              />
            </div>
          </div>
        )}

        {/*
          A covered sky is grey, and that grey belongs to the sky alone: it sits
          behind the city, so the street stays as sharp as on a clear day.
        */}
        {grey > 0.05 && (
          <div
            className={styles.overcast}
            style={{
              opacity: Math.min(0.85, grey * 0.9),
              background: night > 0.5 ? "#1b202c" : blend.from === "day" ? "#8b939e" : "#7d7f8c",
            }}
          />
        )}

        <div
          className={styles.clouds}
          style={{
            top: config.clouds.far.top,
            height: config.clouds.far.height,
            animationDuration: `${config.clouds.far.seconds}s`,
            // As much cloud as the sky has: thin on a clear day, full under a covered one.
            opacity: 0.3 + 0.6 * conditions.cover,
          }}
        >
          <Blend className={styles.cloudLayer} sources={SKY.cloudsFar} view={view} />
        </div>
        <div
          className={`${styles.clouds} ${styles.cloudsNear}`}
          style={{
            top: config.clouds.near.top,
            height: config.clouds.near.height,
            animationDuration: `${config.clouds.near.seconds}s`,
            opacity: 0.2 + 0.8 * conditions.cover,
          }}
        >
          <Blend className={styles.cloudLayer} sources={SKY.cloudsNear} view={view} />
        </div>

        {night < 0.75 && weather !== "storm" && (
          <div className={styles.flight} style={{ animationDuration: `${config.birds.seconds}s` }}>
            <div className={styles.birds} style={{ top: config.birds.top }}>
              <div className={styles.birdsStrip} style={image(SKY.birds)} />
            </div>
          </div>
        )}

        <Fireworks active={fireworksAt(today)} still={still} onBang={props.onBang} />
        <SkyTraffic light={light} night={night} still={still || weather === "storm"} late={late} />

        <Blend className={styles.layer} sources={art.city[ground]} view={view} />
        <CityLights
          windows={WINDOWS[scene]!.city}
          src={art.homes.city[ground]}
          now={now}
          dark={dark}
          salt={1}
        />
        {art.glints && (
          <div className={styles.switches} style={{ opacity: switching }}>
            <div className={`${styles.layer} ${styles.glintsA}`} style={image(art.glints[0])} />
            <div className={`${styles.layer} ${styles.glintsB}`} style={image(art.glints[1])} />
          </div>
        )}
        {glow(art.glow.back, "Back")}
        {smoke(false)}
        {lanes(false)}
        {/* Warning lights on the tall buildings: lit as the light goes, blinking out of step. */}
        {beaconGlow > 0.04 && (
          <div className={styles.beacons} style={{ opacity: beaconGlow }}>
            {config.beacons.map((beacon, index) => (
              <span
                key={`${beacon.left}-${beacon.top}`}
                className={styles.beacon}
                style={{
                  left: beacon.left,
                  top: beacon.top,
                  animationDelay: beacon.delay,
                  animationDuration: `${2.1 + (index % 4) * 0.45}s`,
                }}
              />
            ))}
          </div>
        )}

        <Blend className={styles.layer} sources={art.rooftops[ground]} view={view} />
        <CityLights
          windows={WINDOWS[scene]!.rooftops}
          src={art.homes.rooftops[ground]}
          now={now}
          dark={dark}
          salt={2}
        />
        <Wear scene={scene} days={props.age ?? 0} night={night} />
        {/* Shops with their shutters down, out of hours. */}
        {Object.entries(art.shut).map(
          ([shop, sources]) =>
            !shopOpen(shop, hour, weekday) && (
              <Blend key={shop} className={styles.layer} sources={sources} view={view} />
            ),
        )}
        {/* Deep snow: the banks the ploughs leave, once there is more than a dusting. */}
        {art.banks && snowy && (props.snowDepthM ?? 0) >= 0.1 && (
          <Blend className={styles.layer} sources={art.banks} view={view} />
        )}
        {art.wet && wetness > 0.02 && (
          <div className={styles.layer} style={{ opacity: wetness }}>
            <Blend className={styles.layer} sources={art.wet} view={view} />
          </div>
        )}
        {art.xmas && occasion.christmas && (
          <div className={styles.layer} style={{ opacity: 0.3 + 0.7 * night }}>
            <div className={`${styles.layer} ${styles.xmasA}`} style={image(art.xmas[0])} />
            <div className={`${styles.layer} ${styles.xmasB}`} style={image(art.xmas[1])} />
          </div>
        )}
        {glow(art.glow.front, "Front")}
        {/* Cars at the kerb stand between the pavement and us; cyclists pass outside them. */}
        {/* Nobody is seen against a window until it is dark enough for the room to be lit. */}
        <WindowLife scene={scene} light={light} still={still || dark < 0.55} />
        {people ? (
          <StreetLife
            scene={scene}
            light={light}
            night={night}
            bustle={bustle}
            late={pastBedtime(hour)}
            noSitting={tooColdToSit}
            wardrobe={wardrobeFor(tempC)}
            umbrellas={umbrellasFor(weather, conditions.force)}
            hungry={mealtime(hour)}
            onSiren={props.onSiren}
            tempC={tempC}
            wet={falling}
            kerb={parked}
            party={party}
            now={now}
            still={still}
          />
        ) : (
          parked
        )}
        {smoke(true)}
        {lanes(true)}
        <WeatherLayer
          conditions={conditions}
          grey={grey}
          leaves={season === "autumn" && !snowy && scene === "brooklyn"}
          night={night}
          wind={props.wind}
        />
      </div>
    </div>
  );
}
