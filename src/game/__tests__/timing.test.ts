import { describe, expect, it } from 'vitest';
import { getLevel } from '../difficulty';
import { Harness } from './harness';

const R1 = getLevel(1).fillRate;

/**
 * Frame-rate independence: the same physical hold must produce the same volume
 * whether the device renders at 30, 60 or 120 Hz, with or without dropped frames.
 */
describe('timing precision across frame rates', () => {
  const profiles = [
    { name: '30Hz', frameMs: 1000 / 30, jitter: 0 },
    { name: '60Hz', frameMs: 1000 / 60, jitter: 0 },
    { name: '120Hz', frameMs: 1000 / 120, jitter: 0 },
    { name: '60Hz + heavy jank', frameMs: 1000 / 60, jitter: 60 },
    { name: '24Hz low-end', frameMs: 1000 / 24, jitter: 30 },
  ];

  const holdMs = 2321.5;

  it.each(profiles)('$name gives an identical final volume', ({ frameMs, jitter }) => {
    const h = new Harness(frameMs, jitter);
    h.startRun();
    h.hold(holdMs);
    const stop = h.events('fillStop')[0].payload;
    expect(stop.volume).toBe((R1 * holdMs) / 1000);
  });

  it('live volume sampled by the renderer matches the closed form at every frame', () => {
    const h = new Harness(1000 / 60, 40);
    h.startRun();
    const samples: { now: number; volume: number }[] = [];
    h.game.onFrame((f) => f.state.tag === 'FILLING' && samples.push({ now: f.now, volume: f.volume }));
    const pressAt = h.t;
    h.hold(3000);
    expect(samples.length).toBeGreaterThan(50);
    for (const s of samples) expect(s.volume).toBeCloseTo((R1 * (s.now - pressAt)) / 1000, 9);
  });

  it('a single huge frame hitch still resolves every timed transition in order', () => {
    const h = new Harness(5000); // one frame every 5 s
    h.input('START_RUN');
    h.wait(5000);
    expect(h.game.state.tag).toBe('READY');
    h.input('FILL_PRESS');
    h.game.dispatch({ type: 'FILL_RELEASE', now: h.t + 200 });
    h.t += 200;
    h.wait(5000); // settle + CTA delay both elapse inside one frame
    expect(h.game.state.tag).toBe('RESULT');
    expect(h.events('settleComplete')).toHaveLength(1);
  });
});
