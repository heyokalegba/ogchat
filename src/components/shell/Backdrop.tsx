import scenes from "./art/scenes.json";
import styles from "./backdrop.module.css";

/**
 * The living scene behind the interface.
 *
 * There are two, chosen in the top bar:
 *   skyline    the harbour by day, under a hazy sky
 *   brooklyn   a brownstone block at dusk, Prospect Park behind it
 *
 * Each is a stack of small pixel-art layers drawn by scripts/make-art.mjs
 * (under 80 KB a scene; only the one on show is downloaded) that CSS slides
 * and toggles: clouds drift at two speeds, chimneys smoke, windows switch on
 * and off, traffic passes, a beacon blinks, a flock crosses now and then.
 * There is no video, no canvas and no script running, and it all stands still
 * for people who ask for reduced motion.
 *
 * Where the moving pieces sit comes from art/scenes.json, written by the
 * same script, as percentages of the 640x360 scene.
 */

export type SceneId = keyof typeof scenes;

export const SCENES = (Object.keys(scenes) as SceneId[]).map((id) => ({
  id,
  label: scenes[id].label,
  hint: scenes[id].hint,
}));

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && value in scenes;
}

export function Backdrop({ scene }: { scene: SceneId }) {
  const config = scenes[scene];

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
            opacity: stack.opacity,
          }}
        >
          <div className={styles.smokeStrip} style={{ animationDelay: stack.delay }} />
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
              // The strip image holds every lane as a row; show this one.
              backgroundSize: `50% ${lane.rows * 100}%`,
              backgroundPosition: `0 ${lane.rows > 1 ? (lane.row / (lane.rows - 1)) * 100 : 0}%`,
              animationDuration: `${lane.seconds}s`,
              animationTimingFunction: `steps(${lane.steps})`,
            }}
          />
        </div>
      ));

  return (
    <div
      className={`${styles.backdrop} ${styles[scene]}`}
      style={{ background: config.sky }}
      aria-hidden="true"
    >
      {/* Keyed by scene, so switching starts the new one's motion from the top. */}
      <div key={scene} className={styles.scene}>
        <div className={`${styles.layer} ${styles.sky}`} />
        <div
          className={`${styles.clouds} ${styles.cloudsFar}`}
          style={{
            top: config.clouds.far.top,
            height: config.clouds.far.height,
            animationDuration: `${config.clouds.far.seconds}s`,
          }}
        />
        <div
          className={`${styles.clouds} ${styles.cloudsNear}`}
          style={{
            top: config.clouds.near.top,
            height: config.clouds.near.height,
            animationDuration: `${config.clouds.near.seconds}s`,
          }}
        />
        <div className={styles.flight} style={{ animationDuration: `${config.birds.seconds}s` }}>
          <div className={styles.birds} style={{ top: config.birds.top }}>
            <div className={styles.birdsStrip} />
          </div>
        </div>
        <div className={`${styles.layer} ${styles.city}`} />
        <div className={`${styles.layer} ${styles.lightsA}`} />
        <div className={`${styles.layer} ${styles.lightsC}`} />
        {smoke(false)}
        {lanes(false)}
        {config.beacons.map((beacon) => (
          <span
            key={`${beacon.left}-${beacon.top}`}
            className={styles.beacon}
            style={{ left: beacon.left, top: beacon.top, animationDelay: beacon.delay }}
          />
        ))}
        <div className={`${styles.layer} ${styles.rooftops}`} />
        <div className={`${styles.layer} ${styles.lightsB}`} />
        {smoke(true)}
        {lanes(true)}
      </div>
    </div>
  );
}
