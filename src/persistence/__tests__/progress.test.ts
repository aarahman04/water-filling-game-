import { describe, expect, it } from 'vitest';
import { GameController, type FrameScheduler } from '../../game';
import { DEFAULT_SAVE, ProgressStore, SAVE_KEY, applyEvent, parseSave } from '../progress';
import { memoryStore } from '../storage';

const score = (accuracy: number) => ({ volume: 48, hit: true, deviation: 0, direction: 'center' as const, accuracy, overflow: false });

describe('progress reducer', () => {
  it('counts runs', () => {
    const d = applyEvent(DEFAULT_SAVE, { type: 'runStart', payload: { at: 0 } });
    expect(d.gamesPlayed).toBe(1);
  });

  it('keeps best level as a high-water mark', () => {
    let d = applyEvent(DEFAULT_SAVE, { type: 'levelIntro', payload: { level: 7, lives: 5, at: 0, readyAt: 0 } });
    d = applyEvent(d, { type: 'levelIntro', payload: { level: 1, lives: 5, at: 0, readyAt: 0 } });
    expect(d.bestLevel).toBe(7);
  });

  it('keeps best accuracy per level', () => {
    let d = applyEvent(DEFAULT_SAVE, { type: 'levelPass', payload: { level: 3, at: 0, score: score(0.6) } });
    d = applyEvent(d, { type: 'levelPass', payload: { level: 3, at: 0, score: score(0.4) } });
    expect(d.bestAccuracy).toEqual([null, null, 0.6]);
    d = applyEvent(d, { type: 'levelPass', payload: { level: 3, at: 0, score: score(0.9) } });
    expect(d.bestAccuracy[2]).toBe(0.9);
  });

  it('survives corrupt or partial saves', () => {
    expect(parseSave('not json')).toEqual(DEFAULT_SAVE);
    expect(parseSave(null)).toEqual(DEFAULT_SAVE);
    expect(parseSave('{"bestLevel":-3,"muted":"yes","bestAccuracy":[2,0.5]}')).toMatchObject({
      bestLevel: 0,
      muted: false,
      bestAccuracy: [null, 0.5],
    });
  });
});

describe('ProgressStore', () => {
  it('persists across a game-over restart and reload', async () => {
    const kv = memoryStore();
    const store = new ProgressStore(kv);
    await store.load();
    const scheduler: FrameScheduler = { request: () => 0, cancel: () => {} };
    const game = new GameController(undefined, scheduler);
    store.bind(game);

    game.dispatch({ type: 'START_RUN', now: 0 });
    game.dispatch({ type: 'TICK', now: 2000 });
    game.dispatch({ type: 'FILL_PRESS', now: 2000 });
    game.dispatch({ type: 'FILL_RELEASE', now: 2000 + (48 / 10.5) * 1000 });
    game.dispatch({ type: 'TICK', now: 8000 });
    game.dispatch({ type: 'CONTINUE', now: 8000 }); // level 2
    store.update((d) => ({ ...d, muted: true }));
    await Promise.resolve();

    const reloaded = new ProgressStore(kv);
    await reloaded.load();
    expect(reloaded.get()).toMatchObject({ bestLevel: 2, gamesPlayed: 1, muted: true });
    expect(reloaded.get().bestAccuracy[0]).toBeCloseTo(1);
    expect(await kv.get(SAVE_KEY)).toContain('"bestLevel":2');
  });
});
