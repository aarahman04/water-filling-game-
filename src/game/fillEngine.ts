/**
 * Fill-timing engine.
 *
 * Volume is a closed-form function of *elapsed time*, not something accumulated per
 * frame: v(t) = min(100, v0 + rate × (t − t0)). That makes it immune to frame rate,
 * dropped frames and step quantisation — the render loop only *samples* it, and the
 * final volume is computed at the input event's own timestamp (PointerEvent.timeStamp,
 * same clock as requestAnimationFrame / performance.now()), never at the next frame.
 *
 * All times are milliseconds on the performance.now() clock.
 */

export const MAX_VOLUME = 100;

export interface FillSegment {
  readonly startedAt: number;
  readonly startVolume: number;
  /** % per second. */
  readonly rate: number;
}

export function startSegment(startedAt: number, startVolume: number, rate: number): FillSegment {
  if (!(rate > 0)) throw new RangeError(`fill rate must be > 0, got ${rate}`);
  return { startedAt, startVolume: clampVolume(startVolume), rate };
}

export function volumeAt(seg: FillSegment, t: number): number {
  const elapsed = Math.max(0, t - seg.startedAt);
  return Math.min(MAX_VOLUME, seg.startVolume + (seg.rate * elapsed) / 1000);
}

/** Exact timestamp at which the chamber reaches the rim. */
export function overflowAt(seg: FillSegment): number {
  return seg.startedAt + ((MAX_VOLUME - seg.startVolume) / seg.rate) * 1000;
}

export interface StopResult {
  readonly volume: number;
  readonly stoppedAt: number;
  readonly overflow: boolean;
}

/** Stop at `t`, capped at the overflow instant so a late release can't record >100%. */
export function stopSegment(seg: FillSegment, t: number): StopResult {
  const rim = overflowAt(seg);
  if (t >= rim) return { volume: MAX_VOLUME, stoppedAt: rim, overflow: true };
  const stoppedAt = Math.max(seg.startedAt, t);
  return { volume: volumeAt(seg, stoppedAt), stoppedAt, overflow: false };
}

function clampVolume(v: number): number {
  return Math.min(MAX_VOLUME, Math.max(0, v));
}
