/**
 * Difficulty curve — the single source of truth for per-level tuning.
 *
 * Units: percent of chamber height (0 = empty, 100 = rim).
 *   fillRate   — % per second while the Fill control is held (linear, constant within a level)
 *   bandWidth  — full height of the acceptance band, in %
 *   bandCenter — centre of the acceptance band, in %
 *   tier       — difficulty tier; the design layer maps it to caption, water colours, wave intensity
 *
 * Balance pass 1 comes from docs/design-handoff.md §6:
 *   rate = 10.5 + 0.75 × (L−1)   band = 10.0 − 0.3 × (L−1)
 * The values are written out rather than computed so a designer can hand-tune any
 * row without touching code. `validateLevels()` in ../difficulty.ts guards the invariants.
 */

export type Tier = 'steady' | 'quick' | 'fast' | 'precise';

export interface LevelConfig {
  readonly level: number;
  readonly fillRate: number;
  readonly bandWidth: number;
  readonly bandCenter: number;
  readonly tier: Tier;
}

// prettier-ignore
export const LEVELS: readonly LevelConfig[] = [
  { level:  1, fillRate: 10.5,  bandWidth: 10.0, bandCenter: 48, tier: 'steady'  },
  { level:  2, fillRate: 11.25, bandWidth:  9.7, bandCenter: 62, tier: 'steady'  },
  { level:  3, fillRate: 12.0,  bandWidth:  9.4, bandCenter: 40, tier: 'steady'  },
  { level:  4, fillRate: 12.75, bandWidth:  9.1, bandCenter: 70, tier: 'steady'  },
  { level:  5, fillRate: 13.5,  bandWidth:  8.8, bandCenter: 55, tier: 'steady'  },
  { level:  6, fillRate: 14.25, bandWidth:  8.5, bandCenter: 66, tier: 'quick'   },
  { level:  7, fillRate: 15.0,  bandWidth:  8.2, bandCenter: 44, tier: 'quick'   },
  { level:  8, fillRate: 15.75, bandWidth:  7.9, bandCenter: 74, tier: 'quick'   },
  { level:  9, fillRate: 16.5,  bandWidth:  7.6, bandCenter: 52, tier: 'quick'   },
  { level: 10, fillRate: 17.25, bandWidth:  7.3, bandCenter: 60, tier: 'quick'   },
  { level: 11, fillRate: 18.0,  bandWidth:  7.0, bandCenter: 46, tier: 'fast'    },
  { level: 12, fillRate: 18.75, bandWidth:  6.7, bandCenter: 72, tier: 'fast'    },
  { level: 13, fillRate: 19.5,  bandWidth:  6.4, bandCenter: 57, tier: 'fast'    },
  { level: 14, fillRate: 20.25, bandWidth:  6.1, bandCenter: 64, tier: 'fast'    },
  { level: 15, fillRate: 21.0,  bandWidth:  5.8, bandCenter: 42, tier: 'fast'    },
  { level: 16, fillRate: 21.75, bandWidth:  5.5, bandCenter: 69, tier: 'precise' },
  { level: 17, fillRate: 22.5,  bandWidth:  5.2, bandCenter: 54, tier: 'precise' },
  { level: 18, fillRate: 23.25, bandWidth:  4.9, bandCenter: 76, tier: 'precise' },
  { level: 19, fillRate: 24.0,  bandWidth:  4.6, bandCenter: 59, tier: 'precise' },
  { level: 20, fillRate: 24.75, bandWidth:  4.3, bandCenter: 68, tier: 'precise' },
];

export const LEVEL_COUNT = LEVELS.length;
