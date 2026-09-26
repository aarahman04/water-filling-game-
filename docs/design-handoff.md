# Fill Line — visual and motion handoff

Version 1 · 27 September 2026 · portrait · HTML/CSS/Canvas + Capacitor

All dimensions are CSS pixels at a 360 × 800 viewport unless stated otherwise. All durations are milliseconds. Colors are sRGB. Numbers below are implementation defaults; difficulty still needs player testing. The accompanying SVGs are usable source artwork. This document defines the complete behavior; the asset sheet is a material reference, not a finished game.

## 1. Direction: an illuminated glass instrument

A clear, thick-walled laboratory cylinder stands on a shallow brushed-metal plinth inside a softly lit blue room. A tall window to the upper left produces one broad reflection and a much thinner bright streak in the glass. Water carries the color. The controls are warm ivory, like instrument labels, so the player's thumb has a clear destination.

The signature is the target appearing as a thin illuminated sleeve around the liquid chamber. It is briefly shown before an attempt, disappears for the pour, then returns around the stopped water. This gives the game an identifiable gesture and keeps the target mechanic readable.

### Palette

| Role | Exact value | Use |
|---|---|---|
| Background top / middle / foot | `#101F2C` / `#213E50` / `#0B1722` | Vertical stops at 0%, 52%, 100% |
| Light behind glass | `#79B9CA`, 16% → 0% | Radial ellipse centered at (164,345), radius (205,290) |
| Panel / raised control | `#142A38` / `#203E4D` | Opaque menus; readable without expensive backdrop filters |
| Main / secondary / muted text | `#F2F6F5` / `#B8CBD3` / `#9DB4C0` | On dark surfaces only |
| UI accent / ink | `#F3DFB3` / `#182C37` | Fill button, primary CTA, band / button label |
| Glass body | `#ADDDEA` at 7% | Baseline tint; variation in supplied rear asset |
| Glass edge / main glint | `#D5F4F8` at 48% / `#F6FEFF` at 76% | Fine outline / narrow upper-left streak |
| Success | `#91E6BA` | Check, band, result title |
| Fail | `#FF998D` | Miss cross, deviation marker, result title |
| Full / empty life | `#F3C2B6` / `#819AA9` | Filled droplet / outline droplet |
| Metal highlight / middle / shadow | `#B6C9CE` / `#5E7987` / `#233B49` | Spout and stand |
| Overlay | `#060F17` at 76% | Behind pause, settings, and confirmations |

Color always has a second signal: check for success, cross and “Too high” or “Too low” for failure, solid versus outline life icons. Do not put white text on the ivory button.

### Typography: two families

| Use | Family / weight | Size / line height | Tracking |
|---|---|---|---|
| Title “FILL LINE” | Barlow Condensed 600 | 64 / 60 | 1.2px |
| Level intro number; victory number | Barlow Condensed 600 | 48 / 48 | 0 |
| Game over / result heading | Barlow Condensed 600 | 32 / 36 | 0.2px |
| Menu heading | Barlow Condensed 600 | 24 / 28 | 0.2px |
| Button / body | Manrope 700 / 500 | 16 / 24 | 0 |
| HUD / helper / settings row | Manrope 600 / 500 | 14 / 20 | 0 |
| Secondary metadata | Manrope 500 | 12 / 16 | 0.3px |

Use tabular numerals for level and lives. Bundle the Google Fonts OFL distributions of [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed) and [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), retaining their included licenses. Export WOFF2 subsets for the game's supported languages. Do not fetch fonts during gameplay. Font files are not included in this asset package; the sheet uses named system fallbacks until fonts are installed.

### Background scene and depth

1. **Far wall:** the blue vertical gradient above, with a large stationary light halo behind the chamber. No detailed scenery competes with the waterline.
2. **Middle distance:** two soft diagonal window reflections: one from x=-70…90 at the top toward x=130…290 at the bottom, one at the right edge. Their lightest point is `#BFDFE2` at 3.5%. Broad gradient edges provide softness without a blur pass.
3. **Floor:** a cool elliptical light pool at (180,605), radius (170,55), `#68B7C9` at 11% fading to transparent. Contact shadow beneath the plinth pins the cylinder to the floor.
4. **Foreground:** the crisp glass and metal edges. A pair of optional caustic arcs under the stand, each 1.5px wide, `#A4ECF4` at 9%, give a refracted-light impression. Their drift is at most 4px over a 6,000ms alternating cycle; opacity varies 5–9%.

Ambient motion runs only on title and results. Freeze background motion from target preview through scoring. No tilt sensor, moving camera, or parallax while aiming. The supplied background SVG is the static baseline; draw the optional caustic arcs separately.

