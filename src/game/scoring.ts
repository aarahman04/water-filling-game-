import type { LevelConfig } from './config/levels';
import { bandBounds } from './difficulty';

/** Absorbs float error from rate × time so an exact-edge release still counts (hits are inclusive). */
const EDGE_EPSILON = 1e-9;

export type Direction = 'low' | 'high' | 'center';

export interface AttemptScore {
  readonly volume: number;
  readonly hit: boolean;
  /** volume − bandCenter, in %. Positive = too high. */
  readonly deviation: number;
  readonly direction: Direction;
  /** 1 at band centre → 0 at band edge; 0 for any miss. */
  readonly accuracy: number;
  readonly overflow: boolean;
}

export function scoreAttempt(volume: number, cfg: LevelConfig, overflow = false): AttemptScore {
  const { min, max } = bandBounds(cfg);
  const hit = !overflow && volume >= min - EDGE_EPSILON && volume <= max + EDGE_EPSILON;
  const deviation = volume - cfg.bandCenter;
  const direction: Direction = deviation > 0 ? 'high' : deviation < 0 ? 'low' : 'center';
  const accuracy = hit ? Math.max(0, 1 - Math.abs(deviation) / (cfg.bandWidth / 2)) : 0;
  return { volume, hit, deviation, direction, accuracy, overflow };
}
