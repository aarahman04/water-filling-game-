/**
 * Pure game state machine: (state, action) → { state, events }.
 *
 * No timers, no DOM, no clocks — every action carries its own timestamp and timed
 * transitions happen on TICK when a stored deadline has passed. That keeps the whole
 * game deterministic and unit-testable, and means the design layer only ever *reacts*
 * to emitted events.
 *
 * Transitions:
 *   MENU ─START_RUN→ LEVEL_INTRO ─(introMs)→ READY ─FILL_PRESS→ FILLING
 *   FILLING ─FILL_RELEASE | overflow→ SETTLING ─(settleMs)→ RESULT
 *   RESULT ─CONTINUE→ LEVEL_INTRO (next level or retry)
 *   RESULT ─(terminalDelayMs)→ GAME_OVER | VICTORY
 *   GAME_OVER | VICTORY ─START_RUN→ LEVEL_INTRO (level 1)   ─QUIT→ MENU
 *   LEVEL_INTRO | READY | FILLING | SETTLING | RESULT ─PAUSE→ PAUSED ─RESUME→ (prior)
 * Any action not listed for a state is ignored — that is the input guard.
 */

import { GAMEPLAY, type GameplayConfig } from './config/gameplay';
import { LEVELS, type LevelConfig } from './config/levels';
import { getLevel } from './difficulty';
import { startSegment, stopSegment, volumeAt } from './fillEngine';
import { scoreAttempt } from './scoring';
import type {
  FillingState,
  GameAction,
  GameEvent,
  GameEventMap,
  GameEventName,
  GameState,
  PausableState,
  ResultNext,
  RunContext,
  SettlingState,
} from './types';

export interface MachineConfig {
  readonly levels: readonly LevelConfig[];
  readonly gameplay: GameplayConfig;
}

export const DEFAULT_MACHINE_CONFIG: MachineConfig = { levels: LEVELS, gameplay: GAMEPLAY };

export interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export const INITIAL_STATE: GameState = { tag: 'MENU' };

export function reduce(
  state: GameState,
  action: GameAction,
  config: MachineConfig = DEFAULT_MACHINE_CONFIG,
): Transition {
  const out: GameEvent[] = [];
  const emit = <K extends GameEventName>(type: K, payload: GameEventMap[K]) =>
    out.push({ type, payload } as GameEvent);
  const next = step(state, action, config, emit);
  return { state: next, events: out };
}

type Emit = <K extends GameEventName>(type: K, payload: GameEventMap[K]) => void;

function step(state: GameState, action: GameAction, config: MachineConfig, emit: Emit): GameState {
  const { gameplay, levels } = config;
  const { timing } = gameplay;
  const now = action.now;

  const enterIntro = (run: RunContext): GameState => {
    const readyAt = now + timing.introMs;
    emit('levelIntro', { level: run.level, lives: run.lives, at: now, readyAt });
    return { tag: 'LEVEL_INTRO', run: { ...run, pouredThisAttempt: false }, readyAt };
  };
  const startRun = (): GameState => {
    emit('runStart', { at: now });
    return enterIntro({ level: 1, lives: gameplay.startingLives, pouredThisAttempt: false });
  };

  switch (state.tag) {
    case 'MENU':
      return action.type === 'START_RUN' ? startRun() : state;

    case 'GAME_OVER':
    case 'VICTORY':
      if (action.type === 'START_RUN') return startRun();
      if (action.type === 'QUIT') return { tag: 'MENU' };
      return state;

    case 'LEVEL_INTRO':
      if (action.type === 'TICK' && now >= state.readyAt) {
        emit('ready', { level: state.run.level, volume: 0, at: now });
        return { tag: 'READY', run: state.run, volume: 0 };
      }
      if (action.type === 'PAUSE') return pause(state, now, emit);
      // FILL_PRESS here is deliberately dropped: a press made while disabled must never
      // become a pour when READY arrives — the player has to press again.
      return state;

    case 'READY':
      if (action.type === 'FILL_PRESS') {
        const cfg = getLevel(state.run.level, levels);
        const segment = startSegment(now, state.volume, cfg.fillRate, cfg.surge);
        emit('fillStart', { level: cfg.level, at: now, startVolume: segment.startVolume, rate: cfg.fillRate, surge: cfg.surge });
        return { tag: 'FILLING', run: { ...state.run, pouredThisAttempt: true }, segment };
      }
      if (action.type === 'PAUSE') return pause(state, now, emit);
      return state;

    case 'FILLING':
      if (action.type === 'FILL_RELEASE') return release(state, now, 'release', config, emit);
      if (action.type === 'TICK') {
        const stop = stopSegment(state.segment, now);
        return stop.overflow ? release(state, now, 'overflow', config, emit) : state;
      }
      if (action.type === 'PAUSE') {
        // Interrupted pour: freeze volume, no scoring. Resume requires a fresh press.
        const volume = volumeAt(state.segment, now);
        emit('fillStop', { level: state.run.level, at: now, volume, reason: 'interrupted' });
        return pause({ tag: 'READY', run: state.run, volume }, now, emit, 'FILLING');
      }
      return state;

    case 'SETTLING':
      if (action.type === 'TICK' && now >= state.settleEndsAt) return settle(state, config, emit);
      if (action.type === 'PAUSE') return pause(state, now, emit);
      return state;

    case 'RESULT': {
      const terminal = state.next === 'gameOver' || state.next === 'victory';
      if (action.type === 'PAUSE') return pause(state, now, emit);
      if (now < state.advanceAt) return state;
      if (terminal && action.type === 'TICK') {
        if (state.next === 'victory') {
          emit('victory', { at: now, livesRemaining: state.run.lives });
          return { tag: 'VICTORY', livesRemaining: state.run.lives };
        }
        emit('gameOver', { at: now, levelReached: state.run.level });
        return { tag: 'GAME_OVER', levelReached: state.run.level };
      }
      if (!terminal && action.type === 'CONTINUE') {
        const level = state.next === 'nextLevel' ? state.run.level + 1 : state.run.level;
        return enterIntro({ ...state.run, level });
      }
      return state;
    }

    case 'PAUSED':
      switch (action.type) {
        case 'RESUME':
          return resume(state.resumeTo, state.pausedAt, now, timing.introMs, emit);
        case 'QUIT':
          return { tag: 'MENU' };
        case 'RESTART_LEVEL': {
          const from = state.resumeTo;
          // An already-scored attempt can't be restarted (would erase a miss).
          if (from.tag === 'SETTLING' || from.tag === 'RESULT') return state;
          if (!from.run.pouredThisAttempt) return enterIntro(from.run);
          const lives = from.run.lives - 1;
          emit('lifeLost', { level: from.run.level, at: now, livesRemaining: lives, cause: 'restart' });
          if (lives <= 0) {
            emit('gameOver', { at: now, levelReached: from.run.level });
            return { tag: 'GAME_OVER', levelReached: from.run.level };
          }
          return enterIntro({ ...from.run, lives });
        }
        default:
          return state;
      }
  }
}