## 2. Cylinder and liquid construction

### Geometry and drawing order

Cylinder SVG viewBox: **192 × 360**. Outer side walls x=8 and x=184. Top ellipse center (96,16), radius (88,11). Usable water chamber: **x=16…176, y=16…336**, width 160, travel 320. Define fill fraction `h=0` at local y=336 and `h=1` at y=16. Centerline water height is `y = 336 − 320h`.

Draw back-to-front:

1. Background and floor pool.
2. Stand (232 × 48), then rear glass (192 × 360).
3. Water clipped to the usable chamber; create a rectangular clip with only the bottom two corners rounded to 8px.
4. Submerged bubbles and refracted edge gradient.
5. Surface ellipse, short white meniscus and the incoming stream; clip their parts inside the chamber. The stream above the rim is a separate unmasked segment.
6. Target band, when permitted by state.
7. Front glass highlights and front rim.
8. Result marker and UI.

The two supplied glass files must share precisely the same position and size. Do not squash the SVG vertically to fit another aspect ratio. Prefer one local stage coordinate system for all water and glass elements.

### Glass treatment

- Outer contour: 1.25px `#D5F4F8` at 48%; front lip: 1.5px `#F6FEFF` at 65%; rear lip at 30%. This avoids a cartoon outline while keeping the empty vessel legible.
- Broad left highlight: x=20…34, y=31…317; transparent → `#F6FEFF` at 48% → transparent. The narrower x=22…24 streak starts at 76% opacity and fades out vertically.
- Right highlight: x=161…170, peak `#C7F0FA` at 28%. Keep the middle of the vessel clear.
- Base is 12px optically thick with two curved highlights. A shallow 208px-wide metal plinth provides a stable visual anchor. No decorative measurement ticks: they would provide permanent hints to the hidden line.
- Refraction is simulated by bright liquid edges and these fixed reflections. Do not use full-scene displacement or animate SVG turbulence filters. The appearance is an art approximation, not a physical fluid simulation.

### Spout

A cropped vertical steel nozzle, 22px wide, is centered on the vessel. Its 64 × 64 asset begins at global (148,148); outlet center is (180,197). The vessel's rim is at y=238, leaving a 41px air gap. A dark elliptical opening, bright left stripe, and narrow collar make the source tangible.

The stream is 4–7px wide by difficulty tier. Horizontal gradient: 0% `#BFEFFF/45%`, 30% `#80DDED/80%`, 55% `#ECFFFF/92%`, 100% `#42B0CF/50%`. Its center follows a sine offset of at most ±1px, 180ms period. It does not wander toward a side wall.

### Target visibility and scoring

**Preview, hide, reveal.** A permanently hidden, uncommunicated target would require guessing. Show the band for 1,000ms after its entrance, fade it out over 160ms, then enable Fill. The helper reads “Remember the line” during preview and “Hold to fill. Release to stop.” once ready. Each retry repeats the preview. Keep preview duration constant across levels.

The band covers the chamber width and its actual acceptance height. Fill: ivory at 16%. Top and bottom boundaries: solid 1.5px ivory. A 1px dashed centerline (3px dash / 5px gap) uses 46% opacity. Two outside brackets, each 6px long and 2px thick, mark the band center. Hidden means fill, rules, brackets, reflections and accessibility descriptions must all stop disclosing target height during the attempt.

Let target center be `c`, full band height be `b`, both normalized to chamber height. A hit is `c − b/2 <= h <= c + b/2`, inclusive. Band geometry is computed from these exact bounds. Surface waves, bubbles, stream tail and surface ellipse are decorative and do not enter scoring. After release, draw a 1px white segment from x=176 to x=188 at the scored mean height so players can see why they hit or missed.

### Water color and layer recipe

The vertical gradient is relative to the **current water depth**, starting at the mean surface and ending at the chamber bottom. Recompute endpoints as the surface rises. At less than 4px depth, use the body color plus the meniscus to avoid a bright flat strip.

| Stop / opacity | Levels 1–5: Mineral | Levels 6–10: Lagoon | Levels 11–15: Glacier | Levels 16–20: Deep |
|---|---|---|---|---|
| 0% / 90% | `#D7F7F5` | `#D9FAF0` | `#E0F6FF` | `#E6EFFF` |
| 6% / 80% | `#76D7E5` | `#7CDDC9` | `#83D8F3` | `#A3CDF3` |
| 40% / 76% | `#229DC2` | `#24A9AE` | `#368FD1` | `#627FC8` |
| 100% / 90% | `#115979` | `#12667C` | `#244F85` | `#334773` |

