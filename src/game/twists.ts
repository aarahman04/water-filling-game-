/**
 * Twists: per-attempt surprises layered on the base difficulty curve.
 *
 * Everything random is rolled once per attempt from (run seed, level, attempt number)
 * with a small deterministic PRNG, so the reducer stays pure and tests are repeatable,
 * while a player never sees the same attempt twice.
 */

import type { LevelConfig, Twists } from './config/levels';
import { MAX_VOLUME, secondsToReach, startSegment, volumeAt, type FlowZone } from './fillEngine';

export interface AttemptSetup {
  /** Band centre for this attempt after jitter (before movement). */
  readonly center: number;
  /** Start phase of the moving band, radians. */
  readonly phase: number;
  /** Volume where the flow spike starts, or null. */
  readonly spikeFrom: number | null;
}

export interface BandGeometry {
  readonly center: number;
  readonly width: number;
  readonly min: number;
  readonly max: number;
}

/** mulberry32 — tiny, fast, good enough for gameplay rolls. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rollSetup(cfg: LevelConfig, seed: number, attempt: number): AttemptSetup {
  const r = rng(mix(seed, cfg.level, attempt));
  const t = cfg.twists;
  const jitter = t.jitter ?? 0;
  const center = cfg.bandCenter + (r() * 2 - 1) * jitter;
  const phase = r() * Math.PI * 2;
  let spikeFrom: number | null = null;
  if (t.spike) {
    // Somewhere below the band, so it wrecks the approach rather than landing after it.
    const lo = Math.max(3, center - 40);
    const hi = Math.max(lo, center - cfg.bandWidth / 2 - 4);
    spikeFrom = lo + r() * (hi - lo);
  }
  return { center, phase, spikeFrom };
}

/** Setup with no randomness (base centre, zero phase) — for curve analysis. */
export function baseSetup(cfg: LevelConfig): AttemptSetup {
  const spikeFrom = cfg.twists.spike ? Math.max(3, cfg.bandCenter - cfg.bandWidth / 2 - 20) : null;
  return { center: cfg.bandCenter, phase: 0, spikeFrom };
}

export function flowZones(cfg: LevelConfig, setup: AttemptSetup): FlowZone[] {
  const s = cfg.twists.spike;
  if (!s || setup.spikeFrom === null) return [];
  return [{ from: setup.spikeFrom, to: Math.min(MAX_VOLUME, setup.spikeFrom + s.length), factor: s.factor }];
}

/** Band geometry after `pourMs` of pouring this attempt. */
export function bandAt(cfg: LevelConfig, setup: AttemptSetup, pourMs: number): BandGeometry {
  const t = cfg.twists;
  let center = setup.center;
  if (t.moving) center += t.moving.amplitude * Math.sin((2 * Math.PI * pourMs) / t.moving.periodMs + setup.phase);
  let width = cfg.bandWidth;
  if (t.shrink) width *= 1 - (1 - t.shrink.to) * Math.min(1, pourMs / t.shrink.overMs);
  return { center, width, min: center - width / 2, max: center + width / 2 };
}

export function dripOf(cfg: LevelConfig): number {
  return cfg.twists.drip ?? 0;
}

/**
 * Hold duration (ms, from empty) whose final volume (incl. drip) lands on the band centre
 * at the moment of release. Used by tests and the simulation bot; the game never needs it.
 */
export function solveIdealHoldMs(cfg: LevelConfig, setup: AttemptSetup): number {
  const zones = flowZones(cfg, setup);
  const seg = startSegment(0, 0, cfg.fillRate, cfg.surge, zones);
  const drip = dripOf(cfg);
  const full = secondsToReach(0, MAX_VOLUME, cfg.fillRate, cfg.surge, zones) * 1000;
  const err = (ms: number) => volumeAt(seg, ms) + drip - bandAt(cfg, setup, ms).center;
  // Scan for the first sign change, then bisect.
  const step = 2;
  let prev = err(0);
  for (let ms = step; ms < full; ms += step) {
    const e = err(ms);
    if (prev < 0 && e >= 0) {
      let lo = ms - step;
      let hi = ms;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (err(mid) < 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    prev = e;
  }
  return full;
}

/** Player-facing names, in the order they're introduced. Spike location is never revealed. */
export function twistLabels(t: Twists): string[] {
  const out: string[] = [];
  if (t.jitter) out.push('Shifting target');
  if (t.drip) out.push('Drip');
  if (t.moving) out.push('Moving band');
  if (t.spike) out.push('Unstable flow');
  if (t.hidden) out.push('Hidden band');
  if (t.fog) out.push('Fog');
  if (t.shrink) out.push('Shrinking band');
  return out;
}

/** One-line hint for a twist on the level where it first appears. */
export const TWIST_HINTS: Record<string, string> = {
  'Shifting target': 'The band moves to a new spot every attempt.',
  Drip: 'The nozzle keeps dripping after you let go. Stop early.',
  'Moving band': 'The band slides while you pour.',
  'Unstable flow': 'Somewhere on the way up, the flow surges.',
  'Hidden band': 'Memorise the band. It vanishes when you pour.',
  Fog: 'Frosted glass hides the water near the band.',
  'Shrinking band': 'The band narrows the longer you pour.',
};
