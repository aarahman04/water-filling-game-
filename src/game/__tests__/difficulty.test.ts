import { describe, expect, it } from 'vitest';
import { LEVELS, type LevelConfig } from '../config/levels';
import {
  bandBounds,
  fullGlassMs,
  getLevel,
  idealHoldMs,
  timeInBandMs,
  validateLevels,
} from '../difficulty';

describe('difficulty curve (config table)', () => {
  it('has exactly 20 sequential levels', () => {
    expect(LEVELS).toHaveLength(20);
    LEVELS.forEach((l, i) => expect(l.level).toBe(i + 1));
  });

  it('passes every curve invariant', () => {
    expect(validateLevels()).toEqual([]);
  });

  it('gets strictly harder every level: faster pour, stronger surge, shorter window', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(timeInBandMs(LEVELS[i])).toBeLessThan(timeInBandMs(LEVELS[i - 1]));
      expect(fullGlassMs(LEVELS[i])).toBeLessThan(fullGlassMs(LEVELS[i - 1]));
      expect(LEVELS[i].fillRate).toBeGreaterThan(LEVELS[i - 1].fillRate);
      expect(LEVELS[i].surge).toBeGreaterThanOrEqual(LEVELS[i - 1].surge);
    }
  });

  it('is hard from the start and brutal at the end', () => {
    expect(timeInBandMs(getLevel(1))).toBeLessThan(350);
    expect(fullGlassMs(getLevel(1))).toBeLessThan(6000);
    expect(timeInBandMs(getLevel(20))).toBeLessThan(80);
    expect(fullGlassMs(getLevel(20))).toBeLessThan(1300);
  });

  it('keeps every band inside the chamber, clear of the base and rim', () => {
    for (const l of LEVELS) {
      const { min, max } = bandBounds(l);
      expect(min).toBeGreaterThanOrEqual(15);
      expect(max).toBeLessThanOrEqual(95);
    }
  });

  it('varies band position so release time cannot be memorised', () => {
    const holds = LEVELS.map(idealHoldMs);
    // Not monotonic: the ideal hold duration goes both up and down across the game.
    let ups = 0;
    let downs = 0;
    for (let i = 1; i < holds.length; i++) {
      if (holds[i] > holds[i - 1]) ups++;
      else downs++;
    }
    expect(ups).toBeGreaterThanOrEqual(5);
    expect(downs).toBeGreaterThanOrEqual(5);
    // Not always centred.
    expect(LEVELS.filter((l) => l.bandCenter === 50)).toHaveLength(0);
  });

  it('keeps every timing window above the touch-jitter floor', () => {
    for (const l of LEVELS) expect(timeInBandMs(l)).toBeGreaterThanOrEqual(70);
  });

  it('assigns tiers in blocks of five', () => {
    const tiers = LEVELS.map((l) => l.tier);
    expect(tiers.slice(0, 5).every((t) => t === 'steady')).toBe(true);
    expect(tiers.slice(5, 10).every((t) => t === 'quick')).toBe(true);
    expect(tiers.slice(10, 15).every((t) => t === 'fast')).toBe(true);
    expect(tiers.slice(15).every((t) => t === 'precise')).toBe(true);
  });

  it('throws for out-of-range levels', () => {
    expect(() => getLevel(0)).toThrow(RangeError);
    expect(() => getLevel(21)).toThrow(RangeError);
  });

  describe('validateLevels catches bad edits', () => {
    const edit = (i: number, patch: Partial<LevelConfig>) =>
      LEVELS.map((l, j) => (j === i ? { ...l, ...patch } : l));

    it('band too close to base', () => {
      expect(validateLevels(edit(2, { bandCenter: 12 })).join()).toMatch(/L3: band bottom/);
    });
    it('easier than the previous level', () => {
      expect(validateLevels(edit(9, { fillRate: 10 })).join()).toMatch(/L10: fillRate decreased/);
    });
    it('impossible timing window', () => {
      expect(validateLevels(edit(19, { bandWidth: 3 })).join()).toMatch(/L20: timing window/);
    });
    it('same band position two levels running', () => {
      expect(validateLevels(edit(1, { bandCenter: 47 })).join()).toMatch(/L2: band centre moved/);
    });
  });
});
