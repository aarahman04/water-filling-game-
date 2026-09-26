/**
 * Design-layer configuration — the one place a re-skin touches besides tokens.css
 * and the SVGs in src/assets/design. Game logic (src/game) never imports this file.
 *
 * Colours are NOT duplicated here: the canvas reads them from tokens.css custom
 * properties at runtime (see readPalette), so tokens.css stays the colour source of truth.
 * Values default to docs/design-handoff.md.
 */

import type { Tier } from '../game';
import backgroundUrl from '../assets/design/background.svg';
import buttonFillUrl from '../assets/design/button-fill.svg';
import glassBackUrl from '../assets/design/glass-back.svg';
import glassFrontUrl from '../assets/design/glass-front.svg';
import iconsUrl from '../assets/design/icons.svg?raw';
import spoutUrl from '../assets/design/spout.svg';
import standUrl from '../assets/design/stand.svg';

export const ASSETS = {
  background: backgroundUrl,
  buttonFill: buttonFillUrl,
  glassBack: glassBackUrl,
  glassFront: glassFrontUrl,
  spout: spoutUrl,
  stand: standUrl,
  /** Raw SVG markup; only its <defs> are injected as a hidden sprite. */
  iconSprite: iconsUrl,
} as const;

/**
 * Stage geometry in art-local units (1 unit = 1 CSS px at scale 1).
 * The art box spans spout → stand: 232 × 470 (handoff §3).
 */
export const STAGE = {
  width: 232,
  height: 470,
  /** Reserved above the art for the prompt line. */
  promptHeight: 44,
  maxScale: 1.25,
  spout: { x: 84, y: 0, w: 64, h: 64 },
  glass: { x: 20, y: 74, w: 192, h: 360 },
  stand: { x: 0, y: 422, w: 232, h: 48 },
  /** Usable water chamber: h=0 at bottom, h=1 at top. */
  chamber: { x: 36, y: 90, w: 160, h: 320, bottomRadius: 8 },
  /** Nozzle outlet centre. */
  outlet: { x: 116, y: 49 },
  /** Result marker: x range just outside the right wall. */
  marker: { x0: 196, x1: 208 },
  canvasDprCap: 2,
} as const;

export interface TierStyle {
  readonly caption: string;
  readonly captionColor: string;
  /** data-water attribute value selecting the tokens.css water palette. */
  readonly water: 'mineral' | 'lagoon' | 'glacier' | 'deep';
  readonly streamWidth: number;
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
  readonly bubbleRate: number;
  readonly bubbleCap: number;
}

export const TIERS: Record<Tier, TierStyle> = {
  steady: { caption: 'STEADY', captionColor: '#B8CBD3', water: 'mineral', streamWidth: 4, waveAmplitude: 1.2, waveFrequency: 1.2, bubbleRate: 4, bubbleCap: 6 },
  quick: { caption: 'QUICK', captionColor: '#A6DCD6', water: 'lagoon', streamWidth: 5, waveAmplitude: 1.8, waveFrequency: 1.6, bubbleRate: 6, bubbleCap: 8 },
  fast: { caption: 'FAST', captionColor: '#C0D6F6', water: 'glacier', streamWidth: 6, waveAmplitude: 2.4, waveFrequency: 2.0, bubbleRate: 8, bubbleCap: 10 },
  precise: { caption: 'PRECISE', captionColor: '#F3DFB3', water: 'deep', streamWidth: 7, waveAmplitude: 3.0, waveFrequency: 2.4, bubbleRate: 10, bubbleCap: 12 },
};

/** Visual timelines (ms). These animate *within* the logic's timing gates; they never drive them. */
export const MOTION = {
  intro: { captionIn: 180, bandInAt: 480, bandInDuration: 180, previewEndAt: 1660, bandHideDuration: 160 },
  drain: 240,
  streamOnset: 80,
  streamCutoff: 100,
  settle: 480,
  surfaceFlatten: 480,
  targetReveal: 140,
  successBand: { start: 480, end: 700 },
  successSweep: { start: 480, end: 840 },
  failTint: { start: 480, peak: 550, end: 700 },
  shake: { start: 480, keys: [[0, 0], [30, -4], [65, 3], [100, -2], [140, 1], [180, 0]] as const },
  idleWave: { amplitude: 0.35, periodMs: 2400 },
  maxSurfaceDisplacement: 3.5,
  bubble: { minR: 0.8, maxR: 2.2, riseMin: 22, riseMax: 40, lifeMs: 900 },
} as const;

/** Parse a CSS cubic-bezier() into an easing function (Newton–Raphson on x). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const dBez = (t: number, a: number, b: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dBez(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= (bez(t, x1, x2) - x) / d;
    }
    return bez(Math.min(1, Math.max(0, t)), y1, y2);
  };
}

function parseBezier(value: string, fallback: [number, number, number, number]) {
  const m = value.match(/cubic-bezier\(([^)]+)\)/);
  const nums = m ? m[1].split(',').map(Number) : fallback;
  return cubicBezier(nums[0], nums[1], nums[2], nums[3]);
}

export interface Palette {
  accent: string;
  success: string;
  fail: string;
  targetFill: string;
  waterEdge: string;
  meniscus: string;
  text: string;
  easeOut: (t: number) => number;
  easeInOut: (t: number) => number;
  easeIn: (t: number) => number;
  water: Record<TierStyle['water'], { top: string; upper: string; body: string; deep: string; alphas: [number, number, number, number] }>;
}

/** Read colour + easing tokens from tokens.css. Call after the stylesheet has loaded. */
export function readPalette(root: HTMLElement = document.documentElement): Palette {
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const probe = document.createElement('div');
  probe.style.display = 'none';
  root.appendChild(probe);
  const water = {} as Palette['water'];
  for (const key of ['mineral', 'lagoon', 'glacier', 'deep'] as const) {
    probe.dataset.water = key;
    const p = getComputedStyle(probe);
    const g = (n: string) => p.getPropertyValue(n).trim();
    water[key] = {
      top: g('--water-top'),
      upper: g('--water-upper'),
      body: g('--water-body'),
      deep: g('--water-deep'),
      alphas: [+g('--water-top-alpha'), +g('--water-upper-alpha'), +g('--water-body-alpha'), +g('--water-deep-alpha')],
    };
  }
  probe.remove();
  return {
    accent: v('--accent'),
    success: v('--success'),
    fail: v('--fail'),
    targetFill: v('--target-fill'),
    waterEdge: v('--water-edge'),
    meniscus: v('--water-meniscus'),
    text: v('--text'),
    easeOut: parseBezier(v('--ease-out'), [0.16, 1, 0.3, 1]),
    easeInOut: parseBezier(v('--ease-in-out'), [0.4, 0, 0.2, 1]),
    easeIn: parseBezier(v('--ease-in'), [0.4, 0, 1, 1]),
    water,
  };
}

/** Hex (#rrggbb) + alpha → rgba() string for canvas gradients. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
