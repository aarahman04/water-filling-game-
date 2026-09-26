import { describe, expect, it } from 'vitest';
import { bandBounds, getLevel } from '../difficulty';
import { overflowAt, secondsToReach, speedAt, startSegment, stopSegment, volumeAt } from '../fillEngine';
import { scoreAttempt } from '../scoring';

describe('fill engine', () => {
  it('fills linearly at the configured rate', () => {
    const seg = startSegment(1000, 0, 10); // 10 %/s
    expect(volumeAt(seg, 1000)).toBe(0);
    expect(volumeAt(seg, 2000)).toBe(10);
    expect(volumeAt(seg, 5500)).toBe(45);
  });

  it('continues from a non-zero start volume (resumed pour)', () => {
    const seg = startSegment(0, 30, 20);
    expect(volumeAt(seg, 500)).toBe(40);
    expect(overflowAt(seg)).toBe(3500);
  });

  it('never reports volume before start or above 100', () => {
    const seg = startSegment(1000, 0, 25);
    expect(volumeAt(seg, 900)).toBe(0);
    expect(volumeAt(seg, 999_999)).toBe(100);
  });

  it('scores at the release timestamp, not a later frame', () => {
    const seg = startSegment(0, 0, 10);
    // Release event at 4800ms, even if the next frame is processed at 4816ms.
    expect(stopSegment(seg, 4800).volume).toBe(48);
  });

  it('caps a late release at the overflow instant', () => {
    const seg = startSegment(0, 0, 50); // rim at 2000ms
    const stop = stopSegment(seg, 2300);
    expect(stop).toEqual({ volume: 100, stoppedAt: 2000, overflow: true });
  });

  it('clamps a release timestamp earlier than the press', () => {
    const seg = startSegment(1000, 0, 10);
    expect(stopSegment(seg, 990)).toEqual({ volume: 0, stoppedAt: 1000, overflow: false });
  });

  it('rejects non-positive rates and negative surge', () => {
    expect(() => startSegment(0, 0, 0)).toThrow(RangeError);
    expect(() => startSegment(0, 0, 10, -1)).toThrow(RangeError);
  });
});

describe('fill engine — surge (accelerating pour)', () => {
  const rate = 30;
  const surge = 0.5;

  it('accelerates: speed grows with volume', () => {
    const seg = startSegment(0, 0, rate, surge);
    const v1 = volumeAt(seg, 1000);
    const v2 = volumeAt(seg, 2000);
    expect(v2 - v1).toBeGreaterThan(v1); // the second second pours more than the first
  });

  it('matches dv/dt = rate + surge × v', () => {
    const seg = startSegment(0, 0, rate, surge);
    const t = 1234;
    const v = volumeAt(seg, t);
    const perMs = (volumeAt(seg, t + 0.01) - volumeAt(seg, t - 0.01)) / 0.02;
    expect(perMs * 1000).toBeCloseTo(speedAt(rate, surge, v), 3);
  });

  it('secondsToReach inverts volumeAt', () => {
    const seg = startSegment(0, 0, rate, surge);
    const ms = secondsToReach(0, 63.2, rate, surge) * 1000;
    expect(volumeAt(seg, ms)).toBeCloseTo(63.2, 9);
    expect(overflowAt(seg)).toBeCloseTo(secondsToReach(0, 100, rate, surge) * 1000, 9);
  });

  it('a pour split by a pause lands on the same volume as one continuous pour', () => {
    const whole = startSegment(0, 0, rate, surge);
    const mid = volumeAt(startSegment(0, 0, rate, surge), 800);
    const second = startSegment(50_000, mid, rate, surge);
    expect(volumeAt(second, 50_000 + 700)).toBeCloseTo(volumeAt(whole, 1500), 9);
  });
});

describe('scoring', () => {
  const l1 = getLevel(1);
  const { min, max } = bandBounds(l1);
  const c = l1.bandCenter;

  it('is inclusive at both band edges', () => {
    expect(scoreAttempt(min, l1).hit).toBe(true);
    expect(scoreAttempt(max, l1).hit).toBe(true);
    expect(scoreAttempt(min - 0.001, l1).hit).toBe(false);
    expect(scoreAttempt(max + 0.001, l1).hit).toBe(false);
  });

  it('counts an exact-edge release reached via the surge curve despite float error', () => {
    for (const l of [getLevel(7), getLevel(20)]) {
      const seg = startSegment(0, 0, l.fillRate, l.surge);
      const lo = bandBounds(l).min;
      const edgeMs = secondsToReach(0, lo, l.fillRate, l.surge) * 1000;
      expect(scoreAttempt(stopSegment(seg, edgeMs).volume, l).hit).toBe(true);
    }
  });

  it('reports accuracy 1 at centre, 0 at edge, 0 on a miss', () => {
    expect(scoreAttempt(c, l1).accuracy).toBe(1);
    expect(scoreAttempt(c + l1.bandWidth / 4, l1).accuracy).toBeCloseTo(0.5);
    expect(scoreAttempt(max, l1).accuracy).toBeCloseTo(0);
    expect(scoreAttempt(95, l1).accuracy).toBe(0);
  });

  it('reports direction for "Too high" / "Too low" copy', () => {
    expect(scoreAttempt(60, l1).direction).toBe('high');
    expect(scoreAttempt(30, l1).direction).toBe('low');
  });

  it('treats overflow as a miss', () => {
    const s = scoreAttempt(100, l1, true);
    expect(s.hit).toBe(false);
    expect(s.overflow).toBe(true);
  });
});
