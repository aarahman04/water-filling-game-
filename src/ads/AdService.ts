export type RewardOutcome = 'rewarded' | 'dismissed' | 'unavailable';
/** off = ads unsupported or not allowed (web, consent) → hide revive UI. */
export type RewardedStatus = 'off' | 'loading' | 'ready' | 'unavailable';

export interface AdService {
  readonly supported: boolean;
  /** True while a full-screen ad covers the app; lifecycle handlers must not pause the game then. */
  readonly fullscreenActive: boolean;
  /** Initialize SDK + UMP consent, then preload. Safe to call more than once. */
  init(): Promise<void>;
  /** Arrow-function members below: stable identities for useSyncExternalStore. */
  subscribe: (fn: () => void) => () => void;
  rewardedStatus: () => RewardedStatus;
  privacyOptionsRequired: () => boolean;
  /** Kick off loading of anything not loaded/loading. */
  ensureLoaded(): void;
  showRewarded(): Promise<RewardOutcome>;
  /** Resolves true if an interstitial was actually shown and closed. Never rejects. */
  showInterstitial(): Promise<boolean>;
  showPrivacyOptions(): Promise<void>;
}
