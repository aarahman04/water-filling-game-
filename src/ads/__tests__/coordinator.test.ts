import { describe, expect, it, vi } from 'vitest';
import { AdCoordinator } from '../coordinator';
import { noopAds } from '../noopAds';

describe('ad coordinator', () => {
  it('presents new-run interstitials after the first run and enforces cooldown', async () => {
    let t = 0;
    const clock = () => t;
    const showInterstitial = vi.fn(async () => true);
    const ads = { ...noopAds, showInterstitial };
    const coordinator = new AdCoordinator(ads, 20, clock);

    await coordinator.beforeRunStart();
    expect(showInterstitial).not.toHaveBeenCalled();
    t = 1000;
    await coordinator.beforeRunStart();
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    t = 30_000;
    await coordinator.beforeRunStart();
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    t = 61_000;
    await coordinator.beforeRunStart();
    expect(showInterstitial).toHaveBeenCalledTimes(2);
  });

  it('does not record cooldown when no interstitial was shown', async () => {
    let t = 0;
    const showInterstitial = vi.fn(async () => false);
    const coordinator = new AdCoordinator({ ...noopAds, showInterstitial }, 20, () => t);
    await coordinator.beforeRunStart();
    await coordinator.beforeRunStart();
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    t += 1;
    await coordinator.beforeRunStart();
    expect(showInterstitial).toHaveBeenCalledTimes(2);
  });

  it('shows milestone interstitials only when eligible and cooldown is clear', async () => {
    let t = 0;
    const showInterstitial = vi.fn(async () => true);
    const coordinator = new AdCoordinator({ ...noopAds, showInterstitial }, 20, () => t);
    await coordinator.beforeNextLevel(5);
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    await coordinator.beforeNextLevel(4);
    await coordinator.beforeNextLevel(20);
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    await coordinator.beforeRunStart();
    t = 60_000;
    await coordinator.beforeRunStart();
    await coordinator.beforeNextLevel(10);
    expect(showInterstitial).toHaveBeenCalledTimes(2);
  });

  it('shares cooldown between a new-run ad and the next milestone', async () => {
    let t = 0;
    const showInterstitial = vi.fn(async () => true);
    const coordinator = new AdCoordinator({ ...noopAds, showInterstitial }, 20, () => t);
    await coordinator.beforeRunStart();
    t = 1000;
    await coordinator.beforeRunStart();
    await coordinator.beforeNextLevel(5);
    expect(showInterstitial).toHaveBeenCalledTimes(1);
  });
});
