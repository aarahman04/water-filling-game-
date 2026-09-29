# Android release

Fill Line is a Capacitor 8 Android app (`com.fillline.game`) with target/compile SDK 36 and minimum SDK 24.

## Toolchain

Use Node 22 or newer and JDK 21. On Windows, set:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
```

## Release from CI

After merging to `main`, push a version tag such as `v1.0.0`. The Android release workflow builds a signed AAB using the GitHub secrets and variable below. Download the AAB from the workflow artifact. The optional Play service-account key lets the workflow upload a draft to Internal testing after the first manual upload.

| Name | Kind | Purpose |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Secret | Base64 upload keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Keystore password |
| `ANDROID_KEY_ALIAS` | Secret | Upload key alias |
| `ANDROID_KEY_PASSWORD` | Secret | Key password |
| `ADMOB_APP_ID` | Secret | AdMob app ID (`~`) |
| `ADMOB_REWARDED_ID` | Secret | Rewarded ad unit ID (`/`) |
| `ADMOB_INTERSTITIAL_ID` | Secret | Interstitial ad unit ID (`/`) |
| `PRIVACY_POLICY_URL` | Variable | HTTPS URL of `privacy.html` |
| `PLAY_SERVICE_ACCOUNT_JSON` | Optional secret | Upload draft releases to Play |

CI uses JDK 21 and creates the signed AAB. Never put secret values in the repository.

## Local release

Create `android/keystore.properties` from `android/keystore.properties.example` and keep the keystore and passwords out of git. Then build:

```powershell
npm run build
npx cap sync android
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug bundleRelease
```

Without a local keystore, `bundleRelease` is unsigned. `npm run android:open` opens the project in Android Studio.

## Ads

Debug and ordinary builds use Google's public test ad units. Release builds set `VITE_ADS_MODE=production`, `VITE_ADMOB_REWARDED_ID`, `VITE_ADMOB_INTERSTITIAL_ID`, and `VITE_PRIVACY_URL`; the build refuses missing, test, or malformed ad unit IDs and a non-HTTPS privacy URL.

The Android app offers an optional rewarded ad for one revive when a run ends, with at most two revives per run. Interstitials can appear before runs after the first run in an app session and after levels 5, 10, and 15, with a shared 60-second cooldown. There are no banners. The web build has no ads.

UMP consent is requested at launch. Settings provides Ad privacy choices when required and a Privacy policy link when `VITE_PRIVACY_URL` is set.

Temporary SDK/consent startup failures retry with the existing 5–60 second backoff; ads stay blocked until UMP allows requests. A completed consent check that disallows requests is not retried automatically.

The website build generates `app-ads.txt` from `ADMOB_APP_ID`. Set that variable separately in Vercel's Production environment and redeploy; GitHub secrets configure the AAB, not the website. Do not put the real ID in source. See the owner checklist for linking the Play listing, verifying app-ads.txt, and completing AdMob review. Limited serving or an unlinked **Requires review** app cannot be fixed with signing secrets.

## Play Console notes

- **Contains ads:** yes.
- Data-safety answers are in `docs/android-release/OWNER_CHECKLIST.md`, Appendix G.
- Target audience: ages 13+; maximum AdMob content rating: T (Teen).
- Target API is 36 and orientation is portrait.

## Launcher icon and splash

Regenerate the source artwork and Android resources with:

```powershell
npm i --no-save sharp@0.34
node scripts/make-store-assets.mjs
npx --yes @capacitor/assets@3 generate --android --iconBackgroundColor "#101f2c" --iconBackgroundColorDark "#101f2c" --splashBackgroundColor "#101f2c" --splashBackgroundColorDark "#101f2c"
```
