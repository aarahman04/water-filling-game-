/**
 * Console-verifiable run of the Stage 1 logic — no rendering.
 *
 *   npm run sim                 # difficulty table + one bot run, seed 7
 *   npm run sim -- --seed 3 --sd 90 --fps 30
 *
 * The bot aims for band centre with Gaussian release error (`--sd`, ms), on a
 * simulated jittery frame clock, and logs every design hook as it fires.
 */

import { parseArgs } from 'node:util';
import {
  GAMEPLAY,
  GameController,
  LEVELS,
  bandBounds,
  fullGlassMs,
  idealHoldMs,
  getLevel,
  timeInBandMs,
  validateLevels,
  type FrameScheduler,
  type GameEventName,
} from '../src/game/index.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '7' },
    sd: { type: 'string', default: '35' },
    fps: { type: 'string', default: '60' },
  },
});
const sdMs = Number(values.sd);
const frameMs = 1000 / Number(values.fps);
let seed = Number(values.seed) || 1;
const rand = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());

// ── Difficulty table ────────────────────────────────────────────────────────
console.log('\nDIFFICULTY CURVE');
console.table(
  LEVELS.map((l) => {
    const b = bandBounds(l);
    return {
      level: l.level,
      tier: l.tier,
      'rate %/s': l.fillRate,
      surge: l.surge,
      'band %': `${b.min.toFixed(2)}–${b.max.toFixed(2)}`,
      'ideal hold ms': Math.round(idealHoldMs(l)),
      'window ms': Math.round(timeInBandMs(l)),
      'full glass s': +(fullGlassMs(l) / 1000).toFixed(2),
    };
  }),
);
const errors = validateLevels();
console.log(errors.length ? `CURVE INVALID:\n  ${errors.join('\n  ')}` : 'Curve invariants: OK');

// ── Bot run ─────────────────────────────────────────────────────────────────
let pending: ((ts: number) => void) | null = null;
const scheduler: FrameScheduler = { request: (cb) => ((pending = cb), 1), cancel: () => (pending = null) };
const game = new GameController(undefined, scheduler);
let t = 0;
const advance = (ms: number) => {
  const end = t + ms;
  while (t < end) {
    t = Math.min(end, t + Math.max(1, frameMs + (rand() - 0.3) * frameMs));
    const cb = pending;
    pending = null;
    cb?.(t);
  }
};
const fmt = (n: number) => n.toFixed(2).padStart(6);
const at = (ms: number) => `${(ms / 1000).toFixed(3).padStart(8)}s`;

const hooks: GameEventName[] = [
  'stateChange', 'levelIntro', 'fillStart', 'fillStop', 'settleComplete',
  'levelPass', 'levelFail', 'lifeLost', 'gameOver', 'victory',
];
for (const name of hooks) {
  game.on(name, (p) => {
    const extra =
      name === 'stateChange' ? `${(p as { from: string }).from} → ${(p as { to: string }).to}`
      : name === 'fillStop' ? `volume ${fmt((p as { volume: number }).volume)}%  (${(p as { reason: string }).reason})`
      : name === 'levelPass' || name === 'levelFail'
        ? (() => {
            const s = (p as { score: { deviation: number; accuracy: number } }).score;
            return `dev ${s.deviation >= 0 ? '+' : ''}${s.deviation.toFixed(2)}  acc ${(s.accuracy * 100).toFixed(0)}%`;
          })()
      : name === 'lifeLost' ? `lives ${(p as { livesRemaining: number }).livesRemaining}`
      : name === 'gameOver' ? `reached L${(p as { levelReached: number }).levelReached}`
      : name === 'levelIntro' ? `L${(p as { level: number }).level}`
      : '';
    console.log(`${at((p as { at: number }).at)}  on${name[0].toUpperCase()}${name.slice(1)}`.padEnd(32) + extra);
  });
}

console.log(`\nBOT RUN  seed=${values.seed}  release σ=${sdMs}ms  ~${values.fps}fps with jitter\n`);
game.start();
game.dispatch({ type: 'START_RUN', now: t });

for (let guard = 0; guard < 5000; guard++) {
  const s = game.state;
  if (s.tag === 'GAME_OVER' || s.tag === 'VICTORY') break;
  if (s.tag === 'READY') {
    const cfg = getLevel(s.run.level);
    game.dispatch({ type: 'FILL_PRESS', now: t });
    advance(Math.max(50, idealHoldMs(cfg) + gauss() * sdMs));
    game.dispatch({ type: 'FILL_RELEASE', now: t });
  } else if (s.tag === 'RESULT' && t >= s.advanceAt) {
    game.dispatch({ type: 'CONTINUE', now: t });
  }
  advance(100);
}
advance(GAMEPLAY.timing.terminalDelayMs);
console.log(`\nFinal state: ${JSON.stringify(game.state)}\n`);
