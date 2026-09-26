import type { FillSegment } from './fillEngine';
import type { AttemptScore } from './scoring';

/** Per-run data carried through every in-run state. */
export interface RunContext {
  /** 1-based level number. */
  readonly level: number;
  readonly lives: number;
  /** Any water poured this attempt — makes "Restart level" cost a life (design-handoff §4.I). */
  readonly pouredThisAttempt: boolean;
}

export type ResultNext = 'nextLevel' | 'retry' | 'gameOver' | 'victory';

export type MenuState = { readonly tag: 'MENU' };
export type LevelIntroState = { readonly tag: 'LEVEL_INTRO'; readonly run: RunContext; readonly readyAt: number };
/** Fill enabled. `volume` is non-zero only when resuming an attempt interrupted mid-pour. */
export type ReadyState = { readonly tag: 'READY'; readonly run: RunContext; readonly volume: number };
export type FillingState = { readonly tag: 'FILLING'; readonly run: RunContext; readonly segment: FillSegment };
export type SettlingState = {
  readonly tag: 'SETTLING';
  readonly run: RunContext;
  readonly score: AttemptScore;
  readonly releasedAt: number;
  readonly settleEndsAt: number;
};
export type ResultState = {
  readonly tag: 'RESULT';
  /** Lives already updated for this attempt. */
  readonly run: RunContext;
  readonly score: AttemptScore;
  readonly releasedAt: number;
  readonly next: ResultNext;
  /** nextLevel/retry: CONTINUE accepted from here. gameOver/victory: auto-advance time. */
  readonly advanceAt: number;
};
export type GameOverState = { readonly tag: 'GAME_OVER'; readonly levelReached: number };
export type VictoryState = { readonly tag: 'VICTORY'; readonly livesRemaining: number };

export type PausableState = LevelIntroState | ReadyState | SettlingState | ResultState;
/** FILLING is converted to READY (with the frozen volume) before it is stored here. */
export type PausedState = { readonly tag: 'PAUSED'; readonly resumeTo: PausableState; readonly pausedAt: number };

export type GameState =
  | MenuState
  | LevelIntroState
  | ReadyState
  | FillingState
  | SettlingState
  | ResultState
  | GameOverState
  | VictoryState
  | PausedState;

export type StateTag = GameState['tag'];

/** Inputs to the reducer. Every action carries its own timestamp (performance.now() clock). */
export type GameAction =
  | { readonly type: 'START_RUN'; readonly now: number }
  | { readonly type: 'TICK'; readonly now: number }
  | { readonly type: 'FILL_PRESS'; readonly now: number }
  | { readonly type: 'FILL_RELEASE'; readonly now: number }
  /** "Next level" / "Try again". */
  | { readonly type: 'CONTINUE'; readonly now: number }
  | { readonly type: 'PAUSE'; readonly now: number }
  | { readonly type: 'RESUME'; readonly now: number }
  | { readonly type: 'RESTART_LEVEL'; readonly now: number }
  /** Quit run / main menu. */
  | { readonly type: 'QUIT'; readonly now: number };

export type FillStopReason = 'release' | 'overflow' | 'interrupted';

/** Payloads for the hooks the design / animation / audio layers attach to. */
export interface GameEventMap {
  stateChange: { from: StateTag; to: StateTag; state: GameState; at: number };
  runStart: { at: number };
  levelIntro: { level: number; lives: number; at: number; readyAt: number };
  ready: { level: number; volume: number; at: number };
  fillStart: { level: number; at: number; startVolume: number; rate: number };
  fillStop: { level: number; at: number; volume: number; reason: FillStopReason };
  settleComplete: { level: number; at: number; score: AttemptScore };
  levelPass: { level: number; at: number; score: AttemptScore };
  levelFail: { level: number; at: number; score: AttemptScore };
  lifeLost: { level: number; at: number; livesRemaining: number; cause: 'miss' | 'restart' };
  gameOver: { at: number; levelReached: number };
  victory: { at: number; livesRemaining: number };
  pause: { at: number; from: StateTag };
  resume: { at: number; to: StateTag };
}

export type GameEventName = keyof GameEventMap;
export type GameEvent = { [K in GameEventName]: { type: K; payload: GameEventMap[K] } }[GameEventName];
