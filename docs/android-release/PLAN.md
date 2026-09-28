# Fill Line → Google Play release with AdMob ads (executable plan)

> Companion files: `docs/android-release/CODEX_PROMPT.md` (prompt for the implementing model) and
> `docs/android-release/OWNER_CHECKLIST.md` (owner steps, Appendix B). Work happens on branch `feat/android-play-release`.

## Context

Fill Line is a finished React 19 + TypeScript + Vite 8 web game. It's already wrapped in a Capacitor 8
Android project (`android/`, appId `com.fillline.game`, target/compile SDK 36, min 24). `assembleDebug` and
`bundleRelease` built successfully on 2026-09-27. The owner wants to publish it on Google Play and earn
money from ads. They'll create the keystore, AdMob account, GitHub secrets and Play Console entries
themselves at the end. Everything else has to be finished and verifiable before then.

Product decisions (confirmed with the owner, final):

| Topic | Decision |
|---|---|
| Revive | When lives hit 0 the game-over card offers **"Watch ad · +1 life"**, which shows a rewarded ad. If the user earns the reward, the run continues on the **same level with 1 life**. A run can have at most **2 revives**. The offer is optional, and the user can always pick "Restart from level 1" or "Main menu". |
| Interstitial: new run | Shows before **every new run except the first run of the app session** (Play from menu, Restart from level 1, Play again). It follows a **60 s cooldown** shared by all interstitials. |
| Interstitial: milestone | Shows after tapping **Next level** on levels **5, 10 and 15**, using the same 60 s cooldown. |
| Banners | None. |
| Package name | Keep `com.fillline.game`. |
| Ads on web (Vercel) | None. The ad layer is a no-op on web, and the revive UI is hidden there. |
| Ad SDK | `@capacitor-community/admob@8.1.0` (Capacitor 8 line; Google Mobile Ads + UMP consent). |
| Target audience (Play) | 13+ (13–15, 16–17, 18+). This keeps the app out of the Families policy. AdMob max ad content rating is T. |

Policy compliance built into this design:
- Rewarded ads are opt-in and name the reward in the button label.
- The reward is granted only on the SDK `Rewarded` event.
- Interstitials only appear at natural breaks (before a run starts, between levels), never during a pour.
- UMP consent runs at launch, and a Privacy-options entry point appears when it's required.
- A privacy policy URL exists, the AD_ID permission is declared, and there are no banners near the tap target.

## Ground rules for the executor

- Work on branch `feat/android-play-release` created from `main`. Make one commit per phase using the
  message given. Never push to `main`.
- Toolchain: Node ≥ 22, and **JDK 21** (Android Studio JBR: `C:\Program Files\Android\Android Studio\jbr`).
  The system JDK 25 is too new.
- The TS config has `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals` and `noUnusedParameters`. So:
  **no TS `enum`s, no constructor parameter properties (`constructor(private x)`), no namespaces**. Use
  `import type` for type-only imports. Importing enums *from the AdMob package* is fine.
- Match the existing code style: 2-space indent, single quotes, semicolons in `src/`. `vite.config.ts` has
  **no semicolons**, so keep it that way. Keep comments short, in the density of the surrounding code.
- After every phase run `npm run typecheck && npm run lint && npm test`. All three must pass before committing.
- Do not generate keystores, do not create real AdMob IDs, and do not touch GitHub secrets. Those belong to the owner.
- Do not change gameplay tuning (`levels.ts`, timing values), rendering, or audio beyond what's listed here.

---

## Phase 0: Setup

```powershell
git checkout main; git pull
git checkout -b feat/android-play-release
npm ci
npm install @capacitor-community/admob@8.1.0 --save-exact
npm run typecheck; npm run lint; npm test   # baseline must be green
```
Set `"version": "1.0.0"` in `package.json` (currently `0.0.0`).
Commit: `chore: add AdMob plugin, set version 1.0.0`

---

## Phase 1: Revive in the pure game logic (`src/game/`)

### 1.1 `src/game/config/gameplay.ts`
Add two fields to `GameplayConfig` (after `startingLives`):
```ts
  /** Rewarded-ad revives allowed per run (GAME_OVER → same level). 0 disables revive. */
  readonly maxRevivesPerRun: number;
  /** Lives granted by one revive. */
  readonly reviveLives: number;
```
and in `GAMEPLAY`: `maxRevivesPerRun: 2,` and `reviveLives: 1,` (after `startingLives: 3,`).

### 1.2 `src/game/types.ts`
- `RunContext`: add after `attempt`:
  ```ts
  /** Revives used this run (rewarded ads). */
  readonly revivesUsed: number;
  ```
- Replace `GameOverState` with:
  ```ts
  export type GameOverState = {
    readonly tag: 'GAME_OVER';
    readonly levelReached: number;
    /** The run as it ended (lives 0); REVIVE continues it. */
    readonly run: RunContext;
    /** Revives still available for this run. */
    readonly revivesLeft: number;
  };
  ```
- `GameAction`: add
  ```ts
  /** Continue a finished run on the same level. Dispatch ONLY after the rewarded ad's reward callback. */
  | { readonly type: 'REVIVE'; readonly now: number }
  ```
- `GameEventMap`: add `revive: { at: number; level: number; lives: number; revivesUsed: number };`

### 1.3 `src/game/machine.ts`
1. In the header transition comment, add the line:
   `GAME_OVER ─REVIVE (revivesLeft > 0)→ LEVEL_INTRO (same level, reviveLives)`
2. In `startRun`, add `revivesUsed: 0,` to the RunContext literal.
3. Inside `step`, next to `enterIntro`, add:
   ```ts
   const gameOver = (run: RunContext): GameState => {
     emit('gameOver', { at: now, levelReached: run.level });
     return {
       tag: 'GAME_OVER',
       levelReached: run.level,
       run,
       revivesLeft: Math.max(0, gameplay.maxRevivesPerRun - run.revivesUsed),
     };
   };
   ```
4. Split the combined `case 'GAME_OVER': case 'VICTORY':` into:
   ```ts
   case 'GAME_OVER':
     if (action.type === 'REVIVE' && state.revivesLeft > 0) {
       const run = { ...state.run, lives: gameplay.reviveLives, revivesUsed: state.run.revivesUsed + 1 };
       emit('revive', { at: now, level: run.level, lives: run.lives, revivesUsed: run.revivesUsed });
       return enterIntro(run);
     }
     if (action.type === 'START_RUN') return startRun(seedOf(action));
     if (action.type === 'QUIT') return { tag: 'MENU' };
     return state;

   case 'VICTORY':
     if (action.type === 'START_RUN') return startRun(seedOf(action));
     if (action.type === 'QUIT') return { tag: 'MENU' };
     return state;
   ```
