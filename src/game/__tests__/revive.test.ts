import { describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../config/gameplay';
import { selectRun } from '../selectors';
import { Harness } from './harness';

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

describe('rewarded revive', () => {
  it('continues the same level with reviveLives', () => {
    const h = new Harness();
    h.startRun();
    h.attempt(true);
    h.next();
    loseAll(h);

    expect(h.game.state).toMatchObject({ tag: 'GAME_OVER', levelReached: 2, revivesLeft: 2 });
    h.input('REVIVE');
    expect(h.game.state.tag).toBe('LEVEL_INTRO');
    expect(selectRun(h.game.state)).toMatchObject({ level: 2, lives: GAMEPLAY.reviveLives, revivesUsed: 1 });
    expect(h.log.slice(-3).filter((e) => e.type !== 'stateChange').map((e) => e.type)).toEqual(['revive', 'levelIntro']);
    expect(h.events('revive').at(-1)?.payload).toMatchObject({ level: 2, lives: 1, revivesUsed: 1 });
  });

  it('re-rolls the attempt', () => {
    const h = new Harness();
    h.startRun();
    loseAll(h);
    if (h.game.state.tag !== 'GAME_OVER') throw new Error('expected GAME_OVER');
    const attempt = h.game.state.run.attempt;
    h.input('REVIVE');
    expect(selectRun(h.game.state)?.attempt).toBe(attempt + 1);
  });

  it('caps revives at two per run', () => {
    const h = new Harness();
    h.startRun();
    loseAll(h);
    h.input('REVIVE');
    h.wait(T.introMs);
    loseAll(h);
    h.input('REVIVE');
    h.wait(T.introMs);
    loseAll(h);

    expect(h.game.state).toMatchObject({ tag: 'GAME_OVER', revivesLeft: 0 });
    const state = h.game.state;
    h.input('REVIVE');
    expect(h.game.state).toBe(state);
  });

  it('resets revives on a fresh run', () => {
    const h = new Harness();
    h.startRun();
    loseAll(h);
    h.input('REVIVE');
    h.wait(T.introMs);
    loseAll(h);
    h.input('START_RUN');
    expect(selectRun(h.game.state)).toMatchObject({ revivesUsed: 0, lives: L });
  });

  it('ignores REVIVE outside GAME_OVER', () => {
    const h = new Harness();
    const menu = h.game.state;
    expect(h.input('REVIVE')).toBe(menu);

    h.startRun();
    const ready = h.game.state;
    expect(h.input('REVIVE')).toBe(ready);
    h.input('PAUSE');
    const paused = h.game.state;
    expect(h.input('REVIVE')).toBe(paused);
    h.input('RESUME');
    h.attempt(false);
    const result = h.game.state;
    expect(h.input('REVIVE')).toBe(result);
    h.input('CONTINUE');
    h.wait(T.introMs);
    for (let level = 1; level <= 20; level++) {
      h.attempt(true);
      if (level < 20) h.next();
    }
    h.wait(T.terminalDelayMs);
    const victory = h.game.state;
    expect(h.input('REVIVE')).toBe(victory);
    expect(h.events('revive')).toHaveLength(0);
  });

  it('allows revive after a restart in pause uses the last life', () => {
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

    expect(h.game.state).toMatchObject({ tag: 'GAME_OVER', revivesLeft: 2 });
    h.input('REVIVE');
    expect(h.game.state).toMatchObject({ tag: 'LEVEL_INTRO', run: { level: 1 } });
  });

  it('does not count as a new run', () => {
    const h = new Harness();
    h.startRun();
    loseAll(h);
    const runStarts = h.events('runStart').length;
    h.input('REVIVE');
    expect(h.events('runStart')).toHaveLength(runStarts);
  });
});
