/**
 * Google Mobile Ads via @capacitor-community/admob: UMP consent, preloading with retry/backoff,
 * rewarded (reward only on the Rewarded event) and interstitial presentation.
 */

import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { AD_CONFIG } from './adConfig';
import type { AdService, RewardOutcome, RewardedStatus } from './AdService';

type Kind = 'rewarded' | 'interstitial';
type ShowResult = 'rewarded' | 'dismissed' | 'failed';

interface Slot {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  failures: number;
  retry: ReturnType<typeof setTimeout> | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

const newSlot = (): Slot => ({ status: 'idle', failures: 0, retry: null, expiry: null });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ad load timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export class AdMobAds implements AdService {
  readonly supported = true;
  private canRequest = false;
  private privacyRequired = false;
  private fullscreen = false;
  private initPromise: Promise<void> | null = null;
  private readonly slots: Record<Kind, Slot> = { rewarded: newSlot(), interstitial: newSlot() };
  private readonly listeners = new Set<() => void>();

  get fullscreenActive(): boolean {
    return this.fullscreen;
  }

  init(): Promise<void> {
    return (this.initPromise ??= this.doInit());
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  rewardedStatus = (): RewardedStatus => {
    if (!this.canRequest) return 'off';
    const s = this.slots.rewarded.status;
    return s === 'ready' ? 'ready' : s === 'failed' ? 'unavailable' : 'loading';
  };

  privacyOptionsRequired = (): boolean => this.privacyRequired;

  ensureLoaded(): void {
    void this.load('rewarded');
    void this.load('interstitial');
  }

  async showRewarded(): Promise<RewardOutcome> {
    if (!this.canRequest || this.fullscreen || this.slots.rewarded.status !== 'ready') {
      void this.load('rewarded');
      return 'unavailable';
    }
    const r = await this.present('rewarded');
    return r === 'failed' ? 'unavailable' : r;
  }

  async showInterstitial(): Promise<boolean> {
    if (!this.canRequest || this.fullscreen || this.slots.interstitial.status !== 'ready') {
      void this.load('interstitial');
      return false;
    }
    return (await this.present('interstitial')) !== 'failed';
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
      const info = await AdMob.requestConsentInfo();
      this.canRequest = info.canRequestAds;
      this.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (err) {
      console.error('[fill-line] privacy options failed', err);
    }
    this.notify();
    this.ensureLoaded();
  }

  private async doInit(): Promise<void> {
    try {
      await AdMob.initialize({ initializeForTesting: !AD_CONFIG.production });
      let info = await AdMob.requestConsentInfo();
      if (!info.canRequestAds && info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        info = await AdMob.showConsentForm();
      }
      this.canRequest = info.canRequestAds;
      this.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (err) {
      console.error('[fill-line] ads init failed', err);
      this.canRequest = false;
    }
    this.notify();
    this.ensureLoaded();
  }

  private async load(kind: Kind): Promise<void> {
    const slot = this.slots[kind];
    if (!this.canRequest || slot.status === 'loading' || slot.status === 'ready') return;
    if (slot.retry !== null) {
      clearTimeout(slot.retry);
      slot.retry = null;
    }
    slot.status = 'loading';
    this.notify();
    const opts = {
      adId: kind === 'rewarded' ? AD_CONFIG.rewardedId : AD_CONFIG.interstitialId,
      isTesting: !AD_CONFIG.production,
      immersiveMode: true,
    };
    try {
      await withTimeout(
        kind === 'rewarded' ? AdMob.prepareRewardVideoAd(opts) : AdMob.prepareInterstitial(opts),
        AD_CONFIG.loadTimeoutMs,
      );
      slot.status = 'ready';
      slot.failures = 0;
      slot.expiry = setTimeout(() => {
        slot.expiry = null;
        if (slot.status !== 'ready') return;
        slot.status = 'idle';
        void this.load(kind);
      }, AD_CONFIG.adExpiryMs);
    } catch (err) {
      console.warn(`[fill-line] ${kind} ad failed to load`, err);
      slot.status = 'failed';
      slot.failures += 1;
      const delay = Math.min(AD_CONFIG.maxRetryMs, AD_CONFIG.baseRetryMs * 2 ** (slot.failures - 1));
      slot.retry = setTimeout(() => {
        slot.retry = null;
        slot.status = 'idle';
        void this.load(kind);
      }, delay);
    }
    this.notify();
  }

  private async present(kind: Kind): Promise<ShowResult> {
    const slot = this.slots[kind];
    if (slot.expiry !== null) {
      clearTimeout(slot.expiry);
      slot.expiry = null;
    }
    slot.status = 'idle'; // a shown ad is consumed
    this.fullscreen = true;
    this.notify();

    let earned = false;
    let finish: (r: ShowResult) => void = () => {};
    const done = new Promise<ShowResult>((resolve) => {
      let settled = false;
      finish = (r) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
    });

    const handles: PluginListenerHandle[] = await Promise.all(
      kind === 'rewarded'
        ? [
            AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
              earned = true;
            }),
            AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
              setTimeout(() => finish(earned ? 'rewarded' : 'dismissed'), AD_CONFIG.rewardGraceMs);
            }),
            AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish('failed')),
          ]
        : [
            AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish('dismissed')),
            AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish('failed')),
          ],
    );

    const show = kind === 'rewarded' ? AdMob.showRewardVideoAd() : AdMob.showInterstitial();
    show.then(
      () => {
        if (kind === 'rewarded') earned = true; // showRewardVideoAd resolves on reward
      },
      () => {
        setTimeout(() => finish(earned ? 'rewarded' : 'failed'), AD_CONFIG.showFallbackMs);
      },
    );

    const result = await done;
    await Promise.all(handles.map((h) => h.remove()));
    this.fullscreen = false;
    this.notify();
    void this.load(kind);
    return result;
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