5. In `case 'RESULT'`, replace the two game-over lines
   (`emit('gameOver', …); return { tag: 'GAME_OVER', levelReached: state.run.level };`) with
   `return gameOver(state.run);`.
6. In `case 'PAUSED'` → `RESTART_LEVEL`, replace the `if (lives <= 0) { emit('gameOver'…); return {…}; }`
   body with `if (lives <= 0) return gameOver({ ...from.run, lives });`.

### 1.4 Test harness `src/game/__tests__/harness.ts`
- Add `'revive'` to `ALL_EVENTS`.
- Add `| 'REVIVE'` to the `input(type: …)` union.

### 1.5 Fix existing assertions in `src/game/__tests__/machine.test.ts`
- Line ~97: `expect(h.game.state).toEqual({ tag: 'GAME_OVER', levelReached: 3 });` →
  `expect(h.game.state).toMatchObject({ tag: 'GAME_OVER', levelReached: 3, revivesLeft: GAMEPLAY.maxRevivesPerRun });`
- Line ~265: `…toEqual({ tag: 'GAME_OVER', levelReached: 1 })` →
  `…toMatchObject({ tag: 'GAME_OVER', levelReached: 1, revivesLeft: GAMEPLAY.maxRevivesPerRun })`

### 1.6 New `src/game/__tests__/revive.test.ts`
Use `Harness`, `GAMEPLAY` and `selectRun`. Helper:
```ts
const T = GAMEPLAY.timing;
const L = GAMEPLAY.startingLives;
/** Lose every life on the current level and land on GAME_OVER. */
function loseAll(h: Harness) {
  const lives = selectRun(h.game.state)!.lives;
  for (let i = 0; i < lives; i++) {
    h.attempt(false);
    if (i < lives - 1) h.next();
  }
  h.wait(T.terminalDelayMs);
}
```
Test cases (each is an `it`):
1. **Revive continues same level with reviveLives.** `h.startRun(); h.attempt(true); h.next();` (level 2),
   `loseAll(h)`. Expect `GAME_OVER`, `levelReached 2`, `revivesLeft 2`. `h.input('REVIVE')`, then expect tag
   `LEVEL_INTRO`, `selectRun` `{ level: 2, lives: GAMEPLAY.reviveLives, revivesUsed: 1 }`, and the events
   `revive` (payload `{ level: 2, lives: 1, revivesUsed: 1 }`) and a new `levelIntro`, in that order at the end of `h.log`.
2. **Revive re-rolls the attempt.** Record `attempt` before losing the last life (`state.run.attempt` at
   GAME_OVER). After REVIVE, `selectRun(...).attempt` === that + 1.
3. **Cap.** Revive twice (loseAll → REVIVE → wait intro → loseAll → REVIVE → wait intro → loseAll). The third
   GAME_OVER has `revivesLeft 0`. `h.input('REVIVE')` leaves the state object identical (`toBe` same reference).
4. **Fresh run resets revives.** After one revive, loseAll, `h.input('START_RUN')`, then
   `selectRun(...).revivesUsed` is 0 and lives are `L`.
5. **REVIVE ignored elsewhere.** In MENU, READY (after `startRun`), PAUSED and VICTORY-less paths, `h.input('REVIVE')`
   returns the same state reference, and no `revive` event is logged.
6. **Game over from restart-in-pause is revivable.** Mirror the existing test at machine.test.ts ~255
   (lose L-1 lives, FILL_PRESS, wait 100, PAUSE, RESTART_LEVEL). Expect `revivesLeft 2`, then REVIVE → LEVEL_INTRO level 1.
7. **Revive does not count as a new game.** No `runStart` event is emitted by REVIVE (`h.events('runStart').length` unchanged).

Run `npm test`. All green. Commit: `feat(game): rewarded revive (REVIVE action, 2 per run)`

---

## Phase 2: Ad layer (`src/ads/`, new folder)

### 2.1 `src/env.d.ts` (new)
```ts
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
```

### 2.2 `src/ads/adConfig.ts`
```ts
/** Ad unit IDs + pacing. Test units unless the build sets VITE_ADS_MODE=production (see vite.config.ts guard). */

const env = import.meta.env;

/** Google's public sample units: always fill, never pay, safe to click. */
export const TEST_AD_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;

const production = env.VITE_ADS_MODE === 'production';

export const AD_CONFIG = {
  production,
  rewardedId: production ? (env.VITE_ADMOB_REWARDED_ID ?? '') : TEST_AD_UNITS.rewarded,
  interstitialId: production ? (env.VITE_ADMOB_INTERSTITIAL_ID ?? '') : TEST_AD_UNITS.interstitial,
  /** Minimum gap between any two interstitials. */
  interstitialMinIntervalMs: 60_000,
  /** Interstitial after clearing every Nth level (not the last). */
  milestoneEvery: 5,
  /** Loaded ads go stale after 1 h; reload a little before. */
  adExpiryMs: 55 * 60_000,
  loadTimeoutMs: 10_000,
  baseRetryMs: 5_000,
  maxRetryMs: 60_000,
  /** Wait after Dismissed for a late Rewarded event. */
  rewardGraceMs: 400,
  /** If show() rejects, wait this long for Dismissed/FailedToShow before giving up. */
  showFallbackMs: 1_500,
} as const;

export const PRIVACY_URL: string = env.VITE_PRIVACY_URL ?? '';
```

### 2.3 `src/ads/AdService.ts`
```ts
export type RewardOutcome = 'rewarded' | 'dismissed' | 'unavailable';
/** off = ads unsupported or not allowed (web, consent) → hide revive UI. */
export type RewardedStatus = 'off' | 'loading' | 'ready' | 'unavailable';

export interface AdService {
  readonly supported: boolean;
  /** True while a full-screen ad covers the app; lifecycle handlers must not pause the game then. */
  readonly fullscreenActive: boolean;
  /** Initialize SDK + UMP consent, then preload. Safe to call more than once. */
  init(): Promise<void>;
  /** Arrow-function members below: stable identities for useSyncExternalStore. */
  subscribe: (fn: () => void) => () => void;
  rewardedStatus: () => RewardedStatus;
  privacyOptionsRequired: () => boolean;
  /** Kick off loading of anything not loaded/loading. */
  ensureLoaded(): void;
  showRewarded(): Promise<RewardOutcome>;
  /** Resolves true if an interstitial was actually shown and closed. Never rejects. */
  showInterstitial(): Promise<boolean>;
  showPrivacyOptions(): Promise<void>;
}
```

