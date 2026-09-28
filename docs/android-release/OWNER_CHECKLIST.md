# Owner checklist — Fill Line Play Store release

Do these in order once the PR is merged. Commands are for Windows PowerShell in the repo root.

**A. Accounts**
1. Google Play Console developer account (one-time US$25, identity verification): https://play.google.com/console
2. AdMob account with the same Google account: https://admob.google.com. Add payment and tax info.

**B. AdMob setup**
1. Apps → Add app → Android → "Is the app listed on a supported app store?" **No** → name `Fill Line`.
   Copy the **App ID** (`ca-app-pub-…~…`).
2. Ad units → **Rewarded**: name `Revive rewarded`, reward amount `1`, reward item `life`. Copy its ID (`ca-app-pub-…/…`).
3. Ad units → **Interstitial**: name `Between runs`. Copy its ID.
4. Privacy & messaging → **European regulations** → create a message for Fill Line (privacy policy URL from step C). Publish it.
   Also create the **US state regulations** message. Publish it.
5. Blocking controls → **Content rating** → max **T (Teen)**.
6. Account → Settings → copy your **Publisher ID** (`pub-…`).
7. Settings → **Test devices** → add your phone (Advertising ID from Android Settings → Google → Ads). Never tap
   real ads on your own phone. It can get the account banned.

**C. Website (Vercel)**
1. Edit `public/app-ads.txt` and replace `pub-0000000000000000` with your Publisher ID. Commit on a branch, open a PR, merge.
2. After Vercel deploys, open `https://<your-vercel-domain>/privacy.html` and `https://<your-vercel-domain>/app-ads.txt`.
   Both must load. `<your-vercel-domain>` is the production domain in the Vercel dashboard.
3. If you want a different contact email than aarahman803@gmail.com, edit `public/privacy.html` and
   `docs/android-release/store-listing.md`.

**D. Upload keystore (keep it forever and back it up in 2 places)**
```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore "$HOME\fill-line-upload.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\fill-line-upload.jks")) | Out-File -Encoding ascii "$HOME\fill-line-upload.b64"
```

**E. GitHub secrets and variable** (`gh auth login` first)
```powershell
Get-Content "$HOME\fill-line-upload.b64" -Raw | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD      # paste when prompted
gh secret set ANDROID_KEY_ALIAS --body "upload"
gh secret set ANDROID_KEY_PASSWORD           # paste when prompted
gh secret set ADMOB_APP_ID --body "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
gh secret set ADMOB_REWARDED_ID --body "ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX"
gh secret set ADMOB_INTERSTITIAL_ID --body "ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX"
gh variable set PRIVACY_POLICY_URL --body "https://<your-vercel-domain>/privacy.html"
Remove-Item "$HOME\fill-line-upload.b64"
```
| Name | Kind | Value |
|---|---|---|
| ANDROID_KEYSTORE_BASE64 | secret | base64 of the .jks |
| ANDROID_KEYSTORE_PASSWORD | secret | keystore password |
| ANDROID_KEY_ALIAS | secret | `upload` |
| ANDROID_KEY_PASSWORD | secret | key password |
| ADMOB_APP_ID | secret | AdMob App ID (`~`) |
| ADMOB_REWARDED_ID | secret | rewarded unit ID (`/`) |
| ADMOB_INTERSTITIAL_ID | secret | interstitial unit ID (`/`) |
| PRIVACY_POLICY_URL | variable | https URL of privacy.html |
| PLAY_SERVICE_ACCOUNT_JSON | secret (optional, step J) | service-account key JSON |

**F. Build the first release**
```powershell
git checkout main; git pull
git tag v1.0.0; git push origin v1.0.0
```
GitHub → Actions → "Android release" → download the `fill-line-1.0.0-…-aab` artifact → unzip → `app-release.aab`.

**G. Play Console**
1. Create app: name `Fill Line`, default language English (US), **Game**, **Free**, accept the declarations.
2. App content (Policy → App content):
   - Privacy policy: `https://<your-vercel-domain>/privacy.html`
   - App access: all functionality available without special access
   - Ads: **Yes, my app contains ads**
   - Content rating: IARC questionnaire, category *Game (Casual/Puzzle)*. Answer **No** to violence, sexual content,
     language, controlled substances, gambling, user interaction/chat, sharing location, and digital purchases.
   - Target audience: **13–15, 16–17, 18 and over** (don't select under 13). Appeal to children: **No**.
   - Data safety: data collected **Yes**, shared **Yes**, encrypted in transit **Yes**, deletion request **No**
     (the developer holds no data). Types:
     - *Location → Approximate location*: collected + shared. Purposes: Advertising or marketing, Fraud prevention.
     - *App activity → App interactions*: collected + shared. Purposes: Advertising or marketing, Analytics.
     - *App info and performance → Diagnostics*: collected + shared. Purposes: Advertising, Analytics.
     - *Device or other IDs*: collected + shared. Purposes: Advertising or marketing, Analytics, Fraud prevention.
     - For each type: not processed ephemerally, collection **required**.
   - Advertising ID: **Yes**. Purposes: Advertising or marketing, Analytics.
   - Government app No. Financial features None. Health No. News No.
3. Store listing: text from `docs/android-release/store-listing.md`, icon `store/icon-512.png`, feature graphic
   `store/feature-graphic.png`, phone screenshots `store/screenshots/*.png`. Category Games › Casual. Contact email.
   Website: `https://<your-vercel-domain>` (**needed for app-ads.txt verification**).
4. Testing → **Internal testing** → Create release → Play App Signing: accept Google-managed key → upload
   `app-release.aab` → release name `1.0.0` → Save → Review → Roll out. Add your email under Testers, open the opt-in
   link on your phone, install, and play through once.

**H. Production access**
New personal developer accounts must run a **Closed testing** release with **≥ 12 testers opted in for 14 consecutive
days** before production is unlocked. Create the closed track, add 12+ Gmail addresses (friends or family), promote the same
build, wait 14 days, then Dashboard → Apply for production. After approval: Production → Create release → promote
the tested build → roll out.

**I. After it's live**
1. AdMob → Apps → Fill Line → App settings → **Link to app store** → pick the Play listing.
2. AdMob → Apps → app-ads.txt tab → verify (it can take up to 24 h after crawling).

**J. Optional: automatic uploads**
Do this only after the first manual upload in G.4, because Play requires the first upload to be manual. Google Cloud console →
create a service account → create a JSON key. Play Console → Users and permissions → invite the service-account email
with "Release apps to testing tracks". Then `Get-Content key.json -Raw | gh secret set PLAY_SERVICE_ACCOUNT_JSON`. After that,
every `vX.Y.Z` tag uploads a draft to Internal testing automatically.

**K. Every later release**
Bump `"version"` in package.json → merge → `git tag vX.Y.Z; git push origin vX.Y.Z`. versionCode increments
automatically (1000 + workflow run number).
