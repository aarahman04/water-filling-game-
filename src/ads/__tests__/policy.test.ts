import { describe, expect, it } from 'vitest';
import {
  INITIAL_POLICY,
  isMilestone,
  noteInterstitialShown,
  noteRunStarted,
  shouldShowInterstitial,
} from '../policy';

describe('interstitial policy', () => {
  it('skips the first run and allows later runs', () => {
    expect(shouldShowInterstitial(INITIAL_POLICY, 'newRun', 0, 60_000)).toBe(false);
    expect(shouldShowInterstitial(noteRunStarted(INITIAL_POLICY), 'newRun', 0, 60_000)).toBe(true);
  });

  it('shares the cooldown across triggers', () => {
    const state = noteInterstitialShown({ runsStarted: 1, lastInterstitialAt: null }, 1000);
    for (const trigger of ['newRun', 'milestone'] as const) {
      expect(shouldShowInterstitial(state, trigger, 60_999, 60_000)).toBe(false);
      expect(shouldShowInterstitial(state, trigger, 61_000, 60_000)).toBe(true);
    }
  });

  it('marks every fifth cleared level except victory', () => {
    expect(isMilestone(5, 5, 20)).toBe(true);
    expect(isMilestone(10, 5, 20)).toBe(true);
    expect(isMilestone(15, 5, 20)).toBe(true);
    expect(isMilestone(4, 5, 20)).toBe(false);
    expect(isMilestone(20, 5, 20)).toBe(false);
    expect(isMilestone(5, 0, 20)).toBe(false);
  });
});
