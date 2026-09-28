import { AD_CONFIG } from './adConfig';
import type { AdService } from './AdService';
import {
  INITIAL_POLICY,
  isMilestone,
  noteInterstitialShown,
  noteRunStarted,
  shouldShowInterstitial,
  type AdPolicyState,
} from './policy';

/** Decides when interstitials run; the UI awaits these before dispatching the game action. */
export class AdCoordinator {
  private policy: AdPolicyState = INITIAL_POLICY;
  private readonly ads: AdService;
  private readonly levelCount: number;
  private readonly clock: () => number;

  constructor(ads: AdService, levelCount: number, clock: () => number = Date.now) {
    this.ads = ads;
    this.levelCount = levelCount;
    this.clock = clock;
  }

  /** Await before START_RUN. */
  async beforeRunStart(): Promise<void> {
    const show = shouldShowInterstitial(this.policy, 'newRun', this.clock(), AD_CONFIG.interstitialMinIntervalMs);
    this.policy = noteRunStarted(this.policy);
    if (show) await this.tryInterstitial();
  }

  /** Await before CONTINUE from a passed level. */
  async beforeNextLevel(levelCleared: number): Promise<void> {
    if (!isMilestone(levelCleared, AD_CONFIG.milestoneEvery, this.levelCount)) return;
    if (!shouldShowInterstitial(this.policy, 'milestone', this.clock(), AD_CONFIG.interstitialMinIntervalMs)) return;
    await this.tryInterstitial();
  }

  private async tryInterstitial(): Promise<void> {
    if (await this.ads.showInterstitial()) this.policy = noteInterstitialShown(this.policy, this.clock());
  }
}
