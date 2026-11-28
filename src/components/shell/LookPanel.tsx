"use client";

import {
  describeReading,
  SEASON_NAMES,
  WEATHERS,
  type Conditions,
  type Reading,
  type SeasonName,
} from "@/lib/weather";
import { useEffect, useRef } from "react";
import { describeOffset, FIRST_DATE, formatMinutes, type WallClock } from "@/lib/daylight";
import { CloseIcon } from "../chat/icons";
import { SCENES, type SceneId } from "./art";
import { WEAR_YEARS } from "./art/wear";
import {
  activeTextColor,
  DEFAULT_LOOK,
  INPUT_SWATCHES,
  SCENE_STRENGTH,
  SIDEBAR_WIDTH,
  TEXT_SIZE,
  TEXT_SWATCHES,
  type Look,
} from "./look";
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
  /** The season and weather the scene is showing right now. */
  season: SeasonName;
  conditions: Conditions;
  /** The reading from New York behind that weather, when it is the real thing. */
  reading: Reading | null;
  /** Why there is no reading, when live weather was asked for and did not come. */
  weatherProblem: string | null;
  /** Today in Brooklyn, and the past day the scene is set to, if it is. Both "2025-01-06". */
  today: string;
  heldDate: string | null;
  /** How old the street is, in days, and a look ahead at its wear (in years; not remembered). */
  streetDays: number;
  peekYears: number;
  onPeek: (years: number) => void;
}

