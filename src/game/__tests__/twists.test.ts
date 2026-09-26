import { describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../config/gameplay';
import { LEVELS } from '../config/levels';
import { getLevel } from '../difficulty';
import { secondsToReach, startSegment, volumeAt } from '../fillEngine';
import { selectBand, selectRun, selectTargetAllowed } from '../selectors';
import { bandAt, flowZones, rollSetup, solveIdealHoldMs, twistLabels } from '../twists';
import { Harness } from './harness';

const T = GAMEPLAY.timing;

/** Jump a fresh run straight to `level` (READY) by passing everything before it. */
function reach(level: number): Harness {
  const h = new Harness();
  h.game.dispatch({ type: 'START_RUN', now: h.t, seed: 42 });
  h.wait(T.introMs);
  for (let l = 1; l < level; l++) {
    h.attempt(true);
    h.next();
  }
  return h;
}

describe('twist rolls', () => {
  it('are deterministic for the same seed + attempt and differ across attempts', () => {
    const cfg = getLevel(20);
    expect(rollSetup(cfg, 7, 3)).toEqual(rollSetup(cfg, 7, 3));
    const centers = new Set(Array.from({ length: 10 }, (_, i) => rollSetup(cfg, 7, i).center.toFixed(3)));
    expect(centers.size).toBe(10);
  });

  it('keep jitter within its configured range', () => {
    for (const cfg of LEVELS) {
      const j = cfg.twists.jitter ?? 0;
      for (let a = 0; a < 50; a++) {
        const c = rollSetup(cfg, 99, a).center;
        expect(Math.abs(c - cfg.bandCenter)).toBeLessThanOrEqual(j + 1e-9);
      }
    }
  });

  it('a retry puts the band somewhere new', () => {
    const h = reach(2); // level 2: shifting target
    const first = selectRun(h.game.state)!.setup.center;
    h.attempt(false);
    h.next();
    const second = selectRun(h.game.state)!.setup.center;
    expect(second).not.toBeCloseTo(first, 3);
  });

  it('every level is winnable on every roll (the solver lands a hit)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const h = new Harness();
      h.game.dispatch({ type: 'START_RUN', now: h.t, seed });
      h.wait(T.introMs);
      for (let l = 1; l <= 20; l++) {
        h.attempt(true);
        if (l < 20) h.next();
      }
      expect(h.events('levelFail')).toHaveLength(0);
    }
  });
});

describe('individual twists', () => {
  it('moving band: position depends on pour time, and the score freezes the band at release', () => {
    const cfg = getLevel(4);
    const setup = rollSetup(cfg, 1, 1);
    const a = bandAt(cfg, setup, 0).center;
    const b = bandAt(cfg, setup, cfg.twists.moving!.periodMs / 4).center;
    expect(Math.abs(a - b)).toBeGreaterThan(0.5);

    const h = reach(4);
    h.hold(1700);
    const s = h.game.state;
    if (s.tag !== 'SETTLING') throw new Error(s.tag);
    const run = s.run;
    expect(s.score.band.center).toBeCloseTo(bandAt(cfg, run.setup, 1700).center, 6);
    expect(selectBand(s, h.t + 5000)).toEqual(s.score.band);
  });

  it('shrinking band reaches `to` × width after overMs', () => {
    const cfg = getLevel(8);
    const setup = rollSetup(cfg, 1, 1);
    expect(bandAt(cfg, setup, 0).width).toBeCloseTo(cfg.bandWidth, 9);
    expect(bandAt(cfg, setup, 10_000).width).toBeCloseTo(cfg.bandWidth * cfg.twists.shrink!.to, 9);
  });

  it('hidden band disappears while pouring and comes back on release', () => {
    const h = reach(6);
    expect(selectTargetAllowed(h.game.state, 'always')).toBe(false); // READY
    h.game.dispatch({ type: 'FILL_PRESS', now: h.t });
    expect(selectTargetAllowed(h.game.state, 'always')).toBe(false); // FILLING
    h.wait(300);
    h.input('FILL_RELEASE');
    expect(selectTargetAllowed(h.game.state, 'always')).toBe(true); // SETTLING
  });

  it('drip adds volume after release and is what gets scored', () => {
    const h = reach(3);
    h.hold(1000);
    const s = h.game.state;
    if (s.tag !== 'SETTLING') throw new Error(s.tag);
    expect(s.score.volume - s.score.releaseVolume).toBeCloseTo(getLevel(3).twists.drip!, 9);
  });

  it('drip that reaches the rim is an overflow', () => {
    const h = reach(3);
    const cfg = getLevel(3);
    const almost = secondsToReach(0, 100 - cfg.twists.drip! + 0.5, cfg.fillRate, cfg.surge) * 1000;
    h.hold(almost);
    const s = h.game.state;
    if (s.tag !== 'SETTLING') throw new Error(s.tag);
    expect(s.score.overflow).toBe(true);
    expect(s.score.volume).toBe(100);
  });

  it('flow spike speeds the pour up inside its zone only', () => {
    const cfg = getLevel(5);
    const setup = rollSetup(cfg, 3, 1);
    const [zone] = flowZones(cfg, setup);
    const withSpike = startSegment(0, 0, cfg.fillRate, cfg.surge, [zone]);
    const without = startSegment(0, 0, cfg.fillRate, cfg.surge);
    const tEnd = secondsToReach(0, zone.to, cfg.fillRate, cfg.surge) * 1000;
    expect(volumeAt(withSpike, tEnd)).toBeGreaterThan(volumeAt(without, tEnd));
    // Before the zone they're identical.
    const tBefore = secondsToReach(0, zone.from - 1, cfg.fillRate, cfg.surge) * 1000;
    expect(volumeAt(withSpike, tBefore)).toBeCloseTo(volumeAt(without, tBefore), 9);
  });

  it('pausing mid-pour keeps the moving band on the same clock', () => {
    const cfg = getLevel(4);
    const h = reach(4);
    const setup = selectRun(h.game.state)!.setup;
    h.input('FILL_PRESS');
    h.wait(600);
    h.input('PAUSE');
    h.wait(30_000);
    h.input('RESUME');
    h.hold(500);
    const s = h.game.state;
    if (s.tag !== 'SETTLING') throw new Error(s.tag);
    expect(s.score.band.center).toBeCloseTo(bandAt(cfg, setup, 1100).center, 6);
  });

  it('solver accounts for every twist on the final level', () => {
    const cfg = getLevel(20);
    const setup = rollSetup(cfg, 5, 1);
    expect(solveIdealHoldMs(cfg, setup)).toBeGreaterThan(0);
    expect(twistLabels(cfg.twists)).toEqual(['Shifting target', 'Drip', 'Moving band', 'Unstable flow', 'Fog', 'Shrinking band']);
  });
});