Apply this additional horizontal edge gradient over the body using normal source-over compositing: `#D5FCFF` at **0%:34%, 7%:10%, 18%:0%, 82%:0%, 93%:10%, 100%:30%**. The first number is the position; the second is opacity. Keep edges inside the clip. All tiers use this same edge gradient.

Surface ellipse: radius x=79, radius y=3; tier's top color at 32%. Meniscus: `#E5FFFF` at 72%, 1.5px, brightest just left of the stream. Add a small impact patch centered under the nozzle, width 18px, maximum opacity 38%. Clear water has a few white microbubbles, not a persistent foam cap.

### Surface behavior

- **Empty:** no visible water body, meniscus, or bubbles.
- **At rest:** y offset `0.35 sin(2πx/160 + 2πt/2400)` px; one low wave across the chamber. At resolved results this becomes completely still after settling.
- **Filling:** use the formula in section 5. Cap total visual surface displacement at 3.5px. The central 8px-wide impact dip may extend 1px deeper for 80ms, but must stay inside that cap.
- **Bubbles:** radius 0.8–2.2px; fill white at 8%, 0.75px edge at 28%; start 12–64px below the surface near x=80±12; rise 22–40px/s, drift ±3px over 500ms. Remove at surface or after 900ms. Spawn rate and live cap depend on tier. Do not spawn below the glass bottom at low fill.
- **Stop:** remove the impact dip within 80ms; one 480ms damped wobble; fade bubbles during the final 180ms. Freeze the mean volume at release. A residual stream tail disappears over 100ms and adds no volume.

## 3. Layout and responsive rules

### Baseline gameplay at 360 × 800

Coordinates below describe a viewport with zero safe-area inset. Safe areas shrink the usable layout region; never add insets to these coordinates and allow the bottom CTA to overflow.

| Element | Bounds / placement |
|---|---|
| Header | x=24…336, y=32…80 |
| Level | x=24, y=36; “LEVEL” 12/16, “01 / 20” 20/24 underneath |
| Lives | five 20 × 24 droplets; 6px gaps; group x=118…242, y=44 |
| Pause | 48 × 48 target x=288, y=32; centered 24px glyph |
| Prompt / result | x=24…336, y=108…144; centered |
| Spout | x=148, y=148, 64 × 64 |
| Cylinder | x=84, y=222, 192 × 360 |
| Stand | x=64, y=570, 232 × 48; behind glass |
| Tier caption | centered x=180, y=628, 12/16 |
| Input helper | x=24…336, y=652, 14/20 |
| Fill / result CTA | x=24, y=680, 312 × 64 |
| Bottom breathing room | 56px |

```text
┌────────────────────────────┐
│ LEVEL 01/20   ◇◇◇◇◇    Ⅱ  │
│      Remember the line     │
│             ║              │
│          ╭─────╮           │
│          │     │           │
│          ├┄┄┄┄┄┤  preview  │
│          │~~~~~│           │
│          │     │           │
│          ╰─────╯           │
│         ━━━━━━━━━          │
│           STEADY           │
│ Hold to fill. Release…     │
│       [    FILL    ]        │
└────────────────────────────┘
```

### Scale and safe area

- Use viewport meta `width=device-width, initial-scale=1, viewport-fit=cover`. Main region uses `100dvh`; fall back to `100vh`. Apply `env(safe-area-inset-*)` to the outer shell.
- Center a portrait game column, maximum **480px wide × 960px high**. Desktop/tablet surroundings use the background's bottom color. Touch controls and text use CSS layout, independently of the illustrated stage.
- Use a three-row layout: header 80px; stage `minmax(0,1fr)`; controls 148px. Outer top padding 24px, bottom padding 32px. At 800px height the stage occupies 516px; its coordinate origin is baseline (0,104).
- Reserve the first 44px of the stage for its prompt. Below it, artwork bounding box is **232 × 470** (spout through stand). Set art scale `s = min(1.25, (availableStageHeight − 44) / 470, (columnWidth − 48) / 232)`. Center horizontally and within the remaining stage height. Scale the glass, water, band and spout together; never change the normalized hit interval when resizing.
- At heights below 700px, top/bottom padding becomes 16px, header 64px, controls 128px; reduce decorative gaps first. Keep Fill at least 56px high, icon controls 48 × 48, and helpers at least 14px. Hide the optional tier caption before shrinking essential text. At widths below 360px, gutters become 16px.
- At 360 × 800 use the coordinate table as the composition target. At other sizes the grid takes precedence over literal coordinates. Do not scale the entire app using a CSS transform: that would shrink hit targets and text.
- Portrait only in the Android wrapper. In a landscape browser retain a centered portrait column; below 480px usable height show “Turn your device upright” with a 48px Settings button and suspend active input. Menus may scroll; gameplay must fit its region.
- Browser zoom and enlarged text may cause menus to scroll. Keep primary actions in the document flow and preserve text rather than clipping.

