# Android build → signed AAB for Play Console

The Android project in `android/` is a standard Capacitor 8 wrapper around the same
web build (`dist/`). Verified on 2026-09-27: `assembleDebug` and `bundleRelease` both succeed.

## One-time setup

1. **Package name.** Change `appId` in `capacitor.config.ts` *and* `namespace` / `applicationId`
   in `android/app/build.gradle` to the ID you want on Play (e.g. `com.yourstudio.fillline`).
   It can never change after the first upload. Also move
   `android/app/src/main/java/com/fillline/game/MainActivity.java` to the matching folder and
   update its `package` line.
2. **JDK.** Gradle 8.14 needs JDK 17–21. Use Android Studio's bundled one:
   `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"` (the system JDK 25 is too new).
3. **Upload key** (Play App Signing holds the real app key; you sign uploads with this one):

   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
     -keystore fill-line-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Keep the `.jks` file and its passwords outside git and backed up. If you lose them, you
   have to ask Play support to reset the upload key.
4. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill it in.
   Both the `.jks` file and `keystore.properties` are git-ignored.
5. **Launcher icon + splash.** Placeholders are the Capacitor defaults. Put a 1024×1024 icon at
   `assets/icon-only.png` (plus `assets/splash.png` if you want one), then run
   `npx @capacitor/assets generate --android`.

## Every release

```powershell
# 1. bump versionCode (+1 every upload) and versionName in android/app/build.gradle
npm run android:sync                       # vite build + copy into android/
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab (signed if keystore.properties exists)
```

Upload the `.aab` in Play Console under Testing → Internal testing, then promote it.
Or use Android Studio: `npm run android:open`, then Build → Generate Signed App Bundle.

## Quick device test

```powershell
.\gradlew.bat installDebug   # with a USB-debugging phone connected
```

## Play Console notes

- **Data safety:** no data is collected or shared. Progress is stored only on the device
  (Capacitor Preferences), there's no network access, and there are no accounts.
- **Content rating:** no violence, user content, ads or purchases.
- **Target API** is 36, which meets Play's current requirement.
- **Orientation** is locked to portrait in `AndroidManifest.xml`.