### 2.4 `src/ads/noopAds.ts`
```ts
import type { AdService } from './AdService';

/** Web / unsupported platforms: no ads, revive hidden, interstitials skipped. */
export const noopAds: AdService = {
  supported: false,
  fullscreenActive: false,
  init: async () => {},
  subscribe: () => () => {},
  rewardedStatus: () => 'off',
  privacyOptionsRequired: () => false,
  ensureLoaded: () => {},
  showRewarded: async () => 'unavailable',
  showInterstitial: async () => false,
  showPrivacyOptions: async () => {},
};
```

### 2.5 `src/ads/admobAds.ts`
Implement exactly this. Adjust only if typecheck demands it, and keep the behavior the same.
```ts
/**
 * Google Mobile Ads via @capacitor-community/admob: UMP consent, preloading with retry/backoff,
 * rewarded (reward only on the Rewarded event) and interstitial presentation.
 */

import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  PrivacyOptionsRequirementStatus,
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
      this.privacyRequired = info.privacyOptionsRequirementStatus === PrivacyOptionsRequirementStatus.REQUIRED;
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
      this.privacyRequired = info.privacyOptionsRequirementStatus === PrivacyOptionsRequirementStatus.REQUIRED;
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
```

### 2.6 `src/ads/policy.ts` (pure)
```ts
/** Interstitial pacing rules, pure so they're unit-testable. Times are Date.now() ms. */

export type InterstitialTrigger = 'newRun' | 'milestone';

export interface AdPolicyState {
  /** Runs started in this app session (in memory; resets on app restart). */
  readonly runsStarted: number;
  readonly lastInterstitialAt: number | null;
}

export const INITIAL_POLICY: AdPolicyState = { runsStarted: 0, lastInterstitialAt: null };

export function shouldShowInterstitial(
  s: AdPolicyState,
  trigger: InterstitialTrigger,
  now: number,
  minIntervalMs: number,
): boolean {
  if (trigger === 'newRun' && s.runsStarted === 0) return false; // first run of the session is ad-free
  return s.lastInterstitialAt === null || now - s.lastInterstitialAt >= minIntervalMs;
}

/** Level just cleared is a milestone (5, 10, 15 …) but not the final level (victory). */
export function isMilestone(levelCleared: number, every: number, levelCount: number): boolean {
  return every > 0 && levelCleared % every === 0 && levelCleared < levelCount;
}

export const noteRunStarted = (s: AdPolicyState): AdPolicyState => ({ ...s, runsStarted: s.runsStarted + 1 });

export const noteInterstitialShown = (s: AdPolicyState, now: number): AdPolicyState => ({ ...s, lastInterstitialAt: now });
```

### 2.7 `src/ads/coordinator.ts`
```ts
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
```

### 2.8 `src/ads/index.ts`
```ts
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
```
(`export *` from a file with only types is allowed under `verbatimModuleSyntax`. If the linter or TS complains,
use `export type { AdService, RewardOutcome, RewardedStatus } from './AdService';`.)

### 2.9 Tests (`src/ads/__tests__/`)
**`policy.test.ts`**:
- first `newRun` → false. After `noteRunStarted` → true.
- with `lastInterstitialAt = 1000`, min 60_000: now 60_999 → false, 61_000 → true (both triggers).
- `isMilestone`: (5,5,20) true, (10) true, (15) true, (4) false, (20) false, (0 every) false.

**`coordinator.test.ts`**: fake `AdService` built from `noopAds` spread with
`showInterstitial: vi.fn(async () => true)`. Use a mutable `let t = 0; const clock = () => t;`.
- first `beforeRunStart` → not called. Second (t = 1_000) → called once.
- third at t = 30_000 → not called (cooldown). Fourth at t = 61_000 → called.
- if `showInterstitial` resolves `false`, no cooldown is recorded, so the next run at +1 ms tries again.
- `beforeNextLevel(5)` calls it when cooldown is clear. `beforeNextLevel(4)` and `beforeNextLevel(20)` never do.
- milestone right after a new-run interstitial (< 60 s) → not called.

**`admobAds.test.ts`**: mock the plugin with `vi.hoisted` + `vi.mock`:
```ts
const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(d?: unknown) => void>>();
  return {
    listeners,
    fire: (e: string, d?: unknown) => listeners.get(e)?.forEach((f) => f(d)),
    consent: { status: 'OBTAINED', canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED' },
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
  RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward', Dismissed: 'onRewardedVideoAdDismissed', FailedToShow: 'onRewardedVideoAdFailedToShow' },
  InterstitialAdPluginEvents: { Dismissed: 'interstitialAdDismissed', FailedToShow: 'interstitialAdFailedToShow' },
}));
```
Use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` + `h.listeners.clear()` in `afterEach`.
Helper `const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };`.
Create a **new `AdMobAds` per test**. Cases:
1. after `await ads.init(); await flush();` → `rewardedStatus()` is `'ready'`.
2. rewarded + Rewarded event then Dismissed → `'rewarded'`. Steps: `const p = ads.showRewarded(); await flush();`
   `expect(ads.fullscreenActive).toBe(true)`, `h.fire('onRewardedVideoAdReward'); h.fire('onRewardedVideoAdDismissed');`
   `await vi.advanceTimersByTimeAsync(400)`, then `await p` is `'rewarded'` and `fullscreenActive` is false.
3. Dismissed without Rewarded → `'dismissed'`.
4. Dismissed then late Rewarded within 400 ms → `'rewarded'`.
5. FailedToShow → `'unavailable'`.
6. `showRewarded()` before init → `'unavailable'`.
7. consent `canRequestAds: false` (mutate `h.consent` for that test and restore it after) → `rewardedStatus()` `'off'`, and
   `showInterstitial()` resolves false.
8. interstitial Dismissed → `showInterstitial()` resolves true.
9. load failure: make `prepareRewardVideoAd` reject once (`mockRejectedValueOnce`) → status `'unavailable'`. Then
   `await vi.advanceTimersByTimeAsync(5_000); await flush();` → `'ready'`.

Run all checks. Commit: `feat(ads): AdMob service, interstitial policy and coordinator`

---

## Phase 3: Wire ads into the app + UI

### 3.1 `src/app/services.ts`
- `import { AdCoordinator, createAds } from '../ads';` and `import { GameController, LEVEL_COUNT } from '../game';`
  (merge with the existing `GameController` import).
- After `export const sfx = …;` add:
  ```ts
  export const ads = createAds();
  export const adCoordinator = new AdCoordinator(ads, LEVEL_COUNT);
  ```
- Extend the DEV-only debug handle so the screenshot script can solve holds:
  `{ controller, getLevel, solveIdealHoldMs }` (import both from `'../game'`).

### 3.2 `src/main.tsx`
Inside the `.finally(() => { … })` callback, after `createRoot(...).render(...)`, add `void ads.init();`
(import `ads` from `'./app/services'` alongside `progress`). Init never blocks first paint. On native
it shows the UMP consent form over the menu when required.

### 3.3 `src/app/platform.ts`
Import `ads` from `./services`. As the first line of `pauseIfInRun()` add:
```ts
  if (ads.fullscreenActive) return; // a full-screen ad backgrounds the WebView; it isn't a user interruption