## 4. Screens, copy and every interaction state

### A. Launch and title

**Native launch:** background `#101F2C`; centered outlined droplet, 64 × 64. No minimum artificial waiting time. Transition to the title when critical art and UI are ready, opacity crossfade 180ms. If assets fail, show “Couldn't load the game” with Retry and keep text/controls usable with font fallbacks.

**Title:** “FILL / LINE” two stacked lines at x=24, y=96, 64/60. Small subtitle at y=232: “Remember. Fill. Release.” Settings button at (288,32). A 144 × 270 cylinder centered at (180,427), 55% full, carries a quiet waterline. CTA at (24,664), 312 × 64: “Play”; helper below: “20 levels · 5 lives”. No gameplay HUD. Title water has 0.35px idle movement only. “Play” starts a fresh run with five lives and level 1. On first run show one short instruction panel: “Watch the band. Hold Fill, then release where the band was.” CTA “Got it” enters level intro.

**Play states:** ready → pressed → starting (disabled during 180ms transition). Settings enters the shared settings panel; Back returns to title. A completed/abandoned run returns to this same title layout; no implicit continuation feature.

### B. Level intro and target preview

Keep the gameplay layout and lives visible; empty the chamber. Display “LEVEL 01” at y=108. Timeline: 0–180ms intro fades in and moves up 8px; 180–480ms hold; 480–660ms replace intro with “Remember the line” and fade band in; 660–1,660ms full band preview; 1,660–1,820ms hide band. At 1,820ms show input instruction and enable Fill. Intro band must not be covered by text.

Button reads “Get ready” and is disabled during intro/preview. A press started while disabled cannot turn into an active fill when preview ends; require a new press. Pause is available. On return from a paused preview, replay the full preview. First-run teaching uses the same timings after dismissal.

### C. Core gameplay

| State | Visible treatment | Input / copy |
|---|---|---|
| Ready | Empty cylinder, no target; five/current lives | “Hold to fill. Release to stop.”; button “Fill” |
| Filling | Rising liquid, stream, bubbles; button darkens slightly and scales to .975 | Button “Release to stop”; helper “Aim for the line you remember” |
| Released | Mean volume freezes; 480ms settle; target returns over 140ms | Button disabled, “Settling…” |
| Result | Fully visible band and exact mean-height marker | Success or fail actions below |
| Paused / backgrounded | Water frozen, input neutralized; opaque menu | Resume, Restart level, Quit to menu, audio controls |

**Input choice:** default is one continuous hold per attempt. A short tap simply produces a small pour, then scores. Offer “Tap to start / tap to stop” in Settings as an explicit alternate control mode. In that mode use button labels “Start filling” and “Stop filling”; there is no hidden double meaning to a tap.

Hold mode: pointerdown starts, pointerup stops; capture the active pointer so release outside the button is still handled. Ignore extra pointers. Use `touch-action: none` on the Fill control only. Space or Enter down/up mirrors hold, ignoring repeated keydown. In tap mode, native button activation toggles on each activation. Avoid both pointerup and synthesized click committing the same attempt. Inputs outside ready/filling states do not change volume.

If pointer capture is cancelled, the app loses focus, the document becomes hidden, or Android Back opens pause, enter the frozen pause state without scoring. Resume shows the paused water volume and requires a fresh Fill press. No time elapses in the simulation while interrupted. For interruption during settle, retain the committed result and finish its visual reveal after resume; never deduct a second life.

### D. Level success / level complete (levels 1–19)

This is one result screen: keep the vessel in place, reveal the band in success green with a check badge above it. At y=108 show “On the line”; helper below the stage reads “Level 01 complete”. HUD life count stays unchanged. Fill becomes **“Next level”**, enabled at 700ms after release. Do not auto-advance before the player has inspected their result. Use the success sequence in section 5. Pressing Next drains the old water during the transition and opens the next level's intro.

### E. Miss with lives remaining

At y=108 display **“Too high”** or **“Too low”**, with a cross in fail color. Keep the target ivory so the comparison is clear; render the actual-height marker coral. A vertical bracket at x=188 connects the actual height to the nearest target edge. Below the stage: “4 lives left”, with the correct pluralization. Button becomes **“Try again”**, enabled at 800ms after release. Same level, same target, preview repeated. No added life on a successful retry.

