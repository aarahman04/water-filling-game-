/** Read-only views of GameState for the render / UI layers. */

import type { TargetVisibility } from './config/gameplay';
import { getLevel } from './difficulty';
import { pourMsAt, volumeAt } from './fillEngine';
import { bandAt, type BandGeometry } from './twists';
import type { GameState, RunContext } from './types';

/** Authoritative water volume (0–100) at time `now`. Sample this every frame. */
export function selectVolume(state: GameState, now: number): number {
  switch (state.tag) {
    case 'FILLING':
      return volumeAt(state.segment, now);
    case 'READY':
      return state.volume;
    case 'SETTLING':
    case 'RESULT':
      return state.score.volume;
    case 'PAUSED':
      return selectVolume(state.resumeTo, now);
    default:
      return 0;
  }
}

export function selectRun(state: GameState): RunContext | null {
  switch (state.tag) {
    case 'LEVEL_INTRO':
    case 'READY':
    case 'FILLING':
    case 'SETTLING':
    case 'RESULT':
      return state.run;
    case 'PAUSED':
      return state.resumeTo.run;
    default:
      return null;
  }
}

/**
 * Whether the rules permit the band to be shown. Fade timing within LEVEL_INTRO
 * (preview → hide) is the design layer's job; this only says what is *allowed*.
 */
export function selectTargetAllowed(state: GameState, mode: TargetVisibility): boolean {
  const s = state.tag === 'PAUSED' ? state.resumeTo : state;
  switch (s.tag) {
    case 'LEVEL_INTRO':
    case 'SETTLING':
    case 'RESULT':
      return true;
    case 'READY':
    case 'FILLING':
      return mode === 'always' && !getLevel(s.run.level).twists.hidden;
    default:
      return false;
  }
}

/** Band geometry to draw right now (moves / shrinks while pouring, frozen at release). */
export function selectBand(state: GameState, now: number): BandGeometry | null {
  const s = state.tag === 'PAUSED' ? state.resumeTo : state;
  switch (s.tag) {
    case 'LEVEL_INTRO':
      return bandAt(getLevel(s.run.level), s.run.setup, 0);
    case 'READY':
      return bandAt(getLevel(s.run.level), s.run.setup, s.pourMs);
    case 'FILLING':
      return bandAt(getLevel(s.run.level), s.run.setup, pourMsAt(s.segment, now));
    case 'SETTLING':
    case 'RESULT':
      return s.score.band;
    default:
      return null;
  }
}

/** Whether the Fill control should accept a press right now. */
export function selectFillEnabled(state: GameState): boolean {
  return state.tag === 'READY' || state.tag === 'FILLING';
}
