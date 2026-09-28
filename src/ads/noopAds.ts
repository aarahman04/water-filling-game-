import type { AdService } from './AdService';

/** Web / unsupported platforms: no ads, revive hidden, interstitials skipped. */
export const noopAds: AdService = {
  supported: false,
  fullscreenActive: false,
  init: async () => {},
  subscribe: () => () => {},
  rewardedStatus: () => 'off',
  privacyOptionsRequired: () => false,
  ensureLoaded: () => {},
  showRewarded: async () => 'unavailable',
  showInterstitial: async () => false,
  showPrivacyOptions: async () => {},
};
