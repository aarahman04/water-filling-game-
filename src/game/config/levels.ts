/**
 * Difficulty curve — the single source of truth for per-level tuning.
 *
 * Units: percent of chamber height (0 = empty, 100 = rim).
 *   fillRate   — pour speed at the start of the pour, in % per second
 *   surge      — how much the pour speeds up as the glass fills, per second:
 *                speed(v) = fillRate + surge × v. 0 = constant speed.
 *                A surge makes the water accelerate, so high bands pass faster than low ones
 *                and release timing can't be counted out linearly.
 *   bandWidth  — full height of the acceptance band, in %
 *   bandCenter — centre of the acceptance band, in %
 *   tier       — difficulty tier; the design layer maps it to caption, water colours, wave intensity
 *
 * Balance pass 2 ("super hard", 2026-09-27): widths are chosen so the time the surface
 * spends inside the band (the real difficulty) falls geometrically from ~320ms at L1
 * to ~75ms at L20. Visible band width therefore varies with position. Edit freely;
 * `validateLevels()` in ../difficulty.ts guards the invariants and `npm run sim` prints
 * the resulting windows.
 */

export type Tier = 'steady' | 'quick' | 'fast' | 'precise';

export interface LevelConfig {
  readonly level: number;
  readonly fillRate: number;
  readonly surge: number;
  readonly bandWidth: number;
  readonly bandCenter: number;
  readonly tier: Tier;
}

// prettier-ignore
export const LEVELS: readonly LevelConfig[] = [
  //                                                                                           window  full glass
  { level:  1, fillRate: 18.0, surge: 0,    bandWidth: 5.8, bandCenter: 45, tier: 'steady'  }, // 322ms   5.56s
  { level:  2, fillRate: 19.5, surge: 0,    bandWidth: 5.8, bandCenter: 70, tier: 'steady'  }, // 297ms   5.13s
  { level:  3, fillRate: 21.0, surge: 0,    bandWidth: 5.8, bandCenter: 32, tier: 'steady'  }, // 276ms   4.76s
  { level:  4, fillRate: 22.5, surge: 0,    bandWidth: 5.7, bandCenter: 62, tier: 'steady'  }, // 253ms   4.44s
  { level:  5, fillRate: 23.5, surge: 0.1,  bandWidth: 7.4, bandCenter: 80, tier: 'steady'  }, // 235ms   3.55s
  { level:  6, fillRate: 25.0, surge: 0.15, bandWidth: 6.7, bandCenter: 38, tier: 'quick'   }, // 218ms   3.13s
  { level:  7, fillRate: 26.5, surge: 0.2,  bandWidth: 8.4, bandCenter: 74, tier: 'quick'   }, // 203ms   2.81s
  { level:  8, fillRate: 28.0, surge: 0.25, bandWidth: 7.8, bandCenter: 55, tier: 'quick'   }, // 187ms   2.55s
  { level:  9, fillRate: 29.5, surge: 0.3,  bandWidth: 9.6, bandCenter: 85, tier: 'quick'   }, // 175ms   2.34s
  { level: 10, fillRate: 31.0, surge: 0.35, bandWidth: 6.6, bandCenter: 28, tier: 'quick'   }, // 162ms   2.16s
  { level: 11, fillRate: 32.0, surge: 0.4,  bandWidth: 8.7, bandCenter: 66, tier: 'fast'    }, // 149ms   2.03s
  { level: 12, fillRate: 33.5, surge: 0.45, bandWidth: 7.6, bandCenter: 48, tier: 'fast'    }, // 138ms   1.89s
  { level: 13, fillRate: 35.0, surge: 0.5,  bandWidth: 9.7, bandCenter: 82, tier: 'fast'    }, // 128ms   1.77s
  { level: 14, fillRate: 36.5, surge: 0.55, bandWidth: 6.6, bandCenter: 35, tier: 'fast'    }, // 118ms   1.67s
  { level: 15, fillRate: 38.0, surge: 0.6,  bandWidth: 8.9, bandCenter: 72, tier: 'fast'    }, // 110ms   1.58s
  { level: 16, fillRate: 39.5, surge: 0.65, bandWidth: 7.9, bandCenter: 58, tier: 'precise' }, // 102ms   1.50s
  { level: 17, fillRate: 40.5, surge: 0.7,  bandWidth: 9.6, bandCenter: 88, tier: 'precise' }, //  94ms   1.43s
  { level: 18, fillRate: 42.0, surge: 0.75, bandWidth: 6.4, bandCenter: 42, tier: 'precise' }, //  87ms   1.37s
  { level: 19, fillRate: 43.5, surge: 0.8,  bandWidth: 8.6, bandCenter: 78, tier: 'precise' }, //  81ms   1.30s
  { level: 20, fillRate: 45.0, surge: 0.85, bandWidth: 7.5, bandCenter: 64, tier: 'precise' }, //  75ms   1.25s
];

export const LEVEL_COUNT = LEVELS.length;
