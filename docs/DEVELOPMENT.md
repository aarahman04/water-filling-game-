# Fill Line development guide

This guide is the starting point for an agent adding or changing a feature. Read the relevant source files before editing; the map below is a guide, not a substitute for the implementation.

## Project at a glance

Fill Line is a portrait water-filling game. The browser and Android app share one React 19 + TypeScript game. Vite builds the web assets into `dist/`; Capacitor 8 packages that same output in the Android app. The web app has no ads. Android uses AdMob and device-local Capacitor Preferences.

`package.json` is the version source; the current app version is `1.0.0`. `capacitor.config.ts` sets Android's package ID (`com.fillline.game`), app name, web directory, and native webview options.

## Source map

| Location | Owns |
|---|---|
| `src/game/config/gameplay.ts` | Shared lives, timing, and game-wide rules. |
| `src/game/config/levels.ts` | Level-by-level difficulty and twist configuration. |
| `src/game/machine.ts` | Pure reducer for game states, actions, and emitted events. |
| `src/game/types.ts` | State/action/event discriminated unions and shared domain types. |
| `src/game/fillEngine.ts`, `scoring.ts`, `difficulty.ts`, `twists.ts` | Time-based fill math, scoring, level validation/solving, and per-attempt setup. |
| `src/game/controller.ts`, `events.ts`, `selectors.ts` | rAF loop and state/event subscription shell around the pure reducer. |
| `src/app/services.ts` | App-wide controller, save store, sound engine, and ad coordinator singletons. |
| `src/app/hooks.ts`, `platform.ts` | React external-store hooks and Capacitor lifecycle/back handling. |
| `src/App.tsx` | Top-level screen selection, user actions, and overlay orchestration. |
| `src/ui/` | React HUD, stage, fill control, icons, and dialogs. `Stage.tsx` connects UI state to the renderer. |
| `src/render/waterRenderer.ts` | Canvas drawing and animation. It consumes game state/events; it must not decide scoring or game rules. |
| `src/theme/tokens.css`, `theme.ts`, `src/styles/app.css` | Palette, typography, motion/layout values, and UI styling. |
| `src/assets/design/` | SVG source artwork used by the game. |
| `src/audio/sfx.ts` | Synthesized sound effects driven by controller events. |
| `src/persistence/` | Save schema, event-derived progress, and web/Android key-value adapters. |
| `src/ads/` | AdMob service, web no-op service, consent, and ad pacing policy. |
| `public/` | Static site files copied to the root of `dist/`, including privacy and advertising pages. `vite.config.ts` generates app-ads.txt from the build environment. |
| `android/` | Capacitor Android project and Gradle configuration. |
| `scripts/` | Difficulty simulator and store artwork/screenshot tooling. |
| `docs/ANDROID.md`, `docs/android-release/OWNER_CHECKLIST.md` | Android builds, release prerequisites, store listing, and owner-only steps. |

## How a play action flows

1. `src/main.tsx` validates the level table, loads saved progress, mounts React, and initializes ads.
2. `src/app/services.ts` creates one `GameController`, one `ProgressStore`, one sound engine, and a platform-selected ad service.
3. `App.tsx` dispatches timestamped actions to the controller. React hooks subscribe to controller/save/ad stores.
4. `GameController` sends actions to the pure `reduce(state, action)` function in `machine.ts`, emits events, and ticks timed transitions from `requestAnimationFrame`.
5. UI, canvas, audio, persistence, and ad pacing react to state/events. Scoring and game progression remain in `src/game/`.

Keep reducer transitions deterministic: pass timestamps in actions; do not add timers, DOM access, or browser APIs to the pure game modules. A wrong action for a state is guarded/ignored by the reducer.

## Where to put a change

- **New game rule or level behavior:** implement the rule in the pure game modules/config; add or adjust focused tests under `src/game/__tests__/`. Keep level tuning in the level table and change it only when requested.
- **New game phase/action/event:** update the relevant state/action/event types and reducer, then add deterministic transition coverage. Update selectors/controller consumers only where needed.
- **Canvas appearance or animation:** edit `waterRenderer.ts` and, if required, the stage hookup. Keep scoring independent of decorative surface motion. Use `theme.ts` and CSS tokens for existing visual values; don't move game rules into rendering.
- **Menu, HUD, dialog, or settings UI:** edit the owning component in `src/ui/` or orchestration in `App.tsx`; style it in `src/styles/app.css`. Preserve accessible names, keyboard focus, and touch target sizes.
- **Sound:** extend `src/audio/sfx.ts` through existing game events; do not put sound playback in the reducer.
- **Saved setting/progress:** change `SaveData` and parsing/defaults in `src/persistence/progress.ts`, storage adapter behavior only in `storage.ts`, and tests in `src/persistence/__tests__/`. Treat stored JSON as untrusted and preserve backward compatibility; bump/migrate `SAVE_VERSION` only when the schema needs it.
- **Ads/consent:** add shared decisions to `AdService` and both implementations (`admobAds.ts` and `noopAds.ts`). Keep web ad-free. Pure pacing rules belong in `policy.ts`/`coordinator.ts` and their tests.
- **Web-only document:** put standalone documents/assets in `public/`; Vite copies them to the root of `dist/`. The menu's compliance links use new tabs on web, while Android keeps native in-app compliance views.
- **Design/art:** check `docs/design-handoff.md` and `src/theme/` before changing colors, timing, geometry, or motion. Source SVGs are in `src/assets/design/`; store outputs are generated by `scripts/make-store-assets.mjs`.
- **Android packaging:** update Capacitor/Gradle files only for a native packaging need. Run a web build before `npx cap sync android`; see `docs/ANDROID.md`.

