/**
 * Registry of replies currently being generated, keyed by session id.
 *
 * It lives on globalThis because the dev server may evaluate this module more
 * than once (one copy per route bundle); every copy must see the same map so
 * that the stop route can reach a generation started by the messages route.
 */

import type { RanOn } from "@/lib/types";

export interface Generation {
  controller: AbortController;
  /** Text received so far. */
  partial: string;
  /** Reasoning received so far, when the provider shares it. */
  thinking: string;
  /** Which model is answering and at what thinking level, once the turn has started. */
  ranOn?: RanOn;
}

const store = globalThis as typeof globalThis & {
  __ogchatGenerations?: Map<string, Generation>;
};

function registry(): Map<string, Generation> {
  return (store.__ogchatGenerations ??= new Map());
}

/** Reserves the session for a new reply. Returns null if one is already running. */
export function beginGeneration(sessionId: string): Generation | null {
  const map = registry();
  if (map.has(sessionId)) return null;
  const generation: Generation = {
    controller: new AbortController(),
    partial: "",
    thinking: "",
  };
  map.set(sessionId, generation);
  return generation;
}

export function endGeneration(sessionId: string, generation: Generation): void {
  const map = registry();
  if (map.get(sessionId) === generation) map.delete(sessionId);
}

export function getGeneration(sessionId: string): Generation | null {
  return registry().get(sessionId) ?? null;
}

/** Asks a running generation to stop. Returns false when nothing was running. */
export function stopGeneration(sessionId: string): boolean {
  const generation = registry().get(sessionId);
  if (!generation) return false;
  generation.controller.abort();
  return true;
}