Ordinary overshoot below the rim does not spill over the glass. Only reaching 100% is an actual overflow: auto-stop, mark miss, show two 2px ribbons outside the front edges for 220ms and at most six drops. Preserve the water level until the player chooses Try again. The reset then drains in 240ms. Underfill uses the same reset; there is no punitive red flood over the screen.

### F. Life lost and restored

Lose the **rightmost filled droplet** at result time. The HUD reserves all five slots, so layout never moves. The lost droplet shrinks and falls, then becomes an empty outline; its accessible label is included in a single polite result announcement, e.g. “Too high. 4 lives remaining.” Do not announce every volume update.

There are **no earned life restores in the specified rules**. Restoration happens only on Play/Restart run/Play again: refill all five slots left to right, 60ms stagger, 220ms per droplet. A short caption “5 lives” lasts 800ms. If a future feature grants a life, reuse the single-icon restoration motion; adding that mechanic is outside this design.

### G. Game over

On the fifth miss, run the ordinary missed-band and last-life feedback once, then begin game-over transition at 900ms after release. Dim stage to 35% opacity over 220ms; present a 312px-wide opaque card centered vertically with 24px padding. Heading “Out of lives” at 32/36; subline “You reached level 12 of 20.” Keep the five empty life outlines visible. Primary **“Restart from level 1”**, 56px high; secondary **“Main menu”**, 48px high; 12px gap. No Try again button and no automatic restart. Restart restores five lives and runs level 1 intro. Back goes to title.

### H. All 20 levels cleared

Level 20 success gets the ordinary band lock and check; at 900ms crossfade to victory over 320ms. Title “20 / 20” at y=112, 48/48; heading “Every drop counted.” at y=172, 32/36. Keep a 144 × 270 hero cylinder centered at (180,395) with its final target and water height preserved. A 20-segment arc around its upper half lights clockwise over 800ms; segments are 2px ivory, arc radius 112px, 5° segment / 3° gap, centered at (180,360), from 190° to 350°. Show “3 lives remaining” with actual remaining lives below. Primary “Play again” at y=656, secondary “Main menu” below. Play again starts level 1 with five lives. Arc is drawn once; no endless confetti.

### I. Pause

Backdrop scrim at 76%, stage frozen. Center a 312px-wide card, radius 24, padding 24. Heading “Paused”; vertical action order: **Resume**, **Restart level**, **Quit to menu**; row height ≥48px, 12px gaps. Below a divider put “Mute all” toggle and a Settings text button. Back/Escape resumes; focus remains inside the dialog and returns to Pause/Fill on exit.

Restart before first input is free. After any filling has occurred, label the action “Restart level · costs 1 life”. Selecting it opens a nested confirmation: “Restart this level? You'll lose 1 life.” Confirm “Restart level”; cancel “Keep playing”. Confirm deducts exactly once, then restarts intro or opens game over when none remain. These rules prevent the menu from becoming a free way to erase a miss. Quit confirms “Leave this run?” / “Progress in this run will be lost.”, with “Leave run” and “Keep playing”. A paused, already scored result offers Resume result and Quit; hide Restart level because the attempt has already ended.

### J. Settings

Same card style as Pause; title “Settings”, Back/Close target 48px. Rows: **Music**, **Sound effects**, **Control mode** (Hold / Tap), **Reduced motion** (System / On). Minimum row height 56px. Music and SFX have separate 44 × 28 switches inside 48px minimum targets; text “On”/“Off” accompanies them. Settings called from a run preserves its paused state. Settings called from title returns to title. Close saves immediately; persist preferences locally. On first run Music and SFX are On, but playback starts only after a user gesture.

Pause “Mute all” is a master override; preserve the individual Music/SFX preferences when it is switched off again. While overridden, Settings states “Muted by Mute all” and offers an Unmute all action. Reduced motion System follows the OS; On always reduces it. Changing Control mode takes effect after resume and requires a fresh activation; it must never start water accidentally.

### Shared control states

- Primary: ivory gradient supplied in SVG; ink label; 20px corners; specified control shadow. Hover: white inset overlay at 6%; press: base `#D9BF8D`, scale .975; disabled: opaque `#364B57`, text `#AEC0C9`, no shadow; focus-visible: 2px ivory ring offset 4px.
- Secondary: `#203E4D`, 1px `#819AA9` at 40%, white text; hover `#294C5D`; press scale .98. Text buttons keep a 48px target.
- Toggles: On track ivory with dark knob; Off track `#526A78` with white knob; 18px knob movement over 130ms. Focus same as buttons. Disabled preference rows include an explanation.
- Result actions become active only at their defined times. Debounce through state transitions, not arbitrary multi-second click locks.