function release(
  state: FillingState,
  now: number,
  reason: 'release' | 'overflow',
  { gameplay, levels }: MachineConfig,
  emit: Emit,
): SettlingState {
  const cfg = getLevel(state.run.level, levels);
  const stop = stopSegment(state.segment, now);
  const score = scoreAttempt(stop.volume, cfg, stop.overflow);
  const effectiveReason = stop.overflow ? 'overflow' : reason;
  emit('fillStop', { level: cfg.level, at: stop.stoppedAt, volume: stop.volume, reason: effectiveReason });
  return {
    tag: 'SETTLING',
    run: state.run,
    score,
    releasedAt: stop.stoppedAt,
    settleEndsAt: stop.stoppedAt + gameplay.timing.settleMs,
  };
}

function settle(state: SettlingState, { gameplay, levels }: MachineConfig, emit: Emit): GameState {
  const { run, score, releasedAt } = state;
  const at = state.settleEndsAt;
  const { timing } = gameplay;
  emit('settleComplete', { level: run.level, at, score });

  if (score.hit) {
    emit('levelPass', { level: run.level, at, score });
    const isLast = run.level >= levels.length;
    const next: ResultNext = isLast ? 'victory' : 'nextLevel';
    const advanceAt = releasedAt + (isLast ? timing.terminalDelayMs : timing.passContinueDelayMs);
    return { tag: 'RESULT', run, score, releasedAt, next, advanceAt };
  }

  emit('levelFail', { level: run.level, at, score });
  const lives = run.lives - 1;
  emit('lifeLost', { level: run.level, at, livesRemaining: lives, cause: 'miss' });
  const next: ResultNext = lives <= 0 ? 'gameOver' : 'retry';
  const advanceAt = releasedAt + (lives <= 0 ? timing.terminalDelayMs : timing.failContinueDelayMs);
  return { tag: 'RESULT', run: { ...run, lives }, score, releasedAt, next, advanceAt };
}

function pause(
  resumeTo: PausableState,
  now: number,
  emit: Emit,
  from: GameState['tag'] = resumeTo.tag,
): GameState {
  emit('pause', { at: now, from });
  return { tag: 'PAUSED', resumeTo, pausedAt: now };
}

/** Deadlines exclude paused time; a paused intro replays its full preview. */
function resume(
  s: PausableState,
  pausedAt: number,
  now: number,
  introMs: number,
  emit: Emit,
): GameState {
  const shift = now - pausedAt;
  let next: PausableState;
  switch (s.tag) {
    case 'LEVEL_INTRO':
      next = { ...s, readyAt: now + introMs };
      break;
    case 'READY':
      next = s;
      break;
    case 'SETTLING':
      next = { ...s, releasedAt: s.releasedAt + shift, settleEndsAt: s.settleEndsAt + shift };
      break;
    case 'RESULT':
      next = { ...s, releasedAt: s.releasedAt + shift, advanceAt: s.advanceAt + shift };
      break;
  }
  emit('resume', { at: now, to: next.tag });
  if (next.tag === 'LEVEL_INTRO')
    emit('levelIntro', { level: next.run.level, lives: next.run.lives, at: now, readyAt: next.readyAt });
  return next;
}