```

### 3.4 `src/app/hooks.ts`
```ts
export function useRewardedStatus(): RewardedStatus {
  return useSyncExternalStore(ads.subscribe, ads.rewardedStatus);
}

export function usePrivacyOptionsRequired(): boolean {
  return useSyncExternalStore(ads.subscribe, ads.privacyOptionsRequired);
}
```
(import `ads` from `./services` and `type RewardedStatus` from `'../ads'`.)

### 3.5 `src/App.tsx`
1. Imports: add `useRef`. Add `ads, adCoordinator` from `./app/services`, `usePrivacyOptionsRequired, useRewardedStatus` from
   `./app/hooks`, and `PRIVACY_URL, type RewardOutcome` from `./ads`.
2. In `App()` after the `overlay` state:
   ```ts
   const rewardedStatus = useRewardedStatus();
   const privacyRequired = usePrivacyOptionsRequired();
   /** Synchronous lock so double taps can't start two ads / two runs. */
   const adLock = useRef(false);
   const [adBusy, setAdBusy] = useState(false);
   const [adNotice, setAdNotice] = useState<string | null>(null);

   const withAdLock = useCallback(async (fn: () => Promise<void>) => {
     if (adLock.current) return;
     adLock.current = true;
     setAdBusy(true);
     try {
       await fn();
     } finally {
       adLock.current = false;
       setAdBusy(false);
     }
   }, []);

   const startRun = useCallback(
     () =>
       withAdLock(async () => {
         setAdNotice(null);
         await adCoordinator.beforeRunStart();
         dispatch('START_RUN');
       }),
     [withAdLock, dispatch],
   );

   const continueRun = useCallback(
     () =>
       withAdLock(async () => {
         const s = controller.state;
         if (s.tag !== 'RESULT') return;
         if (s.next === 'nextLevel') await adCoordinator.beforeNextLevel(s.run.level);
         dispatch('CONTINUE');
       }),
     [withAdLock, dispatch],
   );

   const watchAd = useCallback(
     () =>
       withAdLock(async () => {
         if (ads.rewardedStatus() === 'unavailable') {
           ads.ensureLoaded();
           return;
         }
         setAdNotice(null);
         const outcome: RewardOutcome = await ads.showRewarded();
         if (outcome === 'rewarded') controller.dispatch({ type: 'REVIVE', now: now() });
         else
           setAdNotice(
             outcome === 'dismissed'
               ? 'Ad closed early, so no extra life this time.'
               : 'No ad available right now. Try again in a moment.',
           );
       }),
     [withAdLock],
   );

   // Make sure a rewarded ad is loading while the revive offer is on screen.
   useEffect(() => {
     if (state.tag === 'GAME_OVER') ads.ensureLoaded();
   }, [state.tag]);
   ```
   Note: `dispatch` is declared above these. Keep the order so it's defined first.
3. `play`: replace `else dispatch('START_RUN');` with `else void startRun();`.
4. `describe(...)` call: `describe(state, save, play, () => void continueRun(), adBusy)`.
5. TutorialCard `onDone`: replace `dispatch('START_RUN');` with `void startRun();`.
6. GameOverCard usage becomes:
   ```tsx
   <GameOverCard
     levelReached={state.levelReached}
     bestLevel={save.bestLevel}
     revive={{
       status: rewardedStatus,
       revivesLeft: state.revivesLeft,
       max: GAMEPLAY.maxRevivesPerRun,
       busy: adBusy,
       notice: adNotice,
       onWatch: () => void watchAd(),
     }}
     onRestart={() => void startRun()}
     onMenu={() => {
       setAdNotice(null);
       dispatch('QUIT');
     }}
   />
   ```
7. VictoryCard `onPlayAgain={() => void startRun()}`.
8. SettingsPanel usage: add `privacyRequired={privacyRequired}`, `privacyUrl={PRIVACY_URL}` and
   `onPrivacy={() => void ads.showPrivacyOptions()}`.
9. TutorialCard: pass `revivable={ads.supported}`.
10. `describe` signature: add a 5th param `busy: boolean`.
    - `MENU`: `button: busy ? { kind: 'disabled', label: 'Play' } : { kind: 'action', label: 'Play', onActivate: play }`.
    - `RESULT` `nextLevel` branch: `ready && !busy ? {action…} : {disabled…}`.
    - All other states: unchanged.

### 3.6 `src/ui/Overlays.tsx`
1. `import type { RewardedStatus } from '../ads';`
2. Add and export:
   ```ts
   export interface ReviveOffer {
     status: RewardedStatus;
     revivesLeft: number;
     max: number;
     busy: boolean;
     notice: string | null;
     onWatch: () => void;
   }
   ```
3. Replace `GameOverCard` with:
   ```tsx
   export function GameOverCard({
     levelReached,
     bestLevel,
     revive,
     onRestart,
     onMenu,
   }: {
     levelReached: number;
     bestLevel: number;
     revive: ReviveOffer;
     onRestart: () => void;
     onMenu: () => void;
   }) {
     const offer = revive.status !== 'off' && revive.revivesLeft > 0;
     const watchLabel = revive.busy
       ? 'Loading ad…'
       : revive.status === 'ready'
         ? 'Watch ad · +1 life'
         : revive.status === 'loading'
           ? 'Finding an ad…'
           : 'Ad unavailable · tap to retry';
     return (
       <Dialog title="Out of lives" scrim={false} className="card--result">
         <h2 className="card__heading">Out of lives</h2>
         <p className="card__body">
           You reached level {levelReached} of {LEVEL_COUNT}.
         </p>
         {offer && (
           <p className="card__body">
             Your lives have run out. Want an extra life? Watch a short ad and keep going from level {levelReached}.
           </p>
         )}
         <p className="card__meta">
           Best ever: level {Math.max(bestLevel, levelReached)}
           {offer && ` · ${revive.revivesLeft} of ${revive.max} extra lives left this run`}
         </p>
         {revive.notice && (
           <p className="card__notice" role="status">
             {revive.notice}
           </p>
         )}
         <div className="card__actions">
           {offer && (
             <button
               type="button"
               className="cta cta--primary cta--md"
               disabled={revive.busy || revive.status === 'loading'}
               onClick={revive.onWatch}
             >
               {watchLabel}
             </button>
           )}
           <button
             type="button"
             className={offer ? 'cta cta--secondary' : 'cta cta--primary cta--md'}
             disabled={revive.busy}
             onClick={onRestart}
           >
             Restart from level 1
           </button>
           <button type="button" className="cta cta--secondary" disabled={revive.busy} onClick={onMenu}>
             Main menu
           </button>
         </div>
       </Dialog>
     );
   }
   ```
4. `SettingsPanel`: add props `privacyRequired: boolean; privacyUrl: string; onPrivacy: () => void`. Insert right
   after `<PreferenceRows … />`:
   ```tsx
   {(privacyRequired || privacyUrl) && (
     <>
       <hr className="card__divider" />
       <h3 className="card__subheading">Privacy</h3>
       <div className="card__actions card__actions--tight">
         {privacyRequired && (
           <button type="button" className="cta cta--secondary" onClick={onPrivacy}>
             Ad privacy choices
           </button>
         )}
         {privacyUrl && (
           <a className="cta cta--secondary" href={privacyUrl} target="_blank" rel="noopener noreferrer">
             Privacy policy
           </a>
         )}
       </div>
     </>
   )}
   ```
   Change the footer meta text to `Accuracy = how close to the band centre. Game progress is stored only on this device.`
5. `TutorialCard`: add prop `revivable: boolean`. Change the meta line to:
   `20 levels · 3 lives · run out and you restart from level 1{revivable ? ' (or watch an ad for an extra life)' : ''}.`

### 3.7 `src/styles/app.css`
Add after the `.card__meta` rule:
```css
.card__notice {
  margin: 0 0 var(--space-3);
  font-size: var(--text-caption);
  line-height: 16px;
  color: var(--accent);
}

