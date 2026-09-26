import { describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../config/gameplay';
import { getLevel, idealHoldMs } from '../difficulty';
import { INITIAL_STATE, reduce } from '../machine';
import { selectRun, selectTargetAllowed, selectVolume } from '../selectors';
import { Harness } from './harness';

const T = GAMEPLAY.timing;
const R1 = getLevel(1).fillRate;
const L = GAMEPLAY.startingLives; // level 1 has no surge: volume = R1 × seconds

describe('state machine — core flow', () => {
  it('walks MENU → LEVEL_INTRO → READY → FILLING → SETTLING → RESULT → LEVEL_INTRO', () => {
    const h = new Harness();
    expect(h.game.state.tag).toBe('MENU');
    h.input('START_RUN');
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    h.wait(T.introMs - 20);
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    h.wait(40);
    expect(h.game.state.tag).toBe('READY');
    h.input('FILL_PRESS');
    expect(h.game.state.tag).toBe('FILLING');
    h.wait(idealHoldMs(getLevel(1)));
    h.input('FILL_RELEASE');
    expect(h.game.state.tag).toBe('SETTLING');
    h.wait(T.settleMs);
    expect(h.game.state.tag).toBe('RESULT');
    h.wait(T.passContinueDelayMs);
    h.input('CONTINUE');
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    expect(selectRun(h.game.state)?.level).toBe(2);
    expect(h.events('stateChange').map((e) => e.payload.to)).toEqual([
      'LEVEL_INTRO', 'READY', 'FILLING', 'SETTLING', 'RESULT', 'LEVEL_INTRO',
    ]);
  });

  it('fires design hooks in feedback-priority order', () => {
    const h = new Harness();
    h.startRun();
    h.attempt(false);
    const order = h.log.filter((e) => e.type !== 'stateChange').map((e) => e.type);
    expect(order).toEqual([
      'runStart', 'levelIntro', 'ready', 'fillStart', 'fillStop', 'settleComplete', 'levelFail', 'lifeLost',
    ]);
  });

  it('decides pass/fail and deducts the life at settle end, not on release', () => {
    const h = new Harness();
    h.startRun();
    h.hold(500);
    expect(h.events('lifeLost')).toHaveLength(0);
    h.wait(T.settleMs - 10);
    expect(h.events('lifeLost')).toHaveLength(0);
    h.wait(20);
    expect(h.events('lifeLost')).toHaveLength(1);
    expect(selectRun(h.game.state)?.lives).toBe(L - 1);
  });

  it('keeps lives on pass, retries the same level on fail', () => {
    const h = new Harness();
    h.startRun();
    h.attempt(false);
    h.next();
    expect(selectRun(h.game.state)).toMatchObject({ level: 1, lives: L - 1 });
    h.attempt(true);
    h.next();
    expect(selectRun(h.game.state)).toMatchObject({ level: 2, lives: L - 1 });
  });

  it('freezes volume at release and reports it through SETTLING/RESULT', () => {
    const h = new Harness();
    h.startRun();
    h.hold(2000);
    expect(selectVolume(h.game.state, h.t + 5000)).toBeCloseTo(R1 * 2, 9);
    h.wait(T.settleMs);
    expect(selectVolume(h.game.state, h.t)).toBeCloseTo(R1 * 2, 9);
  });
});

describe('state machine — lives, game over, victory', () => {
  it('game over on the last miss, then hard reset to level 1 with full lives', () => {
    const h = new Harness();
    h.startRun();
    h.attempt(true);
    h.next();
    h.attempt(true);
    h.next(); // level 3
    for (let i = 0; i < L - 1; i++) {
      h.attempt(false);
      h.next();
    }
    h.attempt(false); // last life
    expect(h.game.state.tag).toBe('RESULT');
    expect(h.events('gameOver')).toHaveLength(0);
    h.wait(T.terminalDelayMs);
    expect(h.game.state).toEqual({ tag: 'GAME_OVER', levelReached: 3 });
    expect(h.events('gameOver')[0].payload).toMatchObject({ levelReached: 3 });

    h.input('CONTINUE'); // not a valid action on GAME_OVER
    expect(h.game.state.tag).toBe('GAME_OVER');
    h.input('START_RUN');
    expect(selectRun(h.game.state)).toMatchObject({ level: 1, lives: L });
  });

  it('victory after passing level 20', () => {
    const h = new Harness();
    h.startRun();
    for (let l = 1; l <= 20; l++) {
      expect(selectRun(h.game.state)?.level).toBe(l);
      h.attempt(true);
      if (l < 20) h.next();
    }
    h.wait(T.terminalDelayMs);
    expect(h.game.state).toEqual({ tag: 'VICTORY', livesRemaining: L });
    expect(h.events('levelPass')).toHaveLength(20);
    expect(h.events('victory')).toHaveLength(1);
  });

  it('overflow auto-stops at exactly 100% and counts as a miss', () => {
    const h = new Harness();
    h.startRun();
    const pressAt = h.t;
    h.input('FILL_PRESS');
    h.wait(20_000); // never released
    const stop = h.events('fillStop')[0].payload;
    expect(stop.reason).toBe('overflow');
    expect(stop.volume).toBe(100);
    expect(stop.at).toBeCloseTo(pressAt + (100 / R1) * 1000, 6);
    expect(h.events('levelFail')[0].payload.score.overflow).toBe(true);
  });
});

describe('state machine — input guards', () => {
  it('ignores a press during LEVEL_INTRO and does not auto-start when READY arrives', () => {
    const h = new Harness();
    h.input('START_RUN');
    h.wait(500);
    h.input('FILL_PRESS');
    h.wait(T.introMs);
    expect(h.game.state.tag).toBe('READY');
    h.input('FILL_RELEASE'); // release of that stale press
    expect(h.game.state.tag).toBe('READY');
    expect(h.events('fillStart')).toHaveLength(0);
  });

  it('ignores presses/releases during SETTLING and RESULT (no double-score)', () => {
    const h = new Harness();
    h.startRun();
    h.hold(1000);
    for (const a of ['FILL_PRESS', 'FILL_RELEASE', 'FILL_PRESS', 'CONTINUE'] as const) h.input(a);
    expect(h.game.state.tag).toBe('SETTLING');
    h.wait(T.settleMs);
    h.input('FILL_PRESS');
    h.input('FILL_RELEASE');
    expect(h.game.state.tag).toBe('RESULT');
    expect(h.events('fillStart')).toHaveLength(1);
    expect(h.events('lifeLost')).toHaveLength(1);
  });

  it('only accepts CONTINUE once the result CTA delay has passed', () => {
    const h = new Harness();
    h.startRun();
    h.hold(500);
    h.wait(T.settleMs + 50);
    h.input('CONTINUE'); // 530ms after release, fail CTA opens at 800ms
    expect(h.game.state.tag).toBe('RESULT');
    h.wait(T.failContinueDelayMs);
    h.input('CONTINUE');
    h.input('CONTINUE'); // double-tap must not skip the intro
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    expect(h.events('levelIntro')).toHaveLength(2);
  });

  it('ignores unrelated actions in MENU', () => {
    for (const type of ['TICK', 'FILL_PRESS', 'CONTINUE', 'PAUSE', 'RESUME'] as const) {
      expect(reduce(INITIAL_STATE, { type, now: 0 }).state).toBe(INITIAL_STATE);
    }
  });
});

describe('state machine — pause / interruption', () => {
  it('pausing mid-pour freezes volume without scoring; resume needs a fresh press', () => {
    const h = new Harness();
    h.startRun();
    h.input('FILL_PRESS');
    h.wait(1000);
    h.input('PAUSE');
    expect(h.events('fillStop')[0].payload.reason).toBe('interrupted');
    h.wait(60_000); // no simulated time passes while paused
    expect(selectVolume(h.game.state, h.t)).toBeCloseTo(R1, 9);
    h.input('RESUME');
    expect(h.game.state).toMatchObject({ tag: 'READY' });
    expect(selectVolume(h.game.state, h.t)).toBeCloseTo(R1, 9);
    h.hold(500);
    expect(h.events('fillStop')[1].payload.volume).toBeCloseTo(R1 * 1.5, 9);
    expect(h.events('lifeLost')).toHaveLength(0);
  });

  it('pause during SETTLING keeps the committed result and never double-deducts', () => {
    const h = new Harness();
    h.startRun();
    h.hold(500);
    h.wait(100);
    h.input('PAUSE');
    h.wait(10_000);
    h.input('RESUME');
    h.wait(T.settleMs - 100 - 20);
    expect(h.game.state.tag).toBe('SETTLING'); // paused time excluded
    h.wait(40);
    expect(h.game.state.tag).toBe('RESULT');
    h.input('PAUSE');
    h.input('RESUME');
    expect(h.events('lifeLost')).toHaveLength(1);
  });

  it('pause during intro replays the full preview on resume', () => {
    const h = new Harness();
    h.input('START_RUN');
    h.wait(1500);
    h.input('PAUSE');
    h.input('RESUME');
    h.wait(T.introMs - 20);
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    h.wait(40);
    expect(h.game.state.tag).toBe('READY');
  });

  it('restart level is free before pouring, costs exactly one life after', () => {
    const h = new Harness();
    h.startRun();
    h.input('PAUSE');
    h.input('RESTART_LEVEL');
    expect(selectRun(h.game.state)?.lives).toBe(L);
    h.wait(T.introMs);
    h.input('FILL_PRESS');
    h.wait(300);
    h.input('PAUSE');
    h.input('RESTART_LEVEL');
    h.input('RESTART_LEVEL'); // second press lands in LEVEL_INTRO: ignored
    expect(selectRun(h.game.state)).toMatchObject({ level: 1, lives: L - 1 });
    expect(h.events('lifeLost')[0].payload.cause).toBe('restart');
  });

  it('restart is refused once the attempt is scored', () => {
    const h = new Harness();
    h.startRun();
    h.hold(500);
    h.input('PAUSE');
    h.input('RESTART_LEVEL');
    expect(h.game.state.tag).toBe('PAUSED');
  });

  it('paid restart on the last life ends the game', () => {
    const h = new Harness();
    h.startRun();
    for (let i = 0; i < L - 1; i++) {
      h.attempt(false);
      h.next();
    }
    h.input('FILL_PRESS');
    h.wait(100);
    h.input('PAUSE');
    h.input('RESTART_LEVEL');
    expect(h.game.state).toEqual({ tag: 'GAME_OVER', levelReached: 1 });
  });

  it('quit from pause returns to MENU', () => {
    const h = new Harness();
    h.startRun();
    h.input('PAUSE');
    h.input('QUIT');
    expect(h.game.state.tag).toBe('MENU');
  });
});

describe('selectors', () => {
  it('target visibility follows the configured mode', () => {
    const h = new Harness();
    h.startRun();
    expect(selectTargetAllowed(h.game.state, 'always')).toBe(true);
    expect(selectTargetAllowed(h.game.state, 'previewThenHide')).toBe(false);
    h.hold(500);
    expect(selectTargetAllowed(h.game.state, 'previewThenHide')).toBe(true);
  });
});
