import { GameController, type FrameScheduler } from '../controller';
import { getLevel, idealHoldMs } from '../difficulty';
import type { GameEvent, GameEventName } from '../types';
import { GAMEPLAY } from '../config/gameplay';

/** Manual frame scheduler: frames fire only when the test advances time. */
export class FakeScheduler implements FrameScheduler {
  private cb: ((ts: number) => void) | null = null;
  request(cb: (ts: number) => void) {
    this.cb = cb;
    return 1;
  }
  cancel() {
    this.cb = null;
  }
  frame(ts: number) {
    const cb = this.cb;
    this.cb = null;
    cb?.(ts);
  }
}

const ALL_EVENTS: GameEventName[] = [
  'stateChange', 'runStart', 'levelIntro', 'ready', 'fillStart', 'fillStop', 'settleComplete',
  'levelPass', 'levelFail', 'lifeLost', 'gameOver', 'victory', 'pause', 'resume',
];

/**
 * Drives a GameController on a simulated clock at a chosen frame interval.
 * `jitter` adds deterministic pseudo-random frame-time noise (dropped/late frames).
 */
export class Harness {
  readonly scheduler = new FakeScheduler();
  readonly game = new GameController(undefined, this.scheduler);
  readonly log: GameEvent[] = [];
  t = 0;
  private seed = 1;

  private readonly frameMs: number;
  private readonly jitter: number;

  constructor(frameMs = 1000 / 60, jitter = 0) {
    this.frameMs = frameMs;
    this.jitter = jitter;
    for (const type of ALL_EVENTS) this.game.on(type, (payload) => this.log.push({ type, payload } as GameEvent));
    this.game.start();
  }

  /** Advance simulated time by `ms`, firing frames along the way. */
  wait(ms: number) {
    const end = this.t + ms;
    while (this.t < end) {
      const noise = this.jitter ? (this.rand() - 0.3) * this.jitter : 0;
      this.t = Math.min(end, this.t + Math.max(1, this.frameMs + noise));
      this.scheduler.frame(this.t);
    }
  }

  /** Input at an exact timestamp between frames (like PointerEvent.timeStamp). */
  input(type: 'START_RUN' | 'FILL_PRESS' | 'FILL_RELEASE' | 'CONTINUE' | 'PAUSE' | 'RESUME' | 'RESTART_LEVEL' | 'QUIT') {
    return this.game.dispatch({ type, now: this.t });
  }

  hold(ms: number) {
    this.input('FILL_PRESS');
    this.wait(ms);
    this.input('FILL_RELEASE');
  }

  startRun() {
    this.input('START_RUN');
    this.wait(GAMEPLAY.timing.introMs);
  }

  /** Play current level: hit (centre) or miss (well below band). Leaves state at RESULT with CTA enabled. */
  attempt(hit: boolean) {
    const s = this.game.state;
    if (s.tag !== 'READY') throw new Error(`expected READY, got ${s.tag}`);
    const cfg = getLevel(s.run.level);
    this.hold(hit ? idealHoldMs(cfg) : 500);
    this.wait(GAMEPLAY.timing.failContinueDelayMs);
  }

  next() {
    this.input('CONTINUE');
    this.wait(GAMEPLAY.timing.introMs);
  }

  events<K extends GameEventName>(type: K) {
    return this.log.filter((e): e is Extract<GameEvent, { type: K }> => e.type === type);
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
