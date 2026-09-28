/** Interstitial pacing rules, pure so they're unit-testable. Times are Date.now() ms. */

export type InterstitialTrigger = 'newRun' | 'milestone';

export interface AdPolicyState {
  /** Runs started in this app session (in memory; resets on app restart). */
  readonly runsStarted: number;
  readonly lastInterstitialAt: number | null;
}

export const INITIAL_POLICY: AdPolicyState = { runsStarted: 0, lastInterstitialAt: null };

export function shouldShowInterstitial(
  s: AdPolicyState,
  trigger: InterstitialTrigger,
  now: number,
  minIntervalMs: number,
): boolean {
  if (trigger === 'newRun' && s.runsStarted === 0) return false; // first run of the session is ad-free
  return s.lastInterstitialAt === null || now - s.lastInterstitialAt >= minIntervalMs;
}

/** Level just cleared is a milestone (5, 10, 15 …) but not the final level (victory). */
export function isMilestone(levelCleared: number, every: number, levelCount: number): boolean {
  return every > 0 && levelCleared % every === 0 && levelCleared < levelCount;
}

export const noteRunStarted = (s: AdPolicyState): AdPolicyState => ({ ...s, runsStarted: s.runsStarted + 1 });

export const noteInterstitialShown = (s: AdPolicyState, now: number): AdPolicyState => ({ ...s, lastInterstitialAt: now });
