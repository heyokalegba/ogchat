import type { CSSProperties } from "react";
import { brooklynClock, type SkyView } from "@/lib/daylight";
import { overcast, shelter, type SeasonName, type Weather } from "@/lib/weather";
import { SCENES, SKY, type SceneId } from "./art";
import styles from "./backdrop.module.css";
import { roofPartyAt } from "./life";
import { SkyTraffic } from "./SkyTraffic";
import { StreetLife } from "./StreetLife";
import { Wear } from "./Wear";
import { WeatherLayer } from "./Weather";
import { WindowLife } from "./WindowLife";
import { WindowSwitches } from "./WindowSwitches";

/** Each scene keeps its own diary of rooftop barbecues. */
const PARTY_SALT: Record<SceneId, number> = { skyline: 11, brooklyn: 23 };
const minuteOfDay = (ms: number) => brooklynClock(ms).minutes;

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

export function Backdrop(props: {
  scene: SceneId;
  view: SkyView;
  /** The scene's time now, in milliseconds: what the timed events go by. */
  now: number;
  /** How old the street is, in days: how much of its wear and tear shows. */
  age?: number;
  /** The season the scene is drawn in, and the weather over it. */
  season?: SeasonName;
  weather?: Weather;
  people?: boolean;
  /** Frozen: nothing moves, nobody arrives. The light still follows the clock. */
  still?: boolean;
}) {
  const { scene, view, now, people = true, still = false } = props;
  const { season = "summer", weather = "clear" } = props;
  // A covered sky hides the sun, the moon and the stars, and keeps people in.
  const grey = overcast(weather);
  const indoors = shelter(weather);
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

  /** Scene pixels as a CSS length. */
  const u = (n: number) => `calc(var(--u) * ${n})`;
  const lanes = (front: boolean) =>
    config.lanes
      .filter((lane) => lane.front === front)
      .map((lane) => {
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
                  <div
                    key={vehicle.x}
                    className={styles.vehicle}
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
  // Nobody barbecues in the rain or the snow.
  const party =
    event && indoors < 0.3 ? { roof: hosts[event.roof]!.index, endsAt: event.endsAt } : null;
  const beaconGlow = Math.min(1, night * 1.8);

  const parked = art.parked && (
    <Blend className={styles.layer} sources={art.parked[season]} view={view} />
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

        <div
          className={styles.clouds}
          style={{
            top: config.clouds.far.top,
            height: config.clouds.far.height,
            animationDuration: `${config.clouds.far.seconds}s`,
            opacity: 0.9,
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

        <SkyTraffic light={light} night={night} still={still || weather === "storm"} />

        <Blend className={styles.layer} sources={art.city[season]} view={view} />
        {art.glints && (
          <div className={styles.switches} style={{ opacity: switching }}>
            <div className={`${styles.layer} ${styles.glintsA}`} style={image(art.glints[0])} />
            <div className={`${styles.layer} ${styles.glintsB}`} style={image(art.glints[1])} />
          </div>
        )}
        <WindowSwitches windows={config.switches.back} strength={switching} still={still} />
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

        <Blend className={styles.layer} sources={art.rooftops[season]} view={view} />
        <Wear scene={scene} days={props.age ?? 0} night={night} />
        <WindowSwitches windows={config.switches.front} strength={switching} still={still} />
        {glow(art.glow.front, "Front")}
        {/* Cars at the kerb stand between the pavement and us; cyclists pass outside them. */}
        <WindowLife scene={scene} light={light} still={still} />
        {people ? (
          <StreetLife
            scene={scene}
            light={light}
            night={night}
            shelter={indoors}
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
          weather={weather}
          grey={grey}
          leaves={season === "autumn" && scene === "brooklyn"}
          night={night}
        />
      </div>
    </div>
  );
}
