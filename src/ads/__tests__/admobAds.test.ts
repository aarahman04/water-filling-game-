import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdMobAds } from '../admobAds';

const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(d?: unknown) => void>>();
  return {
    listeners,
    fire: (e: string, d?: unknown) => listeners.get(e)?.forEach((f) => f(d)),
    consent: {
      status: 'OBTAINED',
      canRequestAds: true,
      isConsentFormAvailable: false,
      privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    },
  };
});

vi.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: vi.fn(async () => {}),
    requestConsentInfo: vi.fn(async () => h.consent),
    showConsentForm: vi.fn(async () => h.consent),
    showPrivacyOptionsForm: vi.fn(async () => {}),
    prepareRewardVideoAd: vi.fn(async () => ({ adUnitId: 'r' })),
    prepareInterstitial: vi.fn(async () => ({ adUnitId: 'i' })),
    showRewardVideoAd: vi.fn(() => new Promise(() => {})),
    showInterstitial: vi.fn(() => new Promise(() => {})),
    addListener: vi.fn(async (e: string, fn: (d?: unknown) => void) => {
      if (!h.listeners.has(e)) h.listeners.set(e, new Set());
      h.listeners.get(e)!.add(fn);
      return { remove: async () => void h.listeners.get(e)!.delete(fn) };
    }),
  },
  AdmobConsentStatus: { REQUIRED: 'REQUIRED', OBTAINED: 'OBTAINED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' },
  PrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' },
  RewardAdPluginEvents: {
    Rewarded: 'onRewardedVideoAdReward',
    Dismissed: 'onRewardedVideoAdDismissed',
    FailedToShow: 'onRewardedVideoAdFailedToShow',
  },
  InterstitialAdPluginEvents: { Dismissed: 'interstitialAdDismissed', FailedToShow: 'interstitialAdFailedToShow' },
}));

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('AdMobAds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    h.consent.canRequestAds = true;
    h.consent.status = 'OBTAINED';
    h.consent.isConsentFormAvailable = false;
    h.consent.privacyOptionsRequirementStatus = 'NOT_REQUIRED';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    h.listeners.clear();
    h.consent.canRequestAds = true;
    h.consent.status = 'OBTAINED';
    h.consent.isConsentFormAvailable = false;
    h.consent.privacyOptionsRequirementStatus = 'NOT_REQUIRED';
  });

  it('initializes consent and preloads rewarded ads', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    expect(ads.rewardedStatus()).toBe('ready');
  });

  it('rewards only after the Rewarded event and clears fullscreen state', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    const p = ads.showRewarded();
    await flush();
    expect(ads.fullscreenActive).toBe(true);
    h.fire('onRewardedVideoAdReward');
    h.fire('onRewardedVideoAdDismissed');
    await vi.advanceTimersByTimeAsync(400);
    expect(await p).toBe('rewarded');
    expect(ads.fullscreenActive).toBe(false);
  });

  it('reports dismissal without a reward', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    const p = ads.showRewarded();
    await flush();
    h.fire('onRewardedVideoAdDismissed');
    await vi.advanceTimersByTimeAsync(400);
    expect(await p).toBe('dismissed');
  });

  it('accepts a Rewarded event shortly after Dismissed', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    const p = ads.showRewarded();
    await flush();
    h.fire('onRewardedVideoAdDismissed');
    await vi.advanceTimersByTimeAsync(200);
    h.fire('onRewardedVideoAdReward');
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toBe('rewarded');
  });

  it('reports failed-to-show as unavailable', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    const p = ads.showRewarded();
    await flush();
    h.fire('onRewardedVideoAdFailedToShow');
    expect(await p).toBe('unavailable');
  });

  it('returns unavailable before initialization', async () => {
    expect(await new AdMobAds().showRewarded()).toBe('unavailable');
  });

  it('turns ads off when consent does not allow requests', async () => {
    const { AdMob } = await import('@capacitor-community/admob');
    h.consent.canRequestAds = false;
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    expect(ads.rewardedStatus()).toBe('off');
    expect(await ads.showInterstitial()).toBe(false);
    ads.ensureLoaded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(AdMob.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
    expect(AdMob.requestConsentInfo).toHaveBeenCalledTimes(1);
  });

  it('recovers from a startup consent error with backoff', async () => {
    const { AdMob } = await import('@capacitor-community/admob');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(AdMob.requestConsentInfo)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'));
    const ads = new AdMobAds();
    await ads.init();
    expect(ads.rewardedStatus()).toBe('unavailable');
    expect(AdMob.prepareRewardVideoAd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(AdMob.requestConsentInfo).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ads.rewardedStatus()).toBe('ready');
    expect(AdMob.requestConsentInfo).toHaveBeenCalledTimes(3);
  });

  it('allows one manual startup retry and cancels the scheduled retry', async () => {
    const { AdMob } = await import('@capacitor-community/admob');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(AdMob.initialize).mockRejectedValueOnce(new Error('SDK unavailable'));
    const ads = new AdMobAds();
    await ads.init();
    ads.ensureLoaded();
    ads.ensureLoaded();
    await flush();
    expect(ads.rewardedStatus()).toBe('ready');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(AdMob.initialize).toHaveBeenCalledTimes(2);
    expect(AdMob.prepareRewardVideoAd).toHaveBeenCalledTimes(1);
  });

  it('shows a required consent form even when prior consent permits requests', async () => {
    const { AdMob } = await import('@capacitor-community/admob');
    h.consent.status = 'REQUIRED';
    h.consent.isConsentFormAvailable = true;
    const ads = new AdMobAds();
    await ads.init();
    expect(AdMob.showConsentForm).toHaveBeenCalledTimes(1);
  });

  it('reports a dismissed interstitial as shown', async () => {
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    const p = ads.showInterstitial();
    await flush();
    h.fire('interstitialAdDismissed');
    expect(await p).toBe(true);
  });

  it('retries a failed load', async () => {
    const { AdMob } = await import('@capacitor-community/admob');
    vi.mocked(AdMob.prepareRewardVideoAd).mockRejectedValueOnce(new Error('load failed'));
    const ads = new AdMobAds();
    await ads.init();
    await flush();
    expect(ads.rewardedStatus()).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(5_000);
    await flush();
    expect(ads.rewardedStatus()).toBe('ready');
  });
});
