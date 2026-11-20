"use client";

import { useCallback, useEffect, useRef } from "react";
import { Ambience, type Soundscape } from "@/lib/ambience";

/**
 * The street's sound, for as long as it is switched on. It is made when
 * sound is turned on and thrown away when it is turned off. A browser only
 * lets sound start from a click or a key press, so if the page was loaded
 * with sound already on, it waits for the first one.
 */
export function useAmbience(on: boolean, volume: number, scape: Soundscape) {
  const sound = useRef<Ambience | null>(null);
  const latest = useRef(scape);
  useEffect(() => {
    latest.current = scape;
  });

  useEffect(() => {
    if (!on) return;
    let made: Ambience;
    try {
      made = new Ambience(0);
    } catch {
      return; // no sound in this browser: the street is simply silent
    }
    sound.current = made;
    made.set(latest.current);
    const wake = () => made.resume();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    made.resume();
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      made.stop();
      sound.current = null;
    };
  }, [on]);

  useEffect(() => {
    sound.current?.setVolume(volume);
  }, [on, volume]);

  // Follow the street: every figure, in steps, so that a drifting decimal does not re-send it.
  const key = [
    Math.round(scape.traffic * 20),
    Math.round(scape.rain * 20),
    scape.storm ? 1 : 0,
    Math.round(scape.wind * 20),
    Math.round(scape.birds * 20),
    Math.round(scape.night * 10),
  ].join(":");
  useEffect(() => {
    sound.current?.set(latest.current);
  }, [on, key]);

  const bang = useCallback(() => sound.current?.bang(), []);
  const whoop = useCallback(() => sound.current?.whoop(), []);
  return { bang, whoop };
}
