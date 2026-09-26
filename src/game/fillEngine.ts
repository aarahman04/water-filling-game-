/**
 * Fill-timing engine.
 *
 * Volume is a closed-form function of *elapsed time*, not something accumulated per
 * frame. That makes it immune to frame rate, dropped frames and step quantisation —
 * the render loop only *samples* it, and the final volume is computed at the input
 * event's own timestamp (PointerEvent.timeStamp, same clock as requestAnimationFrame /
 * performance.now()), never at the next frame.
 *
 * Pour speed depends on the current volume: dv/dt = rate + surge × v.
 *   surge = 0 → v(t) = v0 + rate·t                       (constant speed)
 *   surge > 0 → v(t) = (v0 + rate/surge)·e^(surge·t) − rate/surge   (accelerating)
 * Because speed is a function of volume (not of time since press), a pour resumed after
 * a pause continues at exactly the speed it had when it was interrupted.
 *
 * All times are milliseconds on the performance.now() clock.
 */

export const MAX_VOLUME = 100;

export interface FillSegment {
  readonly startedAt: number;
  readonly startVolume: number;
  /** % per second at volume 0. */
  readonly rate: number;
  /** Speed gain per % of volume, per second. */
  readonly surge: number;
}

export function startSegment(startedAt: number, startVolume: number, rate: number, surge = 0): FillSegment {
  if (!(rate > 0)) throw new RangeError(`fill rate must be > 0, got ${rate}`);
  if (!(surge >= 0)) throw new RangeError(`surge must be >= 0, got ${surge}`);
  return { startedAt, startVolume: clampVolume(startVolume), rate, surge };
}

/** Pour speed (% per second) at volume `v`. */
export function speedAt(rate: number, surge: number, v: number): number {
  return rate + surge * v;
}

/** Uncapped volume after `sec` seconds of pouring from `v0`. */
function advance(v0: number, rate: number, surge: number, sec: number): number {
  if (surge === 0) return v0 + rate * sec;
  const k = rate / surge;
  return (v0 + k) * Math.exp(surge * sec) - k;
}

/** Seconds of pouring needed to go from `v0` to `v1` (v1 ≥ v0). */
export function secondsToReach(v0: number, v1: number, rate: number, surge = 0): number {
  if (v1 <= v0) return 0;
  if (surge === 0) return (v1 - v0) / rate;
  const k = rate / surge;
  return Math.log((v1 + k) / (v0 + k)) / surge;
}

export function volumeAt(seg: FillSegment, t: number): number {
  const sec = Math.max(0, t - seg.startedAt) / 1000;
  return Math.min(MAX_VOLUME, advance(seg.startVolume, seg.rate, seg.surge, sec));
}

/** Exact timestamp at which the chamber reaches the rim. */
export function overflowAt(seg: FillSegment): number {
  return seg.startedAt + secondsToReach(seg.startVolume, MAX_VOLUME, seg.rate, seg.surge) * 1000;
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