## Code and product constraints

- The app TypeScript config is strict and sets `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, and `noUnusedParameters`. Use `import type` for type-only imports. Do not use TypeScript enums, namespaces, or constructor parameter properties.
- Keep game logic independent of React, the DOM, Canvas, Capacitor, and audio. Inject clocks/configuration where deterministic behavior or tests need control.
- Don't add dependencies for a small native/browser/standard-library job. Do not commit local build output, personal assets, keystores, `.env` values, or real service credentials.
- Never put secrets in source, documentation, workflow output, or commits. Release AdMob values and signing credentials belong in GitHub Secrets; `PRIVACY_POLICY_URL` belongs in GitHub Variables. `PLAY_SERVICE_ACCOUNT_JSON` is optional and causes the release workflow to upload an internal-track **draft** when present.
- Keep Android and web behavior intentionally distinct where platform services differ: `createAds()` selects AdMob only on native; the web implementation is a no-op.

## Local development and checks

Use Node 22 or newer (`package.json` requires Node 22+). Install locked dependencies with `npm ci`.

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite development server (default port 5173). |
| `npm run typecheck` | Run the TypeScript project build/check. |
| `npm run lint` | Run Oxlint. |
| `npm test` | Run the Vitest suite once. |
| `npm run build` | Typecheck and build the production web assets into `dist/`. |
| `npm run sim` | Run the difficulty/bot simulation (`npm run sim -- --sd 250 --fps 30`). |
| `npm run build:single` | Build the optional single-file web output in `dist-single/`. |
| `npm run android:sync` | Build the web app, then sync it into Capacitor Android. |

After changing code, run the checks required by the task. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, and build, then builds an Android debug APK with JDK 21. Do not claim a check passed unless its command completed successfully.

## Assets

Artwork and screenshots are not generated by normal builds. `node scripts/make-store-assets.mjs` needs `sharp`; `node scripts/capture-screenshots.mjs` needs Puppeteer and a dev server on port 5199. The project docs specify temporary `--no-save` installs for these optional tasks. Keep generated artwork in the documented store/Android locations and do not overwrite unrelated user files.

## Android release

Read `docs/ANDROID.md` and `docs/android-release/OWNER_CHECKLIST.md` before release work. Release tags use `vX.Y.Z`; the Android release workflow builds a signed AAB with JDK 21 and uploads it as an Actions artifact. Current source version is `1.0.0`. The workflow requires these GitHub Secrets: `ADMOB_APP_ID`, `ADMOB_REWARDED_ID`, `ADMOB_INTERSTITIAL_ID`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`; it also requires the `PRIVACY_POLICY_URL` GitHub Variable. Never inspect/print secret values. The optional `PLAY_SERVICE_ACCOUNT_JSON` enables the internal-track draft upload described in `docs/ANDROID.md`.

For local Android builds use Android Studio's bundled JDK 21 or Temurin 21. Do not use JDK 22+. Do not create signing keys, real AdMob IDs, Play Console records, or GitHub secrets on behalf of the owner; follow the owner checklist.

## Tests and fixtures

Tests live beside their domain in `__tests__/`. Game transition tests use the pure reducer and deterministic timestamps/configuration; `src/game/__tests__/harness.ts` is shared setup. Persistence tests exercise the pure save parser/reducer and stores. Ad tests mock the platform SDK; don't make tests depend on real ads, a device, network access, or wall-clock timing.

`node scripts/check-ads-build.mjs` checks production seller-file generation and rejection of missing/placeholder App IDs using synthetic IDs and temporary build output.

For UI changes, `node scripts/check-ui.mjs` checks four phone sizes, level instructions, touch capture, every level, reduced motion, and sound/mute using a dev server on port 5199 and the same optional Puppeteer install as `capture-screenshots.mjs`. Screenshots go to the system temporary directory.
