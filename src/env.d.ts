declare global {
  interface ImportMetaEnv {
    /** 'production' = real AdMob units (release builds). Anything else = Google test units. */
    readonly VITE_ADS_MODE?: 'test' | 'production';
    readonly VITE_ADMOB_REWARDED_ID?: string;
    readonly VITE_ADMOB_INTERSTITIAL_ID?: string;
    /** Public https URL of privacy.html (shown in Settings). */
    readonly VITE_PRIVACY_URL?: string;
  }
}
export {};
