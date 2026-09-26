import type { BandGeometry } from './twists';

/** Absorbs float error from the fill curve so an exact-edge release still counts (hits are inclusive). */
const EDGE_EPSILON = 1e-9;

export type Direction = 'low' | 'high' | 'center';

export interface AttemptScore {
  /** Final volume after drip — what is scored. */
  readonly volume: number;
  /** Volume at the moment of release (before drip). */
  readonly releaseVolume: number;
  /** The band as it was at the moment of release (moving / shrinking bands freeze here). */
  readonly band: BandGeometry;
  readonly hit: boolean;
  /** volume − band centre, in %. Positive = too high. */
  readonly deviation: number;
  readonly direction: Direction;
  /** 1 at band centre → 0 at band edge; 0 for any miss. */
  readonly accuracy: number;
  readonly overflow: boolean;
}

export function scoreAttempt(
  volume: number,
  band: BandGeometry,
  overflow = false,
  releaseVolume = volume,
): AttemptScore {
  const hit = !overflow && volume >= band.min - EDGE_EPSILON && volume <= band.max + EDGE_EPSILON;
  const deviation = volume - band.center;
  const direction: Direction = deviation > 0 ? 'high' : deviation < 0 ? 'low' : 'center';
  const accuracy = hit ? Math.max(0, 1 - Math.abs(deviation) / (band.width / 2)) : 0;
  return { volume, releaseVolume, band, hit, deviation, direction, accuracy, overflow };
}
