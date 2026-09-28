/** Ad unit IDs + pacing. Test units unless the build sets VITE_ADS_MODE=production (see vite.config.ts guard). */

const env = import.meta.env;

/** Google's public sample units: always fill, never pay, safe to click. */
export const TEST_AD_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;

const production = env.VITE_ADS_MODE === 'production';

export const AD_CONFIG = {
  production,
  rewardedId: production ? (env.VITE_ADMOB_REWARDED_ID ?? '') : TEST_AD_UNITS.rewarded,
  interstitialId: production ? (env.VITE_ADMOB_INTERSTITIAL_ID ?? '') : TEST_AD_UNITS.interstitial,
  /** Minimum gap between any two interstitials. */
  interstitialMinIntervalMs: 60_000,
  /** Interstitial after clearing every Nth level (not the last). */
  milestoneEvery: 5,
  /** Loaded ads go stale after 1 h; reload a little before. */
  adExpiryMs: 55 * 60_000,
  loadTimeoutMs: 10_000,
  baseRetryMs: 5_000,
  maxRetryMs: 60_000,
  /** Wait after Dismissed for a late Rewarded event. */
  rewardGraceMs: 400,
  /** If show() rejects, wait this long for Dismissed/FailedToShow before giving up. */
  showFallbackMs: 1_500,
} as const;

export const PRIVACY_URL: string = env.VITE_PRIVACY_URL ?? '';