## 5. Motion specification

### Curves and clocks

`out = cubic-bezier(.16,1,.3,1)`; `standard = cubic-bezier(.4,0,.2,1)`; `in = cubic-bezier(.4,0,1,1)`. Use linear interpolation for physical volume; UI easings must never delay input or change scoring. Timings below refer to active simulation time, excluding pause.

Compute mean fill from elapsed active time: `h = min(1, hStart + rate × elapsedSeconds)`. On release, integrate to the input event timestamp before scoring; never score a stale rendered frame. Use one monotonic time basis for input events and animation. [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) supplies animation timestamps; progression must use elapsed time instead of counting frames. Use [Pointer Events capture/cancel handling](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) to preserve hold semantics.

### Exact motion table

| Event | Duration / timing | Values and curve |
|---|---|---|
| Fill rise | Entire hold | Constant rate within each level, linear; no ease-in/out of volume |
| Stream onset | 80ms | Width 0 → tier width using out; volume begins on input, not after this animation |
| Button down | 70ms | scale 1 → .975, standard; transform origin center |
| Button release | 130ms | .975 → 1, out; no bounce |
| Press light | 220ms | one radial ivory/white overlay expands 8 → 80px and opacity .16 → 0, out; clipped to button |
| Stream cutoff | 100ms from release | opacity .85 → 0 and tail contracts upward, in; no added water |
| Stop settle | 480ms | Two damped oscillations, formula below; centerline remains fixed |
| Target reveal | 0–140ms after release | opacity 0 → 1, standard; never translate band vertically |
| Success band | 480–700ms after release | ivory → success; fill alpha .16 → .24 → .16 at 480/580/700ms |
| Success light sweep | 480–840ms | 24px-wide glint crosses vessel x=20 → 172; peak opacity .18; linear; clipped to glass |
| Success check | 520–700ms | opacity 0 → 1; scale .85 → 1, out; glyph remains static afterward |
| Success drops | 520–1,120ms | Six 2–4px droplets outside glass rise 12–24px then fall 8px; alpha .5 → 0; no collision simulation |
| Miss shake | 480–660ms | Stage x keyframes 0,-4,+3,-2,+1,0px at 0,30,65,100,140,180ms; linear between keys |
| Miss edge tint | 480–700ms | Outer glass fail-color overlay alpha 0 → .22 → 0 at 480/550/700ms |
| Life lost | 500–800ms | 0–70ms scale 1 → 1.18; 70–300ms scale 1.18 → .55, y 0 → 8px, opacity 1 → 0; outline underneath fades in during last 100ms |
| Life restored | 220ms / icon | scale .8 → 1 and alpha 0 → 1, out; 60ms stagger left to right; no overshoot |
| Overflow | Starts at h=1; 220ms | Two outside ribbons retract downward 18px and fade; six drops max, 3px radius max |
| Reset drain | 240ms after retry/next accepted | Visual h → 0 using in; judging already complete; fade stream/bubbles to 0 |
| Between levels | 320ms | 0–160ms old captions fade out/up 8px; 80–320ms drain; glass stays fixed; at 320ms begin full next intro timeline |
| Menu open / close | 180ms / 140ms | opacity 0 ↔ 1; card y=12 ↔ 0px with out / in; scrim opacity follows |
| Title → play | 180ms | Title and CTA fade out; new HUD fades in; then level intro starts |
| Game over | Starts 900ms after release; 220ms | Stage opacity 1 → .35, card alpha 0 → 1, y=12 → 0 |
| Victory transition | Starts 900ms after release; 320ms | Crossfade; then 800ms sequential arc illumination |

**Settle formula:** retain the actual surface deformation at release, `d0(x)`, relative to the fixed mean. For `u = elapsed / 480`, `0 <= u <= 1`, draw `d(x,u) = d0(x) × exp(−4u) × cos(4πu) × (1−u)`. This gives two oscillations, strong damping, continuity at release, and exactly zero deformation at the endpoint. The 3px surface ellipse flattens to 2px over the same interval. Waves reaching the chamber boundaries are clipped. No whole-cylinder rubber squash.

**Filling wave:** for local chamber x in [0,160], time t in seconds, use `d(x,t) = A × [0.75 sin(2πx/160 + 2πft) + 0.25 sin(6πx/160 − 2π × 1.7f × t)]`. Both harmonics integrate to zero across the width, keeping the apparent mean stable. Use tier-specific A/f below; normalize any additional impact dip so total displacement remains within 3.5px and the mean stays at the scored height. When height is below 6px or above 314px, multiply wave amplitude by `min(1, heightPx/6, (320-heightPx)/6)` to prevent impossible rim/bottom crossings.

