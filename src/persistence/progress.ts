/**
 * Persistent player progress + preferences.
 *
 * `applyEvent` is a pure reducer over game hook events so persistence rules are
 * unit-testable; `ProgressStore` wires it to a controller and a KeyValueStore.
 */

import type { GameController, GameEvent } from '../game';
import type { KeyValueStore } from './storage';

export const SAVE_KEY = 'fill-line/save';
export const SAVE_VERSION = 1;

export type ReducedMotionPref = 'system' | 'on';

export interface SaveData {
  readonly version: number;
  /** Highest level number the player has reached (entered) in any run. Survives game over. */
  readonly bestLevel: number;
  /** Runs started. */
  readonly gamesPlayed: number;
  /** Best accuracy per level (index = level − 1); 0–1, null = never passed. */
  readonly bestAccuracy: readonly (number | null)[];
  readonly victories: number;
  readonly muted: boolean;
  readonly reducedMotion: ReducedMotionPref;
  /** First-run instruction panel dismissed. */
  readonly seenTutorial: boolean;
}

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  bestLevel: 0,
  gamesPlayed: 0,
  bestAccuracy: [],
  victories: 0,
  muted: false,
  reducedMotion: 'system',
  seenTutorial: false,
};

export function applyEvent(data: SaveData, event: GameEvent): SaveData {
  switch (event.type) {
    case 'runStart':
      return { ...data, gamesPlayed: data.gamesPlayed + 1 };
    case 'levelIntro':
      return event.payload.level > data.bestLevel ? { ...data, bestLevel: event.payload.level } : data;
    case 'levelPass': {
      const i = event.payload.level - 1;
      const prev = data.bestAccuracy[i] ?? null;
      const acc = event.payload.score.accuracy;
      if (prev !== null && prev >= acc) return data;
      const bestAccuracy = [...data.bestAccuracy];
      while (bestAccuracy.length < i) bestAccuracy.push(null);
      bestAccuracy[i] = acc;
      return { ...data, bestAccuracy };
    }
    case 'victory':
      return { ...data, victories: data.victories + 1 };
    default:
      return data;
  }
}

/** Parse + migrate stored JSON; anything unreadable falls back to defaults. */
export function parseSave(raw: string | null): SaveData {
  if (!raw) return DEFAULT_SAVE;
  try {
    const obj = JSON.parse(raw) as Partial<SaveData>;
    if (typeof obj !== 'object' || obj === null) return DEFAULT_SAVE;
    return {
      ...DEFAULT_SAVE,
      bestLevel: num(obj.bestLevel, 0),
      gamesPlayed: num(obj.gamesPlayed, 0),
      victories: num(obj.victories, 0),
      bestAccuracy: Array.isArray(obj.bestAccuracy)
        ? obj.bestAccuracy.map((a) => (typeof a === 'number' && a >= 0 && a <= 1 ? a : null))
        : [],
      muted: obj.muted === true,
      reducedMotion: obj.reducedMotion === 'on' ? 'on' : 'system',
      seenTutorial: obj.seenTutorial === true,
    };
  } catch {
    return DEFAULT_SAVE;
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

const TRACKED: GameEvent['type'][] = ['runStart', 'levelIntro', 'levelPass', 'victory'];

export class ProgressStore {
  private data: SaveData = DEFAULT_SAVE;
  private readonly listeners = new Set<() => void>();
  private readonly store: KeyValueStore;
  private writeQueued = false;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  async load(): Promise<void> {
    this.data = parseSave(await this.store.get(SAVE_KEY));
    this.notify();
  }

  bind(controller: GameController): () => void {
    const offs = TRACKED.map((type) =>
      controller.on(type, (payload) => this.update((d) => applyEvent(d, { type, payload } as GameEvent))),
    );
    return () => offs.forEach((off) => off());
  }

  get = (): SaveData => this.data;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  update(fn: (d: SaveData) => SaveData): void {
    const next = fn(this.data);
    if (next === this.data) return;
    this.data = next;
    this.notify();
    this.queueWrite();
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** Coalesce bursts of events (e.g. levelPass + levelIntro) into one write. */
  private queueWrite() {
    if (this.writeQueued) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.writeQueued = false;
      void this.store.set(SAVE_KEY, JSON.stringify(this.data));
    });
  }
}
