"use client";

import { useEffect, useRef } from "react";
import { describeOffset, formatMinutes, type WallClock } from "@/lib/daylight";
import { CloseIcon } from "../chat/icons";
import { SCENES, type SceneId } from "./art";
import { DEFAULT_LOOK, TEXT_SIZE, TEXT_SWATCHES, type Look } from "./look";
import styles from "./shell.module.css";

export interface LookPanelProps {
  look: Look;
  /** What the clock in the scene reads right now. */
  clock: WallClock;
  onChange: (patch: Partial<Look>) => void;
  /** Move the scene's clock to this many minutes past midnight. It keeps running from there. */
  onSetTime: (minutes: number) => void;
  onSnapToNow: () => void;
  onClose: () => void;
}

/**
 * The look panel: scene, time of day, wall lightness, text size and colour.
 * Everything applies as you move it and is remembered in this browser.
 *
 * There is no way to stop the clock, on purpose. Dragging the time sets it,
 * and it runs on from wherever you leave it; "now" returns it to real time.
 */
export function LookPanel({
  look,
  clock,
  onChange,
  onSetTime,
  onSnapToNow,
  onClose,
}: LookPanelProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target) || target.closest("[aria-haspopup='dialog']")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const shifted = look.clockOffsetMs !== 0;
  const custom = !TEXT_SWATCHES.some((swatch) => swatch.value === look.textColor);
  const changed =
    look.wall !== DEFAULT_LOOK.wall ||
    look.textSize !== DEFAULT_LOOK.textSize ||
    look.textColor !== DEFAULT_LOOK.textColor;

  return (
    <div ref={panel} className={styles.look} role="dialog" aria-label="Look">
      <div className={styles.lookHead}>
        <h2 className={styles.lookTitle}>look</h2>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-scene">
            scene
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-scene">
            {(Object.keys(SCENES) as SceneId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.sceneButton} ${id === look.scene ? styles.sceneActive : ""}`}
                aria-pressed={id === look.scene}
                onClick={() => onChange({ scene: id })}
              >
                {SCENES[id].config.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-time">
            time in brooklyn
          </label>
          <button
            type="button"
            className={styles.lookAction}
            onClick={onSnapToNow}
            disabled={!shifted}
          >
            now
          </button>
        </div>
        <div className={styles.lookValue}>
          {clock.label}
          <span className={styles.lookAside}>{clock.weekday}</span>
        </div>
        <input
          id="ogchat-time"
          className={styles.slider}
          type="range"
          min={0}
          max={1439}
          step={5}
          value={clock.minutes}
          aria-valuetext={formatMinutes(clock.minutes)}
          onChange={(event) => onSetTime(Number(event.target.value))}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>12 am</span>
          <span>6 am</span>
          <span>noon</span>
          <span>6 pm</span>
          <span>12 am</span>
        </div>
        <p className={styles.lookNote}>
          {shifted
            ? `Set ${describeOffset(look.clockOffsetMs)} of real time.`
            : "Following the real time."}{" "}
          The clock never stops: it runs on from wherever you set it.
        </p>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-wall">
            wall
          </label>
          <span className={styles.lookAside}>
            {look.wall === 50 ? "as built" : look.wall < 50 ? "darker" : "lighter"}
          </span>
        </div>
        <input
          id="ogchat-wall"
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          step={1}
          value={look.wall}
          onChange={(event) => onChange({ wall: Number(event.target.value) })}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>dark</span>
          <span>light</span>
        </div>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-text-size">
            text size
          </label>
          <span className={styles.lookAside}>{look.textSize}%</span>
        </div>
        <input
          id="ogchat-text-size"
          className={styles.slider}
          type="range"
          min={TEXT_SIZE.min}
          max={TEXT_SIZE.max}
          step={TEXT_SIZE.step}
          value={look.textSize}
          onChange={(event) => onChange({ textSize: Number(event.target.value) })}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>small</span>
          <span>large</span>
        </div>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-text-color">
            text colour on the wall
          </span>
        </div>
        <div className={styles.swatches} role="group" aria-labelledby="ogchat-text-color">
          {TEXT_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              className={`${styles.swatch} ${swatch.value === look.textColor ? styles.swatchActive : ""}`}
              style={{ background: swatch.value }}
              aria-label={swatch.name}
              aria-pressed={swatch.value === look.textColor}
              title={swatch.name}
              onClick={() => onChange({ textColor: swatch.value })}
            />
          ))}
          <label
            className={`${styles.swatch} ${styles.swatchCustom} ${custom ? styles.swatchActive : ""}`}
            style={custom ? { background: look.textColor } : undefined}
            title="Pick any colour"
          >
            <input
              type="color"
              value={look.textColor}
              aria-label="Pick any colour"
              onChange={(event) => onChange({ textColor: event.target.value })}
            />
            {!custom && <span aria-hidden="true">+</span>}
          </label>
        </div>
      </section>

      <div className={styles.lookFoot}>
        <button
          type="button"
          className={styles.lookAction}
          disabled={!changed}
          onClick={() =>
            onChange({
              wall: DEFAULT_LOOK.wall,
              textSize: DEFAULT_LOOK.textSize,
              textColor: DEFAULT_LOOK.textColor,
            })
          }
        >
          reset wall and text
        </button>
      </div>
    </div>
  );
}
