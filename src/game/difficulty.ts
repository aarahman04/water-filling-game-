import { LEVELS, type LevelConfig } from './config/levels';
import { secondsToReach } from './fillEngine';

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
  return secondsToReach(0, cfg.bandCenter, cfg.fillRate, cfg.surge) * 1000;
}

/** How long the water surface spends inside the band while filling — the player's timing window. */
export function timeInBandMs(cfg: LevelConfig): number {
  const { min, max } = bandBounds(cfg);
  return secondsToReach(min, max, cfg.fillRate, cfg.surge) * 1000;
}

/** Hold duration that fills the glass to the rim (overflow) from empty. */
export function fullGlassMs(cfg: LevelConfig): number {
  return secondsToReach(0, 100, cfg.fillRate, cfg.surge) * 1000;
}

/** Single scalar for "how hard": inverse of the timing window. Higher = harder. */
export function difficultyIndex(cfg: LevelConfig): number {
  return 1000 / timeInBandMs(cfg);
}

export interface CurveRules {
  /** Lowest allowed band edge — keeps targets away from near-instant taps at the base. */
  readonly minBandFloor: number;
  /** Highest allowed band edge — leaves headroom below the rim / overflow. */
  readonly maxBandCeiling: number;
  /** Narrowest allowed timing window. Below ~70ms a release is decided more by touch latency jitter than skill. */
  readonly minTimeInBandMs: number;
  /** Consecutive levels must move the band centre at least this much. */
  readonly minCenterShift: number;
  /** Spread (max − min) of band centres across the whole game. */
  readonly minCenterSpread: number;
}

export const DEFAULT_CURVE_RULES: CurveRules = {
  minBandFloor: 15,
  maxBandCeiling: 95,
  minTimeInBandMs: 70,
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
    if (!(cfg.surge >= 0)) errors.push(`${tag}: surge must be >= 0`);
    // Worst case after jitter + movement must still sit inside the safe zone.
    const t = cfg.twists;
    const reach = (t.jitter ?? 0) + (t.moving?.amplitude ?? 0) + cfg.bandWidth / 2;
    const min = cfg.bandCenter - reach;
    const max = cfg.bandCenter + reach;
    if (min < rules.minBandFloor) errors.push(`${tag}: band bottom can reach ${min.toFixed(1)}, below floor ${rules.minBandFloor}`);
    if (max > rules.maxBandCeiling) errors.push(`${tag}: band top can reach ${max.toFixed(1)}, above ceiling ${rules.maxBandCeiling}`);
    if (t.shrink && !(t.shrink.to > 0 && t.shrink.to <= 1 && t.shrink.overMs > 0)) errors.push(`${tag}: invalid shrink`);
    if (t.spike && !(t.spike.factor >= 1 && t.spike.length > 0)) errors.push(`${tag}: invalid spike`);
    if (t.drip !== undefined && !(t.drip >= 0 && t.drip < min)) errors.push(`${tag}: drip must be >= 0 and below the lowest band`);
    if (t.moving && !(t.moving.periodMs > 0)) errors.push(`${tag}: invalid moving period`);
    const window = timeInBandMs(cfg);
    if (window < rules.minTimeInBandMs)
      errors.push(`${tag}: timing window ${window.toFixed(0)}ms below ${rules.minTimeInBandMs}ms`);

    const prev = levels[i - 1];
    if (prev) {
      if (cfg.fillRate < prev.fillRate) errors.push(`${tag}: fillRate decreased`);
      if (cfg.surge < prev.surge) errors.push(`${tag}: surge decreased`);
      // Band width may vary with position (a surge makes high bands pass faster);
      // what must shrink every level is the time the surface spends inside the band.
      if (difficultyIndex(cfg) <= difficultyIndex(prev)) errors.push(`${tag}: timing window not shorter than L${prev.level}`);
      if (Math.abs(cfg.bandCenter - prev.bandCenter) < rules.minCenterShift)
        errors.push(`${tag}: band centre moved < ${rules.minCenterShift} from L${prev.level}`);
    }
  });

  const centers = levels.map((l) => l.bandCenter);
  const spread = Math.max(...centers) - Math.min(...centers);
  if (spread < rules.minCenterSpread) errors.push(`Band centre spread ${spread} < ${rules.minCenterSpread}`);

  return errors;
}
