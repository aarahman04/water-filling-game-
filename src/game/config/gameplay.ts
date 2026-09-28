/**
 * Rules and pacing that the game logic owns.
 *
 * These are *gates*, not animations: they decide when input is accepted and when the
 * machine advances. The design layer animates inside these windows but never drives
 * them (design-handoff §5: "Life count logic must not be owned by animation-end events").
 * Values default to docs/design-handoff.md §4–5.
 */

export type TargetVisibility =
  /** Band drawn for the whole attempt (product decision, 2026-09-27). */
  | 'always'
  /** Band shown during intro, hidden while filling, revealed on stop (design-handoff §2). */
  | 'previewThenHide';

export interface GameplayConfig {
  readonly startingLives: number;
  /** Rewarded-ad revives allowed per run (GAME_OVER → same level). 0 disables revive. */
  readonly maxRevivesPerRun: number;
  /** Lives granted by one revive. */
  readonly reviveLives: number;
  readonly targetVisibility: TargetVisibility;
  readonly timing: {
    /** LEVEL_INTRO duration before Fill is enabled (intro + band preview + hide). */
    readonly introMs: number;
    /** SETTLING duration after release; result + life change happen at its end. */
    readonly settleMs: number;
    /** After release, "Next level" becomes accepted. */
    readonly passContinueDelayMs: number;
    /** After release, "Try again" becomes accepted. */
    readonly failContinueDelayMs: number;
    /** After release, automatic hand-off to GAME_OVER / VICTORY. */
    readonly terminalDelayMs: number;
  };
}

export const GAMEPLAY: GameplayConfig = {
  startingLives: 3,
  maxRevivesPerRun: 2,
  reviveLives: 1,
  targetVisibility: 'always',
  timing: {
    introMs: 2300,
    settleMs: 480,
    passContinueDelayMs: 700,
    failContinueDelayMs: 800,
    terminalDelayMs: 900,
  },
};