.card__actions--tight {
  margin-top: 0;
}

a.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
```
Add after the `.cta--secondary:active` rule:
```css
.cta--secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
```

### 3.8 Web sanity
`npm run dev` → in the browser: play, lose all lives. The game-over card must look exactly like before
(no revive button, "Restart from level 1" primary), with no console errors. "Play" from the menu starts
instantly. Settings shows no Privacy section unless `VITE_PRIVACY_URL` is set.

Run all checks + `npm run build`. Commit: `feat(ui): rewarded revive offer, interstitial pacing, privacy settings`

---

## Phase 4: Android native config

### 4.1 `android/app/src/main/AndroidManifest.xml`
Inside `<application>`, before `<activity>`:
```xml
        <!-- AdMob app ID: injected from ADMOB_APP_ID at build time (Google's test app ID otherwise). -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="${admobAppId}" />
        <meta-data
            android:name="com.google.android.gms.ads.flag.OPTIMIZE_INITIALIZATION"
            android:value="true" />
        <meta-data
            android:name="com.google.android.gms.ads.flag.OPTIMIZE_AD_LOADING"
            android:value="true" />
```
Under `<!-- Permissions -->` add:
```xml
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />
```

### 4.2 `android/app/build.gradle`
Replace the top keystore block and `defaultConfig` version lines/`signingConfigs`/`buildTypes` as follows. Keep
everything else unchanged.
```groovy
apply plugin: 'com.android.application'

// Release signing, in priority order:
//   1. CI: ANDROID_KEYSTORE_PATH + ANDROID_KEYSTORE_PASSWORD + ANDROID_KEY_ALIAS + ANDROID_KEY_PASSWORD env vars
//   2. Local: android/keystore.properties (git-ignored) — see docs/ANDROID.md
def envKeystore = System.getenv('ANDROID_KEYSTORE_PATH')
def keystorePropsFile = rootProject.file('keystore.properties')
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) keystorePropsFile.withInputStream { keystoreProps.load(it) }
def canSign = envKeystore || keystorePropsFile.exists()

// Google's sample AdMob app ID — test ads only. Release CI must pass the real one via ADMOB_APP_ID.
def admobAppId = System.getenv('ADMOB_APP_ID') ?: (project.findProperty('admobAppId') ?: 'ca-app-pub-3940256099942544~3347511713')
```
In `defaultConfig`:
```groovy
        // CI sets VERSION_CODE (1000 + run number) and VERSION_NAME (from the git tag).
        versionCode ((System.getenv('VERSION_CODE') ?: '1') as Integer)
        versionName (System.getenv('VERSION_NAME') ?: '1.0.0')
        manifestPlaceholders = [admobAppId: admobAppId]