/** "10:15 am" from a reading's local time, "2026-11-19T10:15". */
function timeOf(reading: Reading): string {
  const [hour, minute] = reading.time.slice(11, 16).split(":").map(Number);
  return formatMinutes((hour || 0) * 60 + (minute || 0));
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
  season,
  conditions,
  reading,
  weatherProblem,
  today,
  heldDate,
  streetDays,
  peekYears,
  onPeek,
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
  // The colour picker edits whichever colour is in force: on the wall, or over the open scene.
  const textColor = activeTextColor(look);
  const setTextColor = (value: string) =>
    onChange(look.wallShown ? { textColor: value } : { textColorOpen: value });
  const custom = !TEXT_SWATCHES.some((swatch) => swatch.value === textColor);
  const customInput = !INPUT_SWATCHES.some((swatch) => swatch.value === look.inputColor);
  const changed =
    look.wallShown !== DEFAULT_LOOK.wallShown ||
    look.wall !== DEFAULT_LOOK.wall ||
    look.textSize !== DEFAULT_LOOK.textSize ||
    look.textColor !== DEFAULT_LOOK.textColor ||
    look.textColorOpen !== DEFAULT_LOOK.textColorOpen ||
    look.inputColor !== DEFAULT_LOOK.inputColor ||
    look.sidebarWidth !== DEFAULT_LOOK.sidebarWidth;

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
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-date">
            day
          </label>
          <span className={styles.lookDate}>
            {heldDate && (
              <button
                type="button"
                className={styles.lookAction}
                title="Back to today"
                onClick={() => onChange({ date: "" })}
              >
                today
              </button>
            )}
            <input
              id="ogchat-date"
              className={styles.lookSelect}
              type="date"
              min={FIRST_DATE}
              max={today}
              value={heldDate ?? today}
              title="Set the scene to any day since 1 January 2025: its season, its sun and moon, and the weather New York had"
              onChange={(event) => {
                const picked = event.target.value;
                if (!picked || picked >= today) onChange({ date: "" });
                else if (picked >= FIRST_DATE) onChange({ date: picked });
              }}
            />
          </span>
        </div>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-season">
            season
          </label>
          <select
            id="ogchat-season"
            className={styles.lookSelect}
            value={look.season}
            title="Follow the calendar in Brooklyn, or hold the scene to one season"
            onChange={(event) => onChange({ season: event.target.value as Look["season"] })}
          >
            <option value="auto">by the calendar ({season})</option>
            {SEASON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="snow">winter, snowed in</option>
          </select>
        </div>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-weather">
            weather
          </label>
          <select
            id="ogchat-weather"
            className={styles.lookSelect}
            value={look.weather}
            title="New York's real weather, made-up weather that asks nobody, or one kind held"
            onChange={(event) => onChange({ weather: event.target.value as Look["weather"] })}
          >
            <option value="live">{heldDate ? "New York, that day" : "New York, live"}</option>
            <option value="invented">made up (asks nobody)</option>
            {WEATHERS.map((name) => (
              <option key={name} value={name}>
                always {name}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.lookNote} role="status">
          {look.weather === "live"
            ? reading
              ? `${describeReading(reading)} · ${heldDate ? "at this hour that day" : `as of ${timeOf(reading)}`}. Weather data by Open-Meteo.com.`
              : weatherProblem
                ? `No word from the weather service (${weatherProblem.replace(/\.$/, "")}), so this ${conditions.kind} is made up. It will be asked again.`
                : "Asking for the weather…"
            : look.weather === "invented"
              ? `Made up by the clock: ${conditions.kind}. Nothing is asked of the weather service.`
              : `Held to ${conditions.kind}, whatever New York is doing.`}
        </p>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-wear">
            wear
          </label>
          <span className={styles.lookAside}>
            {peekYears > 0
              ? `as in ${peekYears} ${peekYears === 1 ? "year" : "years"}`
              : `${Math.floor(streetDays)} ${Math.floor(streetDays) === 1 ? "day" : "days"} old`}
          </span>
        </div>
        <input
          id="ogchat-wear"
          className={styles.slider}
          type="range"
          min={0}
          max={WEAR_YEARS}
          step={1}
          value={peekYears}
          title="The street wears at the speed a real one does. Drag to look ahead; it goes back when you reload."
          onChange={(event) => onPeek(Number(event.target.value))}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>as it is</span>
          <span>in {WEAR_YEARS} years</span>
        </div>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-people">
            people
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-people">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.people ? styles.sceneActive : ""}`}
              aria-pressed={look.people}
              title="A few people out walking, and now and then a group"
              onClick={() => onChange({ people: true })}
            >
              out
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.people ? "" : styles.sceneActive}`}
              aria-pressed={!look.people}
              title="Empty streets"
              onClick={() => onChange({ people: false })}
            >
              none
            </button>
          </div>
        </div>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-motion">
            motion
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-motion">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.still ? "" : styles.sceneActive}`}
              aria-pressed={!look.still}
              onClick={() => onChange({ still: false })}
            >
              live
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.still ? styles.sceneActive : ""}`}
              aria-pressed={look.still}
              title="Hold the scene still, like a picture, while you work. The light still follows the clock."
              onClick={() => onChange({ still: true })}
            >
              frozen
            </button>
          </div>
        </div>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-sound">
            sound
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-sound">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.sound ? "" : styles.sceneActive}`}
              aria-pressed={!look.sound}
              onClick={() => onChange({ sound: false })}
            >
              off
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.sound ? styles.sceneActive : ""}`}
              aria-pressed={look.sound}
              title="The street, heard: traffic by the hour, rain, wind, birds in the morning, a siren a long way off. Made on the spot; nothing is played back."
              onClick={() => onChange({ sound: true })}
            >
              on
            </button>
          </div>
        </div>
        {look.sound && (
          <>
            <input
              id="ogchat-volume"
              className={styles.slider}
              type="range"
              min={0}
              max={100}
              step={5}
              value={look.volume}
              aria-label="Volume"
              onChange={(event) => onChange({ volume: Number(event.target.value) })}
            />
            <div className={styles.ticks} aria-hidden="true">
              <span>quiet</span>
              <span>loud</span>
            </div>
          </>
        )}
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-scene-strength">
            strength
          </label>
          <span className={styles.lookAside}>
            {look.sceneStrength === 100 ? "full" : `${look.sceneStrength}%`}
          </span>
        </div>
        <input
          id="ogchat-scene-strength"
          className={styles.slider}
          type="range"
          min={SCENE_STRENGTH.min}
          max={SCENE_STRENGTH.max}
          step={SCENE_STRENGTH.step}
          value={look.sceneStrength}
          title="Fade the scene back into the dark so text over it is easier to read"
          onChange={(event) => onChange({ sceneStrength: Number(event.target.value) })}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>faint</span>
          <span>full</span>
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
          <span className={styles.lookLabel} id="ogchat-plain">
            page
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-plain">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.plain ? "" : styles.sceneActive}`}
              aria-pressed={!look.plain}
              onClick={() => onChange({ plain: false })}
            >
              scene
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.plain ? styles.sceneActive : ""}`}
              aria-pressed={look.plain}
              title="Black text on white, with nothing behind it: for focused work"
              onClick={() => onChange({ plain: true, chatShown: true })}
            >
              plain
            </button>
          </div>
        </div>
        <p className={styles.lookNote}>
          Plain is black text on a white page. Text size and sidebar width still apply.
        </p>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-claude-page">
            claude chats
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-claude-page">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.claudePage === "formal" ? styles.sceneActive : ""}`}
              aria-pressed={look.claudePage === "formal"}
              title="White text on a black page for chats on Claude and Claude Code"
              onClick={() => onChange({ claudePage: "formal" })}
            >
              formal
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.claudePage === "same" ? styles.sceneActive : ""}`}
              aria-pressed={look.claudePage === "same"}
              title="Show chats on Claude on the same page as every other chat"
              onClick={() => onChange({ claudePage: "same" })}
            >
              like the rest
            </button>
          </div>
        </div>
        <p className={styles.lookNote}>
          Formal is white text on a black page. A chat on Claude or Claude Code is shown that way,
          so it is told apart at a glance from a chat on any other model.
        </p>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-wall-shown">
            wall
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-wall-shown">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.wallShown ? styles.sceneActive : ""}`}
              aria-pressed={look.wallShown}
              onClick={() => onChange({ wallShown: true })}
            >
              brick
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.wallShown ? "" : styles.sceneActive}`}
              aria-pressed={!look.wallShown}
              title="Take the wall away and let the chat float over the scene"
              onClick={() => onChange({ wallShown: false })}
            >
              none
            </button>
          </div>
        </div>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-wall">
            lightness
          </label>
          <span className={styles.lookAside}>
            {!look.wallShown
              ? "no wall"
              : look.wall === 50
                ? "as built"
                : look.wall < 50
                  ? "darker"
                  : "lighter"}
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
          disabled={!look.wallShown}
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
            {look.wallShown ? "text colour on the wall" : "text colour over the scene"}
          </span>
        </div>
        <div className={styles.swatches} role="group" aria-labelledby="ogchat-text-color">
          {TEXT_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              className={`${styles.swatch} ${swatch.value === textColor ? styles.swatchActive : ""}`}
              style={{ background: swatch.value }}
              aria-label={swatch.name}
              aria-pressed={swatch.value === textColor}
              title={swatch.name}
              onClick={() => setTextColor(swatch.value)}
            />
          ))}
          <label
            className={`${styles.swatch} ${styles.swatchCustom} ${custom ? styles.swatchActive : ""}`}
            style={custom ? { background: textColor } : undefined}
            title="Pick any colour"
          >
            <input
              type="color"
              value={textColor}
              aria-label="Pick any colour"
              onChange={(event) => setTextColor(event.target.value)}
            />
            {!custom && <span aria-hidden="true">+</span>}
          </label>
        </div>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-input-color">
            message box colour
          </span>
        </div>
        <div className={styles.swatches} role="group" aria-labelledby="ogchat-input-color">
          {INPUT_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              className={`${styles.swatch} ${swatch.value === look.inputColor ? styles.swatchActive : ""}`}
              style={{ background: swatch.value }}
              aria-label={swatch.name}
              aria-pressed={swatch.value === look.inputColor}
              title={swatch.name}
              onClick={() => onChange({ inputColor: swatch.value })}
            />
          ))}
          <label
            className={`${styles.swatch} ${styles.swatchCustom} ${customInput ? styles.swatchActive : ""}`}
            style={customInput ? { background: look.inputColor } : undefined}
            title="Pick any colour"
          >
            <input
              type="color"
              value={look.inputColor}
              aria-label="Pick any colour for the message box"
              onChange={(event) => onChange({ inputColor: event.target.value })}
            />
            {!customInput && <span aria-hidden="true">+</span>}
          </label>
        </div>
      </section>

      <section className={styles.lookSection}>
        <div className={styles.lookRow}>
          <span className={styles.lookLabel} id="ogchat-chat-shown">
            chat
          </span>
          <div className={styles.sceneSwitch} role="group" aria-labelledby="ogchat-chat-shown">
            <button
              type="button"
              className={`${styles.sceneButton} ${look.chatShown ? styles.sceneActive : ""}`}
              aria-pressed={look.chatShown}
              onClick={() => onChange({ chatShown: true })}
            >
              shown
            </button>
            <button
              type="button"
              className={`${styles.sceneButton} ${look.chatShown ? "" : styles.sceneActive}`}
              aria-pressed={!look.chatShown}
              title="Put the chat and the sidebar away and just look at the scene. Esc brings them back."
              onClick={() => onChange({ chatShown: false })}
            >
              hidden
            </button>
          </div>
        </div>
        <div className={styles.lookRow}>
          <label className={styles.lookLabel} htmlFor="ogchat-sidebar-width">
            sidebar width
          </label>
          <span className={styles.lookAside}>{look.sidebarWidth}px</span>
        </div>
        <input
          id="ogchat-sidebar-width"
          className={styles.slider}
          type="range"
          min={SIDEBAR_WIDTH.min}
          max={SIDEBAR_WIDTH.max}
          step={SIDEBAR_WIDTH.step}
          value={look.sidebarWidth}
          title="The chat takes whatever room the sidebar leaves. You can also drag the sidebar's edge."
          onChange={(event) => onChange({ sidebarWidth: Number(event.target.value) })}
        />
        <div className={styles.ticks} aria-hidden="true">
          <span>narrow</span>
          <span>wide</span>
        </div>
      </section>

      <div className={styles.lookFoot}>
        <button
          type="button"
          className={styles.lookAction}
          disabled={!changed}
          onClick={() =>
            onChange({
              wallShown: DEFAULT_LOOK.wallShown,
              wall: DEFAULT_LOOK.wall,
              textSize: DEFAULT_LOOK.textSize,
              textColor: DEFAULT_LOOK.textColor,
              textColorOpen: DEFAULT_LOOK.textColorOpen,
              inputColor: DEFAULT_LOOK.inputColor,
              sidebarWidth: DEFAULT_LOOK.sidebarWidth,
            })
          }
        >
          reset wall, text and layout
        </button>
      </div>
    </div>
  );
}
