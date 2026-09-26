import { describe, expect, it } from 'vitest';
import { getLevel } from '../difficulty';
import { overflowAt, startSegment, stopSegment, volumeAt } from '../fillEngine';
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

  it('rejects non-positive rates', () => {
    expect(() => startSegment(0, 0, 0)).toThrow(RangeError);
  });
});

describe('scoring', () => {
  const l1 = getLevel(1); // centre 48, width 10 → [43, 53]

  it('is inclusive at both band edges', () => {
    expect(scoreAttempt(43, l1).hit).toBe(true);
    expect(scoreAttempt(53, l1).hit).toBe(true);
    expect(scoreAttempt(42.999, l1).hit).toBe(false);
    expect(scoreAttempt(53.001, l1).hit).toBe(false);
  });

  it('counts an exact-edge release reached via rate × time despite float error', () => {
    const l = getLevel(7); // [40.9, 48.1] at 15 %/s
    const seg = startSegment(0, 0, l.fillRate);
    const edgeMs = (40.9 / l.fillRate) * 1000;
    expect(scoreAttempt(stopSegment(seg, edgeMs).volume, l).hit).toBe(true);
  });

  it('reports accuracy 1 at centre, 0 at edge, 0 on a miss', () => {
    expect(scoreAttempt(48, l1).accuracy).toBe(1);
    expect(scoreAttempt(50.5, l1).accuracy).toBeCloseTo(0.5);
    expect(scoreAttempt(53, l1).accuracy).toBeCloseTo(0);
    expect(scoreAttempt(70, l1).accuracy).toBe(0);
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
