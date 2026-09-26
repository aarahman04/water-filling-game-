import { LEVELS, type LevelConfig } from './config/levels';

export interface Band {
  readonly min: number;
  readonly max: number;
}

export function getLevel(level: number, levels: readonly LevelConfig[] = LEVELS): LevelConfig {
  const cfg = levels[level - 1];
  if (!cfg) throw new RangeError(`No config for level ${level} (have ${levels.length})`);
  return cfg;
}

export function bandBounds(cfg: LevelConfig): Band {
  const half = cfg.bandWidth / 2;
  return { min: cfg.bandCenter - half, max: cfg.bandCenter + half };
}

/** Hold duration that lands exactly on band centre from an empty chamber. */
export function idealHoldMs(cfg: LevelConfig): number {
  return (cfg.bandCenter / cfg.fillRate) * 1000;
}

/** How long the water surface spends inside the band while filling — the player's timing window. */
export function timeInBandMs(cfg: LevelConfig): number {
  return (cfg.bandWidth / cfg.fillRate) * 1000;
}

/** Single scalar for "how hard": %/s of fill per % of band. Higher = harder. */
export function difficultyIndex(cfg: LevelConfig): number {
  return cfg.fillRate / cfg.bandWidth;
}

export interface CurveRules {
  /** Lowest allowed band edge — keeps targets away from near-instant taps at the base. */
  readonly minBandFloor: number;
  /** Highest allowed band edge — leaves headroom below the rim / overflow. */
  readonly maxBandCeiling: number;
  /** Narrowest allowed timing window. ~150ms is below typical human release variance, so treat as the hard floor. */
  readonly minTimeInBandMs: number;
  /** Consecutive levels must move the band centre at least this much. */
  readonly minCenterShift: number;
  /** Spread (max − min) of band centres across the whole game. */
  readonly minCenterSpread: number;
}

export const DEFAULT_CURVE_RULES: CurveRules = {
  minBandFloor: 15,
  maxBandCeiling: 95,
  minTimeInBandMs: 150,
  minCenterShift: 5,
  minCenterSpread: 20,
};

/** Returns human-readable violations; empty array = curve is valid. */
export function validateLevels(
  levels: readonly LevelConfig[] = LEVELS,
  rules: CurveRules = DEFAULT_CURVE_RULES,
): string[] {
  const errors: string[] = [];
  if (levels.length === 0) return ['No levels defined'];

  levels.forEach((cfg, i) => {
    const tag = `L${cfg.level}`;
    if (cfg.level !== i + 1) errors.push(`${tag}: level number out of sequence at index ${i}`);
    if (!(cfg.fillRate > 0)) errors.push(`${tag}: fillRate must be > 0`);
    if (!(cfg.bandWidth > 0)) errors.push(`${tag}: bandWidth must be > 0`);
    const { min, max } = bandBounds(cfg);
    if (min < rules.minBandFloor) errors.push(`${tag}: band bottom ${min} below floor ${rules.minBandFloor}`);
    if (max > rules.maxBandCeiling) errors.push(`${tag}: band top ${max} above ceiling ${rules.maxBandCeiling}`);
    const window = timeInBandMs(cfg);
    if (window < rules.minTimeInBandMs)
      errors.push(`${tag}: timing window ${window.toFixed(0)}ms below ${rules.minTimeInBandMs}ms`);

    const prev = levels[i - 1];
    if (prev) {
      if (cfg.fillRate < prev.fillRate) errors.push(`${tag}: fillRate decreased`);
      if (cfg.bandWidth > prev.bandWidth) errors.push(`${tag}: bandWidth increased`);
      if (difficultyIndex(cfg) <= difficultyIndex(prev)) errors.push(`${tag}: not harder than L${prev.level}`);
      if (Math.abs(cfg.bandCenter - prev.bandCenter) < rules.minCenterShift)
        errors.push(`${tag}: band centre moved < ${rules.minCenterShift} from L${prev.level}`);
    }
  });

  const centers = levels.map((l) => l.bandCenter);
  const spread = Math.max(...centers) - Math.min(...centers);
  if (spread < rules.minCenterSpread) errors.push(`Band centre spread ${spread} < ${rules.minCenterSpread}`);

  return errors;
}
