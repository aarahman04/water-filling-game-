/**
 * Difficulty curve — the single source of truth for per-level tuning.
 *
 * Units: percent of chamber height (0 = empty, 100 = rim).
 *   fillRate   — pour speed at the start of the pour, in % per second
 *   surge      — how much the pour speeds up as the glass fills, per second:
 *                speed(v) = fillRate + surge × v. 0 = constant speed.
 *   bandWidth  — full height of the acceptance band, in %
 *   bandCenter — base centre of the acceptance band, in %
 *   tier       — difficulty tier; the design layer maps it to caption, water colours, wave intensity
 *   twists     — surprises layered on top (see Twists). Random parts are re-rolled on
 *                every attempt, so a retry never plays the same as the last try.
 *
 * Balance pass 3 ("HARD", 2026-09-27): base timing window 261ms at L1 → 70ms at L20,
 * with a new twist introduced on each of levels 2–8 and stacked combinations after.
 * `validateLevels()` in ../difficulty.ts guards the invariants (including worst-case
 * band positions after jitter + movement). `npm run sim` prints the curve.
 */

export type Tier = 'steady' | 'quick' | 'fast' | 'precise';

export interface Twists {
  /** Band centre moves by up to ± this many % — re-rolled every attempt. */
  readonly jitter?: number;
  /** Band slides up and down while you pour: ± amplitude %, one cycle per periodMs. Random start phase. */
  readonly moving?: { readonly amplitude: number; readonly periodMs: number };
  /** Band narrows while you pour, down to `to` × its width after `overMs` of pouring. */
  readonly shrink?: { readonly to: number; readonly overMs: number };
  /** Band is shown during the intro, then disappears while you pour. Revealed on release. */
  readonly hidden?: boolean;
  /** Frosted glass: water becomes invisible from `below` % under the band centre upward. */
  readonly fog?: { readonly below: number };
  /** Unannounced flow burst: speed × factor for `length` % of the glass, starting somewhere below the band. */
  readonly spike?: { readonly factor: number; readonly length: number };
  /** Nozzle keeps dripping after release: adds this many % on top of where you stopped. */
  readonly drip?: number;
}

export interface LevelConfig {
  readonly level: number;
  readonly fillRate: number;
  readonly surge: number;
  readonly bandWidth: number;
  readonly bandCenter: number;
  readonly tier: Tier;
  readonly twists: Twists;
}

const J = (jitter: number) => ({ jitter });

