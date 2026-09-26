/**
 * Stateful shell around the pure reducer: holds current state, fans events out to
 * hooks, and drives timed transitions from a requestAnimationFrame loop.
 */

import { GameEmitter, type GameHooks } from './events';
import { DEFAULT_MACHINE_CONFIG, INITIAL_STATE, reduce, type MachineConfig } from './machine';
import { selectVolume } from './selectors';
import type { GameAction, GameEventMap, GameEventName, GameState } from './types';

/** Upper bound on chained timed transitions resolved inside one dispatch (e.g. after a long frame hitch). */
const MAX_TICK_CHAIN = 8;

export interface FrameScheduler {
  request(cb: (timestamp: number) => void): number;
  cancel(id: number): void;
}

const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export interface FrameInfo {
  readonly now: number;
  readonly state: GameState;
  readonly volume: number;
}

export class GameController {
  private _state: GameState = INITIAL_STATE;
  private readonly emitter = new GameEmitter();
  private readonly frameListeners = new Set<(frame: FrameInfo) => void>();
  private readonly changeListeners = new Set<() => void>();
  private rafId: number | null = null;
  readonly config: MachineConfig;
  private readonly scheduler: FrameScheduler;

  constructor(config: MachineConfig = DEFAULT_MACHINE_CONFIG, scheduler: FrameScheduler = rafScheduler) {
    this.config = config;
    this.scheduler = scheduler;
  }

  get state(): GameState {
    return this._state;
  }

  volumeAt(now: number): number {
    return selectVolume(this._state, now);
  }

  on<K extends GameEventName>(type: K, fn: (payload: GameEventMap[K]) => void): () => void {
    return this.emitter.on(type, fn);
  }

  attach(hooks: GameHooks): () => void {
    return this.emitter.attach(hooks);
  }

  /** Called after every state change (any tag or payload). Shaped for React's useSyncExternalStore. */
  subscribe = (fn: () => void): (() => void) => {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  };

  getState = (): GameState => this._state;

  /** Per-frame callback for renderers; receives the sampled volume. */
  onFrame(fn: (frame: FrameInfo) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  dispatch(action: GameAction): GameState {
    this.apply(action);
    // Resolve any deadlines already passed at this timestamp (e.g. SETTLING → RESULT → GAME_OVER after a hitch).
    for (let i = 0; i < MAX_TICK_CHAIN; i++) {
      if (!this.apply({ type: 'TICK', now: action.now })) break;
    }
    return this._state;
  }

  tick(now: number): void {
    this.dispatch({ type: 'TICK', now });
    if (this.frameListeners.size === 0) return;
    const frame: FrameInfo = { now, state: this._state, volume: this.volumeAt(now) };
    for (const fn of this.frameListeners) fn(frame);
  }

  start(): void {
    if (this.rafId !== null) return;
    const loop = (ts: number) => {
      this.rafId = this.scheduler.request(loop);
      this.tick(ts);
    };
    this.rafId = this.scheduler.request(loop);
  }

  stop(): void {
    if (this.rafId === null) return;
    this.scheduler.cancel(this.rafId);
    this.rafId = null;
  }

  /** Returns true if the state object changed. */
  private apply(action: GameAction): boolean {
    const prev = this._state;
    const { state, events } = reduce(prev, action, this.config);
    if (state === prev) return false;
    this._state = state;
    for (const e of events) this.emitter.emit(e);
    if (state.tag !== prev.tag) {
      this.emitter.emit({ type: 'stateChange', payload: { from: prev.tag, to: state.tag, state, at: action.now } });
    }
    for (const fn of this.changeListeners) fn();
    return true;
  }
}