**Feedback priority:** input → volume lock → target reveal → settle → result/life → CTA. Text appears at 480ms; lives decrement once at that same state transition, while the icon animation begins 20ms later. Overflow already determines failure but still follows this result timing. Life count logic must not be owned by animation-end events.

### Reduced motion and optional audio

Reduced motion preserves the same intro, scoring, result and CTA timing. Set wave amplitude to zero; stop bubbles, ripple, caustic drift, particle drops and shakes; use immediate button color change and 100ms opacity transitions. Keep water rising linearly and show the actual-height marker. Replace life movement with a 150ms fill-to-outline fade. The 480ms settling interval remains, with still water and “Settling…” copy, so mode choice does not alter pacing. Follow [the OS reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) when Settings is System.

Optional audio direction: a quiet continuous pour loop fades in over 40ms and out over 100ms; a 120ms soft glass ping at the 480ms success reveal; a 100ms low dry tap on failure; no alarm loop. Muting cuts output within 40ms. These are sound briefs, not included audio assets. Native haptics are optional: one short 10ms pulse on stop if enabled and available; no haptic dependency in browser behavior.

## 6. Difficulty that can be seen and felt

Difficulty is indicated **before** the pour and through water behavior, never by revealing proximity to the hidden target. The band does not flash during filling. No heartbeat or urgency color tied to target distance.

For level `L` (1…20):

- `rate = 0.105 + 0.0075 × (L−1)` chamber heights per second.
- `band = 0.100 − 0.003 × (L−1)` full normalized acceptance width.
- Time spent inside the band while filling is `band / rate` seconds.

| Levels | Caption / color | Stream width | Wave A / f | Bubble spawn / live cap | Endpoints: speed; band in 320px chamber |
|---|---|---|---|---|---|
| 1–5 | STEADY / `#B8CBD3` | 4px | 1.2px / 1.2Hz | 4/s / 6 | .105→.135/s; 32→28.16px |
| 6–10 | QUICK / `#A6DCD6` | 5px | 1.8px / 1.6Hz | 6/s / 8 | .1425→.1725/s; 27.2→23.36px |
| 11–15 | FAST / `#C0D6F6` | 6px | 2.4px / 2.0Hz | 8/s / 10 | .18→.21/s; 22.4→18.56px |
| 16–20 | PRECISE / `#F3DFB3` | 7px | 3.0px / 2.4Hz | 10/s / 12 | .2175→.2475/s; 17.6→13.76px |

Level 2 has a 31.04px band and approximately **862ms** inside it. Level 18 has a 15.68px band and approximately **211ms** inside it. Late water is darker and more active, and the preview band visibly narrows. Keep preview duration, minimum input targets, and result dwell times constant.

Use these target center fractions for the first balance pass, indexed by level 1…20:

`[.48, .62, .40, .70, .55, .66, .44, .74, .52, .60, .46, .72, .57, .64, .42, .69, .54, .76, .59, .68]`

Targets are fixed per level, including retries, to make improvement learnable. All bands fit inside the cylinder and avoid instant taps near the base. These proposed rates and widths should be editable together in one level configuration; do not bury the difficulty values in artwork or animation code. If player testing requires easier late levels, widen acceptance bands first, keeping the art synchronized with their new bounds.

## 7. Asset delivery and implementation contract

### Included files

| File | ViewBox / logical size | Integration |
|---|---|---|
| `assets/background.svg` | 360 × 800 | Full-column background; cover crop allowed |
| `assets/glass-back.svg` | 192 × 360 | Behind water; transparent |
| `assets/glass-front.svg` | 192 × 360 | Above water; transparent, pointer-events none |
| `assets/water-reference.svg` | 160 × 320 | Mineral material sample at 55% fill; replace with dynamic Canvas drawing |
| `assets/spout.svg` | 64 × 64 | Opaque metal, transparent surroundings |
| `assets/stand.svg` | 232 × 48 | Includes soft contact shadow |
| `assets/target-zone.svg` | 160 × 32 | Stretch only height to exact hit band; uses non-scaling strokes |
| `assets/button-fill.svg` | 312 × 64 | Text-free button skin; use semantic HTML button and real text |
| `assets/icons.svg` | 288 × 32 contact sheet; symbols 24 × 24 | IDs: life, life-empty, pause, check, close, settings, sound, music, restart |
| `tokens.css` | N/A | Palette, typography, space, radius, shadow, duration, easing, tier overrides |
| `index.html` | N/A | Local material and gameplay composition sheet with CSS ambient-motion example |

