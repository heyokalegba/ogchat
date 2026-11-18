import styles from "./backdrop.module.css";

/**
 * The living city behind the interface.
 *
 * It is a stack of small pixel-art layers (about 70 KB in total, drawn by
 * scripts/make-art.mjs) that CSS slides and toggles: clouds drift at two
 * speeds, smoke rises from the stacks, windows and water glints switch on and
 * off, lights cross the bridge, a flock passes now and then. There is no
 * video, no canvas and no script running; the browser's compositor does the
 * work, and it all stops for people who ask for reduced motion.
 *
 * Positions are percentages of the 640x360 scene, as printed by `npm run art`.
 */

const SMOKE = [
  { left: "25.625%", top: "30.278%", delay: "0s" },
  { left: "28.281%", top: "35.833%", delay: "-1.3s" },
];

const BEACONS = [
  { left: "18.438%", top: "22.778%", delay: "0s" },
  { left: "65%", top: "54.167%", delay: "-0.8s" },
  { left: "91.563%", top: "54.167%", delay: "-1.5s" },
];

export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.scene}>
        <div className={`${styles.layer} ${styles.sky}`} />
        <div className={`${styles.clouds} ${styles.cloudsFar}`} />
        <div className={`${styles.clouds} ${styles.cloudsNear}`} />
        <div className={styles.flight}>
          <div className={styles.birds}>
            <div className={styles.birdsStrip} />
          </div>
        </div>
        <div className={`${styles.layer} ${styles.skyline}`} />
        <div className={`${styles.layer} ${styles.lightsA}`} />
        <div className={`${styles.layer} ${styles.lightsC}`} />
        {SMOKE.map((stack) => (
          <div
            key={stack.left}
            className={styles.smoke}
            style={{ left: stack.left, top: stack.top }}
          >
            <div className={styles.smokeStrip} style={{ animationDelay: stack.delay }} />
          </div>
        ))}
        <div className={styles.traffic}>
          <div className={`${styles.lane} ${styles.laneIn}`}>
            <div className={styles.laneStrip} />
          </div>
          <div className={`${styles.lane} ${styles.laneOut}`}>
            <div className={styles.laneStrip} />
          </div>
        </div>
        {BEACONS.map((beacon) => (
          <span
            key={beacon.left}
            className={styles.beacon}
            style={{ left: beacon.left, top: beacon.top, animationDelay: beacon.delay }}
          />
        ))}
        <div className={`${styles.layer} ${styles.rooftops}`} />
        <div className={`${styles.layer} ${styles.lightsB}`} />
      </div>
    </div>
  );
}
