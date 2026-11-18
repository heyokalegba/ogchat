import type { CSSProperties } from "react";
import type { SkyView } from "@/lib/daylight";
import { SCENES, SKY, type SceneId } from "./art";
import styles from "./backdrop.module.css";
import { SkyTraffic } from "./SkyTraffic";
import { StreetLife } from "./StreetLife";

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

export function Backdrop(props: { scene: SceneId; view: SkyView; people?: boolean }) {
  const { scene, view, people = true } = props;
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

  const lanes = (front: boolean) =>
    config.lanes
      .filter((lane) => lane.front === front)
      .map((lane) => (
        <div
          key={`${lane.top}-${lane.row}`}
          className={styles.lane}
          style={{ left: lane.left, top: lane.top, width: lane.width, height: lane.height }}
        >
          <div
            className={`${styles.laneStrip} ${lane.reverse ? styles.laneReverse : ""}`}
            style={{
              ...image(art.traffic[light]),
              // The strip holds its picture twice, and the picture is \`span\` lanes long.
              width: `${lane.span * 200}%`,
              // The strip image holds every lane as a row; show this one.
              backgroundSize: `50% ${lane.rows * 100}%`,
              backgroundPosition: `0 ${lane.rows > 1 ? (lane.row / (lane.rows - 1)) * 100 : 0}%`,
              animationDuration: `${lane.seconds}s`,
              animationTimingFunction: `steps(${lane.steps})`,
            }}
          />
        </div>
      ));

  /** Halos round the lights: two layers per depth, each breathing on its own rhythm. */
  const glow = (sources: readonly [string, string], phase: "Back" | "Front") =>
    night > 0.03 && (
      <div className={styles.glowGroup} style={{ opacity: night }}>
        <div className={`${styles.layer} ${styles[`glow${phase}A`]}`} style={image(sources[0])} />
        <div className={`${styles.layer} ${styles[`glow${phase}B`]}`} style={image(sources[1])} />
      </div>
    );

  const parked = art.parked && <Blend className={styles.layer} sources={art.parked} view={view} />;

  return (
    <div className={styles.backdrop} aria-hidden="true">
      {/* Keyed by scene, so switching starts the new one's motion from the top. */}
      <div key={scene} className={styles.scene}>
        {/* The glow on the horizon is drawn on the sunset side; flip it for the morning. */}
        <div className={`${styles.skyBox} ${blend.morning ? styles.mirrored : ""}`}>
          <Blend className={styles.layer} sources={SKY.sky} view={view} />
        </div>

        {night > 0.03 && (
          <div className={styles.stars} style={{ opacity: night }}>
            <div className={styles.starLayer} style={image(SKY.stars)} />
            <div
              className={`${styles.starLayer} ${styles.twinkle}`}
              style={image(SKY.starsTwinkle)}
            />
          </div>
        )}

        {sun.up && (
          <div className={styles.orb} style={{ left: `${sun.x}%`, top: `${sun.y}%` }}>
            <div className={styles.sun} style={{ ...image(SKY.sun), opacity: 1 - sun.low }} />
            <div className={styles.sunLow} style={{ ...image(SKY.sunLow), opacity: sun.low }} />
          </div>
        )}
        {moon.up && moon.opacity > 0 && (
          <div
            className={styles.orb}
            style={{ left: `${moon.x}%`, top: `${moon.y}%`, opacity: moon.opacity }}
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

        {night < 0.75 && (
          <div className={styles.flight} style={{ animationDuration: `${config.birds.seconds}s` }}>
            <div className={styles.birds} style={{ top: config.birds.top }}>
              <div className={styles.birdsStrip} style={image(SKY.birds)} />
            </div>
          </div>
        )}

        <SkyTraffic light={light} />

        <Blend className={styles.layer} sources={art.city} view={view} />
        <div
          className={`${styles.layer} ${styles.lightsA}`}
          style={{ ...image(art.lights.a), opacity: switching }}
        />
        <div
          className={`${styles.layer} ${styles.lightsC}`}
          style={{ ...image(art.lights.c), opacity: switching }}
        />
        {glow(art.glow.back, "Back")}
        {smoke(false)}
        {lanes(false)}
        {config.beacons.map((beacon) => (
          <span
            key={`${beacon.left}-${beacon.top}`}
            className={styles.beacon}
            style={{ left: beacon.left, top: beacon.top, animationDelay: beacon.delay }}
          />
        ))}

        <Blend className={styles.layer} sources={art.rooftops} view={view} />
        <div
          className={`${styles.layer} ${styles.lightsB}`}
          style={{ ...image(art.lights.b), opacity: switching }}
        />
        {glow(art.glow.front, "Front")}
        {/* Cars at the kerb stand between the pavement and us; cyclists pass outside them. */}
        {people ? <StreetLife scene={scene} light={light} night={night} kerb={parked} /> : parked}
        {smoke(true)}
        {lanes(true)}
      </div>
    </div>
  );
}
