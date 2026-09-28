import { Capacitor } from '@capacitor/core';
import { AdMobAds } from './admobAds';
import type { AdService } from './AdService';
import { noopAds } from './noopAds';

export * from './AdService';
export { AdCoordinator } from './coordinator';
export { AD_CONFIG, PRIVACY_URL } from './adConfig';

export function createAds(): AdService {
  return Capacitor.isNativePlatform() ? new AdMobAds() : noopAds;
}