// prettier-ignore
export const LEVELS: readonly LevelConfig[] = [
  //                                                                                                 base window / full glass
  { level:  1, fillRate: 18.0, surge: 0,    bandWidth: 4.7, bandCenter: 45, tier: 'steady',  twists: {} },                                                     // 261ms 5.56s
  { level:  2, fillRate: 19.5, surge: 0,    bandWidth: 4.7, bandCenter: 62, tier: 'steady',  twists: { ...J(10) } },                                           // 241ms 5.13s
  { level:  3, fillRate: 21.0, surge: 0,    bandWidth: 4.8, bandCenter: 40, tier: 'steady',  twists: { ...J(10), drip: 3 } },                                  // 229ms 4.76s
  { level:  4, fillRate: 22.5, surge: 0,    bandWidth: 4.8, bandCenter: 58, tier: 'steady',  twists: { ...J(10), moving: { amplitude: 6, periodMs: 1400 } } },  // 213ms 4.44s
  { level:  5, fillRate: 23.5, surge: 0.1,  bandWidth: 6.0, bandCenter: 70, tier: 'steady',  twists: { ...J(12), spike: { factor: 2.0, length: 14 } } },       // 197ms 3.55s
  { level:  6, fillRate: 25.0, surge: 0.15, bandWidth: 5.8, bandCenter: 45, tier: 'quick',   twists: { ...J(12), hidden: true } },                             // 183ms 3.13s
  { level:  7, fillRate: 26.5, surge: 0.2,  bandWidth: 6.8, bandCenter: 65, tier: 'quick',   twists: { ...J(12), fog: { below: 16 } } },                       // 172ms 2.81s
  { level:  8, fillRate: 28.0, surge: 0.25, bandWidth: 6.5, bandCenter: 50, tier: 'quick',   twists: { ...J(12), shrink: { to: 0.5, overMs: 1500 }, drip: 3 } },  // 161ms 2.55s
  { level:  9, fillRate: 29.5, surge: 0.3,  bandWidth: 7.1, bandCenter: 60, tier: 'quick',   twists: { ...J(10), moving: { amplitude: 8, periodMs: 1200 }, spike: { factor: 2.0, length: 14 } } }, // 149ms 2.34s
  { level: 10, fillRate: 31.0, surge: 0.35, bandWidth: 6.3, bandCenter: 40, tier: 'quick',   twists: { ...J(12), hidden: true, drip: 4 } },                    // 140ms 2.16s
  { level: 11, fillRate: 32.0, surge: 0.4,  bandWidth: 7.4, bandCenter: 62, tier: 'fast',    twists: { ...J(10), fog: { below: 18 }, moving: { amplitude: 8, periodMs: 1100 } } }, // 130ms 2.03s
  { level: 12, fillRate: 33.5, surge: 0.45, bandWidth: 6.8, bandCenter: 50, tier: 'fast',    twists: { ...J(12), shrink: { to: 0.45, overMs: 1300 }, spike: { factor: 2.2, length: 16 } } }, // 121ms 1.89s
  { level: 13, fillRate: 35.0, surge: 0.5,  bandWidth: 7.8, bandCenter: 68, tier: 'fast',    twists: { ...J(12), hidden: true, spike: { factor: 2.2, length: 16 } } }, // 113ms 1.77s
  { level: 14, fillRate: 36.5, surge: 0.55, bandWidth: 6.5, bandCenter: 45, tier: 'fast',    twists: { ...J(12), fog: { below: 15 }, drip: 5, spike: { factor: 2.3, length: 16 } } }, // 106ms 1.67s
  { level: 15, fillRate: 38.0, surge: 0.6,  bandWidth: 7.3, bandCenter: 60, tier: 'fast',    twists: { ...J(10), moving: { amplitude: 10, periodMs: 900 }, shrink: { to: 0.45, overMs: 1200 } } }, // 99ms 1.58s
  { level: 16, fillRate: 39.5, surge: 0.65, bandWidth: 6.9, bandCenter: 55, tier: 'precise', twists: { ...J(12), hidden: true, spike: { factor: 2.4, length: 18 }, drip: 4 } }, // 92ms 1.50s
  { level: 17, fillRate: 40.5, surge: 0.7,  bandWidth: 7.5, bandCenter: 66, tier: 'precise', twists: { ...J(10), fog: { below: 22 }, moving: { amplitude: 8, periodMs: 1000 }, shrink: { to: 0.4, overMs: 1200 } } }, // 87ms 1.43s
  { level: 18, fillRate: 42.0, surge: 0.75, bandWidth: 6.3, bandCenter: 48, tier: 'precise', twists: { ...J(14), hidden: true, shrink: { to: 0.4, overMs: 1100 }, drip: 5, spike: { factor: 2.5, length: 18 } } }, // 81ms 1.37s
  { level: 19, fillRate: 43.5, surge: 0.8,  bandWidth: 7.0, bandCenter: 62, tier: 'precise', twists: { ...J(12), fog: { below: 25 }, drip: 5, shrink: { to: 0.4, overMs: 1000 }, spike: { factor: 2.5, length: 20 } } }, // 75ms 1.30s
  { level: 20, fillRate: 45.0, surge: 0.85, bandWidth: 6.5, bandCenter: 56, tier: 'precise', twists: { ...J(14), fog: { below: 25 }, moving: { amplitude: 10, periodMs: 1000 }, shrink: { to: 0.35, overMs: 1000 }, spike: { factor: 2.6, length: 20 }, drip: 5 } }, // 70ms 1.25s
];

export const LEVEL_COUNT = LEVELS.length;
