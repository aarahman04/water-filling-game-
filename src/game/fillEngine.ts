/**
 * Fill-timing engine.
 *
 * Volume is a closed-form function of *elapsed time*, not something accumulated per
 * frame. That makes it immune to frame rate, dropped frames and step quantisation —
 * the render loop only *samples* it, and the final volume is computed at the input
 * event's own timestamp (PointerEvent.timeStamp, same clock as requestAnimationFrame /
 * performance.now()), never at the next frame.
 *
 * Pour speed depends only on the current volume:
 *   dv/dt = factor(v) × (rate + surge × v)
 * where factor(v) is 1 except inside flow zones (spike twist). Within each constant-factor
 * piece the solution is closed-form:
 *   surge = 0 → v(t) = v0 + r·t
 *   surge > 0 → v(t) = (v0 + r/s)·e^(s·t) − r/s     (r, s scaled by the piece's factor)
 * Because speed is a function of volume (not of time since press), a pour resumed after
 * a pause continues exactly as if it had never stopped.
 *
 * All times are milliseconds on the performance.now() clock.
 */

export const MAX_VOLUME = 100;

/** Speed multiplier applied while from ≤ volume < to. */
export interface FlowZone {
  readonly from: number;
  readonly to: number;
  readonly factor: number;
}

export interface FillSegment {
  readonly startedAt: number;
  readonly startVolume: number;
  /** % per second at volume 0. */
  readonly rate: number;
  /** Speed gain per % of volume, per second. */
  readonly surge: number;
  readonly zones: readonly FlowZone[];
  /** Pour time already spent this attempt before this segment (pause/resume). Drives moving/shrinking bands. */
  readonly pourOffsetMs: number;
}

export function startSegment(
  startedAt: number,
  startVolume: number,
  rate: number,
  surge = 0,
  zones: readonly FlowZone[] = [],
  pourOffsetMs = 0,
): FillSegment {
  if (!(rate > 0)) throw new RangeError(`fill rate must be > 0, got ${rate}`);
  if (!(surge >= 0)) throw new RangeError(`surge must be >= 0, got ${surge}`);
  for (const z of zones) if (!(z.factor > 0) || !(z.to > z.from)) throw new RangeError('invalid flow zone');
  return { startedAt, startVolume: clampVolume(startVolume), rate, surge, zones, pourOffsetMs };
}

function factorAt(zones: readonly FlowZone[], v: number): number {
  for (const z of zones) if (v >= z.from && v < z.to) return z.factor;
  return 1;
}

/** Next volume above `v` where the speed factor changes (or the rim). */
function nextBreak(zones: readonly FlowZone[], v: number): number {
  let next = MAX_VOLUME;
  for (const z of zones) {
    if (z.from > v && z.from < next) next = z.from;
    if (z.to > v && z.to < next) next = z.to;
  }
  return next;
}

/** Pour speed (% per second) at volume `v`. */
export function speedAt(rate: number, surge: number, v: number, zones: readonly FlowZone[] = []): number {
  return factorAt(zones, v) * (rate + surge * v);
}

function pieceSeconds(v0: number, v1: number, rate: number, surge: number): number {
  if (surge === 0) return (v1 - v0) / rate;
  const k = rate / surge;
  return Math.log((v1 + k) / (v0 + k)) / surge;
}

function pieceAdvance(v0: number, rate: number, surge: number, sec: number): number {
  if (surge === 0) return v0 + rate * sec;
  const k = rate / surge;
  return (v0 + k) * Math.exp(surge * sec) - k;
}

/** Seconds of pouring needed to go from `v0` to `v1` (v1 ≥ v0). */
export function secondsToReach(
  v0: number,
  v1: number,
  rate: number,
  surge = 0,
  zones: readonly FlowZone[] = [],
): number {
  let total = 0;
  let v = v0;
  while (v < v1) {
    const end = Math.min(v1, nextBreak(zones, v));
    const f = factorAt(zones, v);
    total += pieceSeconds(v, end, rate * f, surge * f);
    v = end;
  }
  return total;
}

/** Volume after `sec` seconds from `v0`, capped at the rim. */
function advance(v0: number, rate: number, surge: number, zones: readonly FlowZone[], sec: number): number {
  let v = v0;
  let left = sec;
  while (v < MAX_VOLUME) {
    const end = nextBreak(zones, v);
    const f = factorAt(zones, v);
    const need = pieceSeconds(v, end, rate * f, surge * f);
    if (need >= left) return Math.min(MAX_VOLUME, pieceAdvance(v, rate * f, surge * f, left));
    left -= need;
    v = end;
  }
  return MAX_VOLUME;
}

export function volumeAt(seg: FillSegment, t: number): number {
  const sec = Math.max(0, t - seg.startedAt) / 1000;
  return advance(seg.startVolume, seg.rate, seg.surge, seg.zones, sec);
}

/** Total pour time this attempt at timestamp `t` (for moving / shrinking bands). */
export function pourMsAt(seg: FillSegment, t: number): number {
  return seg.pourOffsetMs + Math.max(0, Math.min(t, overflowAt(seg)) - seg.startedAt);
}

/** Exact timestamp at which the chamber reaches the rim. */
export function overflowAt(seg: FillSegment): number {
  return seg.startedAt + secondsToReach(seg.startVolume, MAX_VOLUME, seg.rate, seg.surge, seg.zones) * 1000;
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