```
`signingConfigs`:
```groovy
    signingConfigs {
        release {
            if (envKeystore) {
                storeFile file(envKeystore)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            } else if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (canSign) signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```

### 4.3 `android/gradle.properties`
Change `org.gradle.jvmargs=-Xmx1536m` to `org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8`.

### 4.4 Sync + build
```powershell
npm run build
npx cap sync android          # adds :capacitor-community-admob to capacitor.settings.gradle / capacitor.build.gradle
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat clean assembleDebug bundleRelease
```
- Both must succeed. `bundleRelease` is unsigned locally (no keystore), which is expected.
- If the build fails with a Kotlin-plugin/version error from the admob module, add `kotlin_version = '2.2.20'` to the
  `ext { }` block in `android/variables.gradle` and rebuild. Do not change anything else for it.
- Verify the placeholder merged: search `android/app/build/intermediates` for `AndroidManifest.xml` files that contain
  `com.google.android.gms.ads.APPLICATION_ID` with value `ca-app-pub-3940256099942544~3347511713`.
- `capacitor.settings.gradle` / `capacitor.build.gradle` are regenerated by `cap sync`. Commit their new content.

### 4.5 Launcher icon + splash (replace Capacitor placeholders)
Create `scripts/make-store-assets.mjs`:
```js
// Rasterizes the brand drop (public/favicon.svg) into Capacitor asset sources and Play Store graphics.
// Run: npm i --no-save sharp@0.34 && node scripts/make-store-assets.mjs
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const BG = '#101f2c';
const WATER = '#229dc2';

/** The favicon drop (24×24 design grid) scaled to `size` px, centred on (cx, cy). */
const drop = (size, cx, cy) => {
  const k = size / 24;
  const t = `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})`;
  return (
    `<path transform="${t}" d="M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Z" fill="${WATER}"/>` +
    `<path transform="${t}" d="M8 15c0 2 1 3 2 3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/>`
  );
};
const svg = (w, h, body, bg = BG) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      (bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : '') +
      body +
      '</svg>',
  );

await mkdir('assets', { recursive: true });
await mkdir('store', { recursive: true });

await sharp(svg(1024, 1024, drop(760, 512, 512))).png().toFile('assets/icon-only.png');
await sharp(svg(1024, 1024, drop(520, 512, 512), null)).png().toFile('assets/icon-foreground.png'); // adaptive safe zone
await sharp(svg(1024, 1024, '')).png().toFile('assets/icon-background.png');
await sharp(svg(2732, 2732, drop(560, 1366, 1366))).png().toFile('assets/splash.png');
await sharp(svg(2732, 2732, drop(560, 1366, 1366))).png().toFile('assets/splash-dark.png');

// Play Console: 512×512 32-bit PNG icon, 1024×500 24-bit feature graphic.
await sharp(svg(512, 512, drop(380, 256, 256))).ensureAlpha().png().toFile('store/icon-512.png');
const title =
  `<text x="470" y="235" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="130" fill="#ffffff">FILL</text>` +
  `<text x="470" y="370" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="130" fill="${WATER}">LINE</text>`;
await sharp(svg(1024, 500, drop(320, 250, 250) + title)).flatten({ background: BG }).removeAlpha().png().toFile('store/feature-graphic.png');

console.log('assets/ and store/ written');
```
Run:
```powershell
npm i --no-save sharp@0.34
node scripts/make-store-assets.mjs
npx --yes @capacitor/assets@3 generate --android --iconBackgroundColor "#101f2c" --iconBackgroundColorDark "#101f2c" --splashBackgroundColor "#101f2c" --splashBackgroundColorDark "#101f2c"
```
Open `store/icon-512.png` and `store/feature-graphic.png` to eyeball them: the drop is centred and the text doesn't overlap the drop.
Rebuild `assembleDebug` to confirm the resources compile. Commit `assets/`, `store/icon-512.png`, `store/feature-graphic.png`,
the script, and the changed `android/app/src/main/res/**`. (`sharp` is **not** added to package.json.)

Commit: `feat(android): AdMob manifest, env-driven signing/versioning, launcher icon + splash`

---

## Phase 5: Website files for Play/AdMob compliance + store listing

### 5.1 `public/privacy.html` (served by Vercel at `/privacy.html`)
A self-contained HTML page (inline CSS, background `#101f2c`, text `#e6eef2`, max-width 680px, system font,
16px side padding, `<meta name="viewport" content="width=device-width, initial-scale=1">`, title "Fill Line – Privacy Policy").
Content sections, in order, with this wording (fill nothing else in):
1. **Fill Line – Privacy Policy.** Effective 28 September 2026. Developer: Ahmed Abdul Rahman. Contact: aarahman803@gmail.com.
2. **What the game stores.** Game progress and settings (best level, accuracy, sound and motion preferences) are
   stored only on your device. The developer doesn't collect, receive or sell any personal information. There are no accounts.
3. **Advertising (Android app).** The Android app shows ads from Google AdMob: optional rewarded video ads for an
   extra life, and full-screen ads between runs. To serve and measure ads and prevent fraud, Google may collect
   and process your device's advertising ID, IP address (approximate location), device and app information, and ad
   interactions. See "How Google uses information from sites or apps that use our services":
   https://policies.google.com/technologies/partner-sites. The web version shows no ads.
4. **Your choices.** In the EEA, UK and Switzerland you're asked for consent through Google's consent message, and you can
   change it any time under Settings → Ad privacy choices. On Android you can reset or delete your advertising ID
   in system Settings → Privacy → Ads. Uninstalling the app removes all locally stored game data.
5. **Children.** The game isn't directed to children under 13, and the developer doesn't knowingly collect data from them.
6. **Changes.** Updates are posted on this page with a new effective date.

### 5.2 `public/app-ads.txt`
Exactly one line (the owner replaces the zeros in the checklist):
```
google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
```

### 5.3 `vite.config.ts` production-ads guard
Rewrite (no semicolons, keep existing comments):
```ts
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const AD_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544'

// Release builds set VITE_ADS_MODE=production; refuse to build them with missing or test ad IDs.
function checkAdsEnv(env: Record<string, string>) {
  if (env.VITE_ADS_MODE !== 'production') return
  for (const key of ['VITE_ADMOB_REWARDED_ID', 'VITE_ADMOB_INTERSTITIAL_ID']) {
    const id = env[key] ?? ''
    if (!AD_UNIT.test(id) || id.startsWith(TEST_PUBLISHER)) throw new Error(`${key} must be a real AdMob ad unit ID when VITE_ADS_MODE=production`)
  }
  if (!/^https:\/\/\S+$/.test(env.VITE_PRIVACY_URL ?? '')) throw new Error('VITE_PRIVACY_URL must be an https URL when VITE_ADS_MODE=production')
}

// `vite build`                  → dist/  (static site for Vercel/Netlify + Capacitor webDir)
// `vite build --mode singlefile` → dist-single/index.html (everything inlined, for one-file sharing)
export default defineConfig(({ mode }) => {
  checkAdsEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
    base: './',
    plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
    build: mode === 'singlefile' ? { outDir: 'dist-single', copyPublicDir: false } : { outDir: 'dist' },
    test: { environment: 'node' },
  }
})
```
Verify: `$env:VITE_ADS_MODE='production'; npm run build` fails with the rewarded-ID message. Then
`Remove-Item Env:VITE_ADS_MODE; npm run build` succeeds.

### 5.4 `.env.example` (new, repo root)
```
# Release (Android) builds only. CI sets these from GitHub secrets/variables. Never commit real values in .env files.
VITE_ADS_MODE=production
VITE_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
VITE_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
VITE_PRIVACY_URL=https://YOUR-DOMAIN/privacy.html
```

### 5.5 Phone screenshots `scripts/capture-screenshots.mjs`
```js
// Play Store phone screenshots (1080×1920) from the dev build.
// Run: npm i --no-save puppeteer@24 ; start `npm run dev -- --port 5199 --strictPort` ; node scripts/capture-screenshots.mjs
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const URL = 'http://localhost:5199/';
const OUT = 'store/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('fill-line/save', JSON.stringify({ version: 1, seenTutorial: true, bestLevel: 7, gamesPlayed: 12 }));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(1500);
await page.screenshot({ path: `${OUT}/01-menu.png` });

const dispatch = (type) =>
  page.evaluate((t) => window.__fillLine.controller.dispatch({ type: t, now: performance.now() }), type);

await dispatch('START_RUN');
await sleep(900);
await page.screenshot({ path: `${OUT}/02-level-intro.png` });
await sleep(1800); // intro is 2300 ms → READY

const hold = await page.evaluate(() => {
  const f = window.__fillLine;
  const s = f.controller.state;
  return f.solveIdealHoldMs(f.getLevel(s.run.level), s.run.setup);
});
await dispatch('FILL_PRESS');
await sleep(hold * 0.65);
await page.screenshot({ path: `${OUT}/03-pouring.png` });
await sleep(hold * 0.35);
await dispatch('FILL_RELEASE');
await sleep(1400);
await page.screenshot({ path: `${OUT}/04-on-the-line.png` });

await browser.close();
console.log(`screenshots written to ${OUT}/`);
```
Run it (dev server in the background, then the script, then stop the server). Check each PNG is 1080×1920 and shows
the intended screen. If 04 shows a miss, rerun: frame timing can jitter by a frame.

### 5.6 `docs/android-release/store-listing.md` (new)
```md
# Play Store listing — Fill Line

**App name (≤30):** Fill Line
**Category:** Games › Casual   **Tags:** Casual, Puzzle, Single player
**Contact email:** aarahman803@gmail.com
**Privacy policy:** https://<your-vercel-domain>/privacy.html

**Short description (≤80):**
Hold to pour. Release on the line. A brutally precise water-filling game.

**Full description:**
How steady is your hand? Hold to pour, let go, and land the water inside the band. Miss and you lose a life.

Fill Line starts simple and gets nasty fast. Over 20 hand-tuned levels:
• the target band moves, shrinks, hides and changes place on every try
• the flow surges without warning
• fog hides the water
• the nozzle keeps dripping after you let go

3 lives. Run out and you start again from level 1, unless you watch an optional ad for an extra life.

• One-thumb controls, portrait
• Works offline
• No account and no sign-up
• Progress saved on your device

Can you fill all 20?

**Graphics:** store/icon-512.png · store/feature-graphic.png · store/screenshots/*.png
```

Commit: `feat(site): privacy policy, app-ads.txt, release env guard, store assets`

---

## Phase 6: GitHub Actions

### 6.1 `.github/workflows/ci.yml`
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  web:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build

  android-debug:
    needs: web
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - uses: android-actions/setup-android@v3
      - run: sdkmanager "platforms;android-36" "build-tools;36.0.0"
      - run: npm ci
      - run: npm run build && npx cap sync android
      - name: Assemble debug APK (test ads)
        working-directory: android
        run: chmod +x gradlew && ./gradlew --no-daemon assembleDebug
      - uses: actions/upload-artifact@v4
        with:
          name: fill-line-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 7
```

### 6.2 `.github/workflows/android-release.yml`
```yaml
name: Android release

on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:
    inputs:
      upload_to_play:
        description: Upload the AAB to Google Play (internal track, draft)
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: android-release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  bundle:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      ADMOB_APP_ID: ${{ secrets.ADMOB_APP_ID }}
      VITE_ADS_MODE: production
      VITE_ADMOB_REWARDED_ID: ${{ secrets.ADMOB_REWARDED_ID }}
      VITE_ADMOB_INTERSTITIAL_ID: ${{ secrets.ADMOB_INTERSTITIAL_ID }}
      VITE_PRIVACY_URL: ${{ vars.PRIVACY_POLICY_URL }}
      ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
      ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
      ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
      ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
      HAS_PLAY_KEY: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON != '' }}
    steps:
      - uses: actions/checkout@v4

      - name: Check release secrets
        run: |
          missing=0
          for v in ADMOB_APP_ID VITE_ADMOB_REWARDED_ID VITE_ADMOB_INTERSTITIAL_ID VITE_PRIVACY_URL \
                   ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
            if [ -z "${!v}" ]; then echo "::error::Missing secret/variable for $v"; missing=1; fi
          done
          case "$ADMOB_APP_ID" in
            ca-app-pub-3940256099942544*) echo "::error::ADMOB_APP_ID is Google's test app ID"; missing=1 ;;
            ca-app-pub-*~*) ;;
            *) echo "::error::ADMOB_APP_ID must look like ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"; missing=1 ;;
          esac
          exit $missing

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - uses: android-actions/setup-android@v3
      - run: sdkmanager "platforms;android-36" "build-tools;36.0.0"

      - run: npm ci
      - run: npm run typecheck && npm run lint && npm test
      - name: Build web (production ads) and sync
        run: npm run build && npx cap sync android

      - name: Version
        run: |
          if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
            VERSION_NAME="${GITHUB_REF_NAME#v}"
          else
            VERSION_NAME="$(node -p "require('./package.json').version")"
          fi
          echo "VERSION_NAME=$VERSION_NAME" >> "$GITHUB_ENV"
          echo "VERSION_CODE=$((1000 + GITHUB_RUN_NUMBER))" >> "$GITHUB_ENV"

      - name: Decode upload keystore
        run: |
          echo "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/upload.jks"
          echo "ANDROID_KEYSTORE_PATH=$RUNNER_TEMP/upload.jks" >> "$GITHUB_ENV"

      - name: Build signed AAB
        working-directory: android
        run: chmod +x gradlew && ./gradlew --no-daemon bundleRelease

      - name: Verify signature
        run: jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab | grep -q "jar verified"

      - uses: actions/upload-artifact@v4
        with:
          name: fill-line-${{ env.VERSION_NAME }}-${{ env.VERSION_CODE }}-aab
          path: android/app/build/outputs/bundle/release/app-release.aab
          if-no-files-found: error
          retention-days: 30

      - name: Upload to Google Play (internal, draft)
        if: env.HAS_PLAY_KEY == 'true' && (startsWith(github.ref, 'refs/tags/v') || inputs.upload_to_play)
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: com.fillline.game
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: internal
          status: draft

      - name: Remove keystore
        if: always()
        run: rm -f "$RUNNER_TEMP/upload.jks"
```
Also make the wrapper executable in git: `git update-index --chmod=+x android/gradlew`.

Validate YAML syntax locally (`npx --yes yaml-lint .github/workflows/*.yml`, or parse with `node -e` via the `yaml` package if
available). The workflows can't be run here. That's expected.

Commit: `ci: web+debug CI and signed AAB release workflow`

---

## Phase 7: Docs

1. **`docs/ANDROID.md`**: rewrite it to cover:
   - JDK 21 (not "17–21").
   - The release path is now CI: push tag `vX.Y.Z` → the workflow builds a signed AAB. The local path still works via `keystore.properties`.
   - Env vars/secrets table (see Appendix B §E).
   - "Ads" section: test IDs by default, `VITE_ADS_MODE=production` + IDs for release, and where each placement is.
   - Replace the "Play Console notes" section. **Contains ads: yes.** Data-safety answers go in Appendix B §G. **Remove the
     old claims "no ads" and "no network access".**
   - Icon regeneration: `node scripts/make-store-assets.mjs` + the `@capacitor/assets` command.
2. **`README.md`**: add one line to the intro ("Android build shows AdMob ads: optional rewarded revive and
   interstitials between runs; the web build has no ads."). Add rows to the Scripts table for the two new scripts (with
   their `npm i --no-save` prerequisites). Add `src/ads/` to the Layout block: `src/ads/  AdMob (Android) / no-op (web), revive + interstitial pacing`.
3. **`docs/android-release/OWNER_CHECKLIST.md`**: already exists (committed with this plan). Leave it unchanged unless a deviation you made changes an owner step, and then update the affected lines.

Commit: `docs: Android release, ads and owner checklist`

---

## Phase 8: Final verification (executor)

1. `npm run typecheck`, `npm run lint`, `npm test` all green. Report the test count.
2. `npm run build` (web, no ads) succeeds. Then `npx cap sync android`, and `.\gradlew.bat assembleDebug bundleRelease` succeed with JDK 21.
3. If an emulator or device is available (`adb devices` lists one): `.\gradlew.bat installDebug`, launch, and check that
   Google **test** ads appear:
   - [ ] First Play of the session → no interstitial, level 1 intro.
   - [ ] Lose all lives → card shows "Watch ad · +1 life" and "2 of 2 extra lives left this run".
   - [ ] Watch the test rewarded ad to the end → same level, HUD shows 1 life.
   - [ ] Lose again → "1 of 2". Close the ad early → notice "Ad closed early…", still GAME_OVER.
   - [ ] Use the second revive, lose again → no offer, "Restart from level 1" is primary.
   - [ ] Restart from level 1 → test interstitial (if ≥60 s since the last one), then level 1 intro. The game is **not** paused afterwards.
   - [ ] Clear level 5 → Next level → interstitial (if the cooldown is clear) → level 6 intro, not paused.
   - [ ] Airplane mode → game over shows "Finding an ad…" then "Ad unavailable · tap to retry". Restart still works instantly.
   - [ ] Android Back on game over → menu. Back on menu → app exits.
   If no device is available, say so in the final report. Don't claim these checks passed.
4. Push the branch and open a PR (`gh pr create --fill --base main`) if `gh` is authenticated. Otherwise leave the commits local
   and say so.
5. Final report: list commits, files added/changed, test count, build results, any deviations from this plan and why,
   and the path `docs/android-release/OWNER_CHECKLIST.md`.

---

## Appendix A: Codex prompt (copied to `docs/android-release/CODEX_PROMPT.md`)

```
You are implementing a fully specified plan in the repository at the current working directory
(Fill Line: React 19 + TypeScript + Vite 8 game wrapped with Capacitor 8 for Android).

Read docs/android-release/PLAN.md completely before touching anything. It is the single source of truth.
It contains exact file paths, exact code, exact copy text, exact commands and a commit message per phase.

Rules:
1. Execute Phases 0 → 8 strictly in order. Do not skip, merge, reorder or "improve" steps.
2. Where the plan gives code, use it verbatim. Deviate only if typecheck, lint, tests or the Android build fail. Then make
   the smallest change that fixes it, keep the behavior the same, and record the deviation (file, reason, change) for the final report.
3. Do not change gameplay tuning, rendering, audio, or anything the plan doesn't mention. No new dependencies other
   than @capacitor-community/admob@8.1.0. sharp and puppeteer are installed with --no-save only when the plan says so.
4. TypeScript constraints: erasableSyntaxOnly + verbatimModuleSyntax. No TS enums, no constructor parameter properties,
   no namespaces, `import type` for type-only imports.
5. After every phase run: npm run typecheck && npm run lint && npm test. All must pass, then commit with the plan's message
   on branch feat/android-play-release. Never commit to or push main.
6. Android builds need JDK 21: set JAVA_HOME to "C:\Program Files\Android\Android Studio\jbr" (Windows) or any
   Temurin 21. Never use JDK 22+.
7. Never create keystores, real AdMob IDs, GitHub secrets, or Play Console entries. Those are the owner's steps in
   Appendix B. Never put real secrets in any file.
8. Never claim a check passed that you did not run. If a device/emulator is unavailable, say the on-device checklist
   was not run.
9. Finish with the Phase 8 report: commits, changed files, test count, build results, deviations, and the path
   docs/android-release/OWNER_CHECKLIST.md.

Start now with Phase 0.
```

---

## Appendix B: Owner checklist (copied to `docs/android-release/OWNER_CHECKLIST.md`)

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
