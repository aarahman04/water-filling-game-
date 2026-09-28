/** App-wide singletons: one game controller, one save store, one SFX engine. */

import { Sfx } from '../audio/sfx';
import { AdCoordinator, createAds } from '../ads';
import { GameController, LEVEL_COUNT, getLevel, solveIdealHoldMs } from '../game';
import { ProgressStore } from '../persistence/progress';
import { createStore } from '../persistence/storage';

export const controller = new GameController();
export const progress = new ProgressStore(createStore());
export const sfx = new Sfx(false);
export const ads = createAds();
export const adCoordinator = new AdCoordinator(ads, LEVEL_COUNT);

progress.bind(controller);

// Dev builds only: lets automated browser checks drive the game. Stripped from production.
if (import.meta.env.DEV)
  (window as unknown as { __fillLine: unknown }).__fillLine = { controller, getLevel, solveIdealHoldMs };
sfx.bind(controller);
progress.subscribe(() => sfx.setMuted(progress.get().muted));

/** Timestamp for an input event on the performance.now() clock (falls back if a WebView reports junk). */
export function eventTime(e: { timeStamp: number }): number {
  const now = performance.now();
  const ts = e.timeStamp;
  return ts > 0 && ts <= now + 1 && now - ts < 1000 ? ts : now;
}

export const now = () => performance.now();