The icon sheet includes visible previews as well as reusable symbols. Import only its `<defs>` into a hidden SVG sprite and use `<svg viewBox="0 0 24 24"><use href="#pause"/></svg>` for a glyph. Set `color` on the instance. For a muted sound glyph, overlay a 1.75px diagonal slash from (4,4) to (20,20); pair it with an explicit accessible name. Do not ship the contact sheet as a single UI image.

SVGs use gradients and paths only, without filter dependencies, embedded raster data, or text. Prefixes make supplied gradient IDs unique; prefix instance IDs as well if inlining the same SVG more than once. Preserve the viewBox and alpha; sRGB export, no baked background except background.svg. Scoring band SVG height must match the mathematical interval even when it is fractional pixels.

### Raster policy and exact export sizes

No PNG is required for the core art. If an integration needs raster fallbacks, export the same SVG sources to transparent PNG at the sizes below; these are specifications, not included PNG files.

| Asset | 1× / mdpi | 2× / xhdpi | 3× / xxhdpi |
|---|---|---|---|
| Background, opaque | 360 × 800 | 720 × 1600 | 1080 × 2400 |
| Glass back or front | 192 × 360 | 384 × 720 | 576 × 1080 |
| Water reference only | 160 × 320 | 320 × 640 | 480 × 960 |
| Spout | 64 × 64 | 128 × 128 | 192 × 192 |
| Stand | 232 × 48 | 464 × 96 | 696 × 144 |
| Button skin | 312 × 64 | 624 × 128 | 936 × 192 |
| Individual UI icon | 24 × 24 | 48 × 48 | 72 × 72 |

For native resource folders, hdpi is 1.5× and xxxhdpi is 4×; add those only if exporting native assets. In the web view, choose raster density using CSS size and devicePixelRatio/srcset rather than inferring an Android resource bucket. Keep target bands and active water vector/Canvas so acceptance edges stay exact. Launcher/store icons are a separate packaging deliverable, not supplied gameplay artwork.

### Rendering budget

- DOM for text, buttons and dialogs; static SVG for materials; one transparent Canvas for animated liquid, bubbles, stream and result decorations. No WebGL requirement or new animation library.
- Target 60fps on the intended Android device; this is a target, not a measured claim. Cap the Canvas backing scale at `min(devicePixelRatio,2)`, resize only on actual layout change. Base 232 × 470 dynamic area at 2× is 464 × 940; permit a padded region for spills and success drops.
- Reuse gradients while their stops stay unchanged; recompute their geometry when water depth changes. Draw no more than 12 bubbles and six result droplets. Avoid DOM nodes per particle, animated blur, and per-frame layout reads.
- Put all animated drawing in one requestAnimationFrame loop; stop it when inactive, paused, or backgrounded. Cache static SVGs/images. If rendering cannot keep up, remove bubbles and caustics first; water height and input timing stay accurate. Do not use a CSS height transition to smooth authoritative fill level.
- Assets and UI must remain usable offline once bundled. Bundle fonts before release. Canvas is visual only: HTML supplies level, lives, instructions, actions and live result announcements.

## 8. Developer acceptance checklist

These checks define approval for the eventual implementation; they are not a claim that a game has been built or device-tested here.

- At levels 1, 10 and 20, preview/reveal band bounds match scoring exactly, including boundary hits. Resize during a paused attempt does not change normalized volume.
- Release time, not the next painted frame or the end of the wobble, determines volume. The same held duration produces the same result at 30/60/120Hz render rates.
- Disabled preview presses do not start pouring; pointer release outside, keyboard repeat, extra pointers, backgrounding and tap mode cannot double-score or continue pouring invisibly.
- Five misses cause game over; success keeps lives; the next run restores five. Paid restart deducts once and handles the last life. Resume after a committed result does not deduct again.
- True overflow occurs only at the rim. A high miss below the rim keeps a truthful water height until reset.
- Readable and unclipped at 320 × 640, 360 × 800, 412 × 915, 768 × 1024, desktop portrait column, and with safe-area insets. Controls retain 48px targets. Menus handle text enlargement.
- Reduced motion removes shake and decorative motion while keeping timing and scoring. Keyboard focus is visible, modals trap/restore focus, and results have text plus shape as well as color.
- Profile on a representative mid-range Android phone before calling the 60fps target validated. Check the intended WebView build and browser preview separately.

## 9. Delivery status

Included: complete design specification, exact motion timelines, difficulty defaults, CSS design tokens, nine SVG source files, local asset sheet, and progress record. No playable game, packaged fonts, PNG fallbacks, audio files, Capacitor project, or physical-device benchmark is included. These limits do not change the design contract above.
