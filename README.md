# Fill Line

A precision water-filling game. Hold to pour, then release so the water stops inside the band.
20 levels, 5 lives, fully offline. React + TypeScript + Canvas, with Capacitor for Android.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | Unit tests: difficulty curve, state machine, timing, persistence |
| `npm run sim` | Prints the difficulty table and plays a bot run, logging every hook (`-- --sd 250 --fps 30`) |
| `npm run build` | Static site in `dist/` for Vercel/Netlify, also used by Capacitor |
| `npm run build:single` | One self-contained `dist-single/index.html` for sharing without hosting |
| `npm run android:sync` | Build, then copy into `android/` |

## Layout

```
src/game/          Pure game logic, no DOM. Unit-tested.
  config/levels.ts     ← difficulty table: fill rate, band width, band centre per level
  config/gameplay.ts   ← lives, timing gates, target visibility mode
  machine.ts           state machine reducer (discriminated union)
  fillEngine.ts        closed-form fill timing, frame-rate independent
  controller.ts        rAF loop, event hooks, subscribe()
src/theme/         Design layer: tokens.css (colours/type/easing) + theme.ts (geometry, tiers, motion)
src/assets/design/ SVG art from the design pass (swap to re-skin)
src/render/        Canvas water renderer; it only reads game state and listens to hooks
src/ui/, App.tsx   DOM HUD, controls, dialogs
src/persistence/   Local save (localStorage on web / Capacitor Preferences on Android)
src/audio/         Synthesized SFX driven by hooks
android/           Capacitor Android project, see docs/ANDROID.md
```

### Design hooks

```ts
controller.attach({
  onFillStart, onFillStop, onSettleComplete, onLevelPass, onLevelFail,
  onLifeLost, onGameOver, onVictory,
  // also: onStateChange, onRunStart, onLevelIntro, onReady, onPause, onResume
});
```

### Re-skin

To re-skin, replace `src/theme/tokens.css`, the SVGs in `src/assets/design/`, and the tier and motion
tables in `src/theme/theme.ts`. `src/game/` does not import any of these.

## Web preview deploy

Nothing needs configuring: the site is static with relative asset paths.

- **Vercel:** `npm i -g vercel`, then `vercel` (preview) or `vercel --prod`. Vite is auto-detected
  (build `npm run build`, output `dist`).
- **Netlify:** `netlify deploy --dir=dist` after `npm run build`, or connect the repo
  (`netlify.toml` is included).
- **No hosting:** `npm run build:single` and send `dist-single/index.html`.

## Android

See [docs/ANDROID.md](docs/ANDROID.md) for the signed AAB steps.
