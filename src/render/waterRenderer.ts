/**
 * Canvas renderer for everything that moves inside the glass: water body, surface,
 * bubbles, stream, target band, result marker and result effects.
 *
 * It is a pure consumer of the game: it samples volume every frame via
 * controller.onFrame and reacts to hooks for timeline anchors. Nothing here feeds
 * back into game state. Static art (glass, spout, stand) is DOM SVG layered around it.
 */

import {
  flowZones,
  getLevel,
  selectBand,
  selectRun,
  selectTargetAllowed,
  type FrameInfo,
  type GameController,
  type GameState,
  type TargetVisibility,
} from '../game';
import { MOTION, STAGE, TIERS, withAlpha, type Palette, type TierStyle } from '../theme/theme';

/** Padding around the art box so overflow ribbons / success drops can draw outside it. */
const PAD = 16;
const TITLE_VOLUME = 55;
/** Drip twist: time for the post-release drip to land (inside the 480ms settle). */
const DRIP_MS = 300;
/** Fog lifts this long after the result appears. */
const FOG_LIFT_MS = 220;
const C = STAGE.chamber;
const BOTTOM = C.y + C.h;

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  born: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Element that receives the miss shake (translateX). */
  shakeTarget: HTMLElement;
  controller: GameController;
  palette: Palette;
  getReducedMotion: () => boolean;
  getTargetVisibility: () => TargetVisibility;
}

export class WaterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly o: RendererOptions;
  private scale = 1;
  private dpr = 1;
  private offs: (() => void)[] = [];

  // Timeline anchors (performance.now clock), set from hooks.
  private introAt = -Infinity;
  private drainFrom = 0;
  private fillStartAt = -Infinity;
  private stopAt = -Infinity;
  private stopWave: number[] = [];
  private overflowAt = -Infinity;
  private lastVolume = 0;
  private lastSpawn = 0;
  private bubbles: Bubble[] = [];
  private drops: Drop[] = [];

  constructor(options: RendererOptions) {
    this.o = options;
    const ctx = options.canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    const c = options.controller;
    this.offs.push(
      c.onFrame((f) => this.draw(f)),
      c.on('levelIntro', (p) => {
        this.introAt = p.at;
        this.drainFrom = this.lastVolume;
        this.stopAt = -Infinity;
        this.overflowAt = -Infinity;
      }),
      c.on('fillStart', (p) => {
        this.fillStartAt = p.at;
        this.stopAt = -Infinity;
      }),
      c.on('fillStop', (p) => {
        this.stopAt = p.at;
        this.stopWave = this.sampleFillWave(p.at, (p.volume / 100) * C.h, this.tierOf(c.state));
        if (p.reason === 'overflow') this.overflowAt = p.at;
      }),
      c.on('levelPass', (p) => this.spawnSuccessDrops(p.at)),
      c.on('stateChange', (p) => {
        if (p.to === 'MENU') {
          this.drainFrom = this.lastVolume;
          this.introAt = p.at;
        }
      }),
    );
  }

  destroy() {
    this.offs.forEach((off) => off());
    this.o.shakeTarget.style.transform = '';
  }

  /** `scale` = art scale s (CSS px per art unit). */
  resize(scale: number) {
    this.scale = scale;
    this.dpr = Math.min(window.devicePixelRatio || 1, STAGE.canvasDprCap);
    const { canvas } = this.o;
    const cssW = (STAGE.width + PAD * 2) * scale;
    const cssH = (STAGE.height + PAD * 2) * scale;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.left = `${-PAD * scale}px`;
    canvas.style.top = `${-PAD * scale}px`;
    canvas.width = Math.round(cssW * this.dpr);
    canvas.height = Math.round(cssH * this.dpr);
    this.redraw();
  }

  /** Repaint the current state immediately (resize, settings change). */
  redraw() {
    const now = performance.now();
    const c = this.o.controller;
    this.draw({ now, state: c.state, volume: c.volumeAt(now) });
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  private draw({ now, state, volume }: FrameInfo) {
    if (state.tag === 'PAUSED') return; // frozen under an opaque menu
    const { ctx } = this;
    const k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.o.canvas.width, this.o.canvas.height);
    ctx.setTransform(k, 0, 0, k, PAD * k, PAD * k);

    const reduced = this.o.getReducedMotion();
    const tier = this.tierOf(state);
    const v = this.visualVolume(state, volume, now);
    this.lastVolume = v;
    const heightPx = (v / 100) * C.h;
    const surface = this.surfaceOffsets(state, now, heightPx, tier, reduced);

    this.updateBubbles(state, now, heightPx, tier, reduced);
    if (heightPx > 0.25) this.drawWater(heightPx, surface, tier, state, now);
    this.drawStream(state, now, heightPx, tier, reduced, v);
    this.drawDrip(state, now, heightPx);
    this.drawFog(state, now);
    this.drawBand(state, now);
    this.drawResult(state, now, reduced);
    this.drawDrops(now, reduced);
    this.applyShake(state, now, reduced);
  }

  private tierOf(state: GameState): TierStyle {
    const run = selectRun(state);
    return TIERS[getLevel(run?.level ?? 1).tier];
  }

  private visualVolume(state: GameState, volume: number, now: number): number {
    switch (state.tag) {
      case 'MENU':
        return this.drainIn(now, this.drainFrom, TITLE_VOLUME);
      case 'LEVEL_INTRO':
        return this.drainIn(now, this.drainFrom, 0);
      case 'GAME_OVER':
      case 'VICTORY':
        return this.lastVolume;
      case 'SETTLING': {
        // Drip twist: water keeps rising from the release level to the scored level.
        const { releaseVolume, volume: final } = state.score;
        if (final === releaseVolume) return final;
        const u = Math.min(1, Math.max(0, (now - this.stopAt) / DRIP_MS));
        return releaseVolume + (final - releaseVolume) * u;
      }
      default:
        return volume;
    }
  }

  private drainIn(now: number, from: number, to: number) {
    const u = Math.min(1, Math.max(0, (now - this.introAt) / MOTION.drain));
    if (!Number.isFinite(this.introAt) || u >= 1) return to;
    return from + (to - from) * this.o.palette.easeIn(u);
  }

  // ── Surface ────────────────────────────────────────────────────────────────
  private static readonly SAMPLES = 41; // every 4 units across 160

  private fillWave(x: number, tSec: number, tier: TierStyle) {
    const f = tier.waveFrequency;
    return (
      tier.waveAmplitude *
      (0.75 * Math.sin((2 * Math.PI * x) / C.w + 2 * Math.PI * f * tSec) +
        0.25 * Math.sin((6 * Math.PI * x) / C.w - 2 * Math.PI * 1.7 * f * tSec))
    );
  }

  private edgeFactor(heightPx: number) {
    return Math.max(0, Math.min(1, heightPx / 6, (C.h - heightPx) / 6));
  }

  private sampleFillWave(at: number, heightPx: number, tier: TierStyle): number[] {
    const out: number[] = [];
    const ef = this.edgeFactor(heightPx);
    for (let i = 0; i < WaterRenderer.SAMPLES; i++) {
      const x = (i / (WaterRenderer.SAMPLES - 1)) * C.w;
      const d = this.fillWave(x, at / 1000, tier) * ef;
      out.push(Math.max(-MOTION.maxSurfaceDisplacement, Math.min(MOTION.maxSurfaceDisplacement, d)));
    }
    return out;
  }

  /** Per-sample vertical displacement (px, +down) of the surface around its fixed mean. */
  private surfaceOffsets(state: GameState, now: number, heightPx: number, tier: TierStyle, reduced: boolean): number[] {
    const n = WaterRenderer.SAMPLES;
    if (reduced) return new Array(n).fill(0);
    if (state.tag === 'FILLING') return this.sampleFillWave(now, heightPx, tier);
    if (state.tag === 'SETTLING' || state.tag === 'RESULT') {
      const u = Math.min(1, (now - this.stopAt) / MOTION.settle);
      if (u >= 1 || this.stopWave.length !== n) return new Array(n).fill(0);
      const damp = Math.exp(-4 * u) * Math.cos(4 * Math.PI * u) * (1 - u);
      return this.stopWave.map((d) => d * damp);
    }
    const { amplitude, periodMs } = MOTION.idleWave;
    const ef = this.edgeFactor(heightPx);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * C.w;
      out.push(amplitude * ef * Math.sin((2 * Math.PI * x) / C.w + (2 * Math.PI * now) / periodMs));
    }
    return out;
  }

  // ── Water body ─────────────────────────────────────────────────────────────
  private chamberClip() {
    const { ctx } = this;
    const r = C.bottomRadius;
    ctx.beginPath();
    ctx.moveTo(C.x, C.y - 40); // open top so waves/stream near the rim aren't clipped flat
    ctx.lineTo(C.x + C.w, C.y - 40);
    ctx.lineTo(C.x + C.w, BOTTOM - r);
    ctx.quadraticCurveTo(C.x + C.w, BOTTOM, C.x + C.w - r, BOTTOM);
    ctx.lineTo(C.x + r, BOTTOM);
    ctx.quadraticCurveTo(C.x, BOTTOM, C.x, BOTTOM - r);
    ctx.closePath();
    ctx.clip();
  }

  private surfacePath(meanY: number, offsets: number[]) {
    const { ctx } = this;
    const n = offsets.length;
    for (let i = 0; i < n; i++) {
      const x = C.x + (i / (n - 1)) * C.w;
      const y = Math.min(BOTTOM, meanY + offsets[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  private drawWater(heightPx: number, offsets: number[], tier: TierStyle, state: GameState, now: number) {
    const { ctx } = this;
    const pal = this.o.palette.water[tier.water];
    const meanY = BOTTOM - heightPx;

    ctx.save();
    this.chamberClip();

    // Body: depth gradient relative to current water depth.
    ctx.beginPath();
    this.surfacePath(meanY, offsets);
    ctx.lineTo(C.x + C.w, BOTTOM);
    ctx.lineTo(C.x, BOTTOM);
    ctx.closePath();
    const depth = ctx.createLinearGradient(0, meanY, 0, BOTTOM);
    if (heightPx < 4) {
      depth.addColorStop(0, withAlpha(pal.body, pal.alphas[2]));
      depth.addColorStop(1, withAlpha(pal.body, pal.alphas[2]));
    } else {
      depth.addColorStop(0, withAlpha(pal.top, pal.alphas[0]));
      depth.addColorStop(0.06, withAlpha(pal.upper, pal.alphas[1]));
      depth.addColorStop(0.4, withAlpha(pal.body, pal.alphas[2]));
      depth.addColorStop(1, withAlpha(pal.deep, pal.alphas[3]));
    }
    ctx.fillStyle = depth;
    ctx.fill();

    // Refracted edges.
    const edge = ctx.createLinearGradient(C.x, 0, C.x + C.w, 0);
    const ec = this.o.palette.waterEdge;
    for (const [pos, a] of [[0, 0.34], [0.07, 0.1], [0.18, 0], [0.82, 0], [0.93, 0.1], [1, 0.3]])
      edge.addColorStop(pos, withAlpha(ec, a));
    ctx.fillStyle = edge;
    ctx.fill();

    // Bubbles (under the surface line).
    for (const b of this.bubbles) {
      const alpha = this.bubbleAlpha(b, state, now);
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.08 * alpha})`;
      ctx.fill();
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = `rgba(255,255,255,${0.28 * alpha})`;
      ctx.stroke();
    }

    // Surface ellipse (flattens 3 → 2 during settle) and meniscus.
    if (heightPx >= 2) {
      const settleU = state.tag === 'SETTLING' || state.tag === 'RESULT'
        ? Math.min(1, (now - this.stopAt) / MOTION.surfaceFlatten) : 0;
      const ry = Math.min(3 - settleU, heightPx / 2);
      ctx.beginPath();
      ctx.ellipse(C.x + C.w / 2, meanY, 79, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(pal.top, 0.32);
      ctx.fill();
    }
    ctx.beginPath();
    this.surfacePath(meanY, offsets);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(this.o.palette.meniscus, 0.72);
    ctx.stroke();
    ctx.restore();
  }

  // ── Bubbles ────────────────────────────────────────────────────────────────
  private updateBubbles(state: GameState, now: number, heightPx: number, tier: TierStyle, reduced: boolean) {
    const surfaceY = BOTTOM - heightPx;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastSpawn) / 1000));
    const spawning = state.tag === 'FILLING' && !reduced && heightPx > 14;
    if (spawning && this.bubbles.length < tier.bubbleCap && Math.random() < tier.bubbleRate * dt) {
      const B = MOTION.bubble;
      const depth = 12 + Math.random() * Math.min(52, heightPx - 13);
      this.bubbles.push({
        x: C.x + 80 + (Math.random() * 2 - 1) * 12,
        y: Math.min(BOTTOM - 3, surfaceY + depth),
        r: B.minR + Math.random() * (B.maxR - B.minR),
        vy: B.riseMin + Math.random() * (B.riseMax - B.riseMin),
        drift: Math.random() * Math.PI * 2,
        born: now,
      });
    }
    this.lastSpawn = now;
    if (reduced || state.tag === 'LEVEL_INTRO' || state.tag === 'MENU') {
      this.bubbles = [];
      return;
    }
    const frozen = state.tag !== 'FILLING' && state.tag !== 'SETTLING';
    this.bubbles = this.bubbles.filter((b) => {
      if (!frozen) {
        b.y -= b.vy * dt;
        b.x += Math.sin(b.drift + ((now - b.born) / 500) * Math.PI) * 0.1;
      }
      return b.y - b.r > surfaceY && now - b.born < MOTION.bubble.lifeMs;
    });
  }

  private bubbleAlpha(_b: Bubble, state: GameState, now: number) {
    if (state.tag !== 'SETTLING' && state.tag !== 'RESULT') return 1;
    const remaining = MOTION.settle - (now - this.stopAt);
    return Math.max(0, Math.min(1, remaining / 180));
  }

  // ── Stream ─────────────────────────────────────────────────────────────────
  private drawStream(state: GameState, now: number, heightPx: number, tier: TierStyle, reduced: boolean, volume: number) {
    const { ctx } = this;
    const filling = state.tag === 'FILLING';
    const sinceStop = now - this.stopAt;
    const cutting = !filling && sinceStop >= 0 && sinceStop < MOTION.streamCutoff && this.overflowAt !== this.stopAt;
    if (!filling && !cutting) return;

    const onset = filling ? this.o.palette.easeOut(Math.min(1, (now - this.fillStartAt) / MOTION.streamOnset)) : 1;
    // Flow spike: the stream visibly thickens while the burst is active.
    let spike = 1;
    if (filling) {
      const cfg = getLevel(state.run.level);
      for (const z of flowZones(cfg, state.run.setup)) if (volume >= z.from && volume < z.to) spike = 1.7;
    }
    const width = tier.streamWidth * (reduced ? 1 : onset) * spike;
    const cut = cutting ? this.o.palette.easeIn(sinceStop / MOTION.streamCutoff) : 0;
    const opacity = cutting ? 0.85 * (1 - cut) : 1;
    const wobble = reduced ? 0 : Math.sin((2 * Math.PI * now) / 180);
    const cx = STAGE.outlet.x + wobble;
    const top = STAGE.outlet.y;
    const surfaceY = BOTTOM - heightPx;
    const bottom = surfaceY - (surfaceY - top) * cut;

    ctx.save();
    ctx.globalAlpha = opacity;
    const g = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
    g.addColorStop(0, 'rgba(191,239,255,0.45)');
    g.addColorStop(0.3, 'rgba(128,221,237,0.8)');
    g.addColorStop(0.55, 'rgba(236,255,255,0.92)');
    g.addColorStop(1, 'rgba(66,176,207,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - width / 2, top, width, Math.max(0, bottom - top));

    // Impact patch under the nozzle.
    if (filling && heightPx > 1) {
      const patch = ctx.createRadialGradient(cx, surfaceY, 0, cx, surfaceY, 9);
      patch.addColorStop(0, 'rgba(255,255,255,0.38)');
      patch.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = patch;
      ctx.fillRect(cx - 9, surfaceY - 4, 18, 8);
    }
    ctx.restore();
  }

  /** Drip twist: a thin trickle from the nozzle while the drip lands. */
  private drawDrip(state: GameState, now: number, heightPx: number) {
    if (state.tag !== 'SETTLING' || state.score.volume === state.score.releaseVolume) return;
    const t = now - this.stopAt;
    if (t < 0 || t > DRIP_MS) return;
    const { ctx } = this;
    const cx = STAGE.outlet.x;
    const surfaceY = BOTTOM - heightPx;
    ctx.save();
    ctx.fillStyle = `rgba(215,247,245,${0.8 * (1 - t / DRIP_MS)})`;
    // Falling droplets rather than a solid stream.
    for (let i = 0; i < 4; i++) {
      const y = STAGE.outlet.y + (((t / 1000) * 420 + i * 22) % Math.max(1, surfaceY - STAGE.outlet.y));
      ctx.beginPath();
      ctx.ellipse(cx, y, 1.4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Fog twist: frosted glass hides the water from `below` % under the band centre upward. */
  private drawFog(state: GameState, now: number) {
    const s = state.tag === 'PAUSED' ? state.resumeTo : state;
    if (s.tag !== 'LEVEL_INTRO' && s.tag !== 'READY' && s.tag !== 'FILLING' && s.tag !== 'SETTLING' && s.tag !== 'RESULT') return;
    const fog = getLevel(s.run.level).twists.fog;
    if (!fog) return;
    let alpha = 1;
    if (s.tag === 'RESULT') {
      const since = now - (this.stopAt + MOTION.settle);
      alpha = 1 - Math.min(1, Math.max(0, since / FOG_LIFT_MS));
      if (alpha <= 0) return;
    }
    const from = Math.max(0, s.run.setup.center - fog.below);
    const yBottom = BOTTOM - (from / 100) * C.h;
    const yTop = C.y - 6;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, yBottom + 10, 0, yTop);
    g.addColorStop(0, 'rgba(176,205,218,0)');
    g.addColorStop(0.06, 'rgba(176,205,218,1)');
    g.addColorStop(1, 'rgba(196,222,232,1)');
    ctx.fillStyle = g;
    ctx.fillRect(C.x - 2, yTop, C.w + 4, yBottom + 10 - yTop);
    // Frost streaks so it reads as glass, not a UI block.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let y = yTop + 6; y < yBottom; y += 9) {
      ctx.beginPath();
      ctx.moveTo(C.x + 6 + ((y * 7) % 23), y);
      ctx.lineTo(C.x + C.w - 6 - ((y * 5) % 31), y + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Target band ────────────────────────────────────────────────────────────
  private bandAlpha(state: GameState, now: number): number {
    const mode = this.o.getTargetVisibility();
    if (!selectTargetAllowed(state, mode)) return 0;
    const ease = this.o.palette.easeInOut;
    if (state.tag === 'LEVEL_INTRO') {
      const t = now - this.introAt;
      const I = MOTION.intro;
      if (t < I.bandInAt) return 0;
      const fadeIn = ease(Math.min(1, (t - I.bandInAt) / I.bandInDuration));
      if (mode === 'always' || t < I.previewEndAt) return fadeIn;
      return 1 - ease(Math.min(1, (t - I.previewEndAt) / I.bandHideDuration));
    }
    if ((state.tag === 'SETTLING' || state.tag === 'RESULT') && mode === 'previewThenHide') {
      return ease(Math.min(1, (now - this.stopAt) / MOTION.targetReveal));
    }
    return 1;
  }

  private drawBand(state: GameState, now: number) {
    const run = selectRun(state);
    if (!run) return;
    const alpha = this.bandAlpha(state, now);
    if (alpha <= 0) return;
    const { ctx } = this;
    const band = selectBand(state, now);
    if (!band) return;
    const yTop = BOTTOM - (band.max / 100) * C.h;
    const yBot = BOTTOM - (band.min / 100) * C.h;
    const yMid = BOTTOM - (band.center / 100) * C.h;

    // Success colour transition 480–700ms after release.
    let color = this.o.palette.accent;
    let fillA = 0.16;
    if (state.tag === 'RESULT' && state.score.hit) {
      const t = now - this.stopAt;
      const { start, end } = MOTION.successBand;
      const u = Math.max(0, Math.min(1, (t - start) / (end - start)));
      color = u > 0.5 ? this.o.palette.success : this.o.palette.accent;
      fillA = u <= 0 || u >= 1 ? 0.16 : 0.16 + 0.08 * Math.sin(u * Math.PI);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = withAlpha(color, fillA);
    ctx.fillRect(C.x, yTop, C.w, yBot - yTop);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(C.x, yTop);
    ctx.lineTo(C.x + C.w, yTop);
    ctx.moveTo(C.x, yBot);
    ctx.lineTo(C.x + C.w, yBot);
    ctx.stroke();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(color, 0.46);
    ctx.beginPath();
    ctx.moveTo(C.x, yMid);
    ctx.lineTo(C.x + C.w, yMid);
    ctx.stroke();
    ctx.setLineDash([]);
    // Centre brackets outside the glass walls.
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(C.x - 16, yMid);
    ctx.lineTo(C.x - 10, yMid);
    ctx.moveTo(C.x + C.w + 10, yMid);
    ctx.lineTo(C.x + C.w + 16, yMid);
    ctx.stroke();
    ctx.restore();
  }

  // ── Result marker, tints, overflow ─────────────────────────────────────────
  private drawResult(state: GameState, now: number, reduced: boolean) {
    if (state.tag !== 'SETTLING' && state.tag !== 'RESULT') return;
    const { ctx } = this;
    const pal = this.o.palette;
    const y = BOTTOM - (state.score.volume / 100) * C.h;
    const failed = state.tag === 'RESULT' && !state.score.hit;
    const t = now - this.stopAt;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = failed ? pal.fail : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(STAGE.marker.x0, y);
    ctx.lineTo(STAGE.marker.x1, y);
    ctx.stroke();

    if (failed) {
      // Bracket from actual height to nearest band edge.
      const { min, max } = state.score.band;
      const edge = state.score.volume > max ? max : min;
      const ey = BOTTOM - (edge / 100) * C.h;
      ctx.beginPath();
      ctx.moveTo(STAGE.marker.x1, y);
      ctx.lineTo(STAGE.marker.x1, ey);
      ctx.stroke();

      // Edge tint on the glass.
      const F = MOTION.failTint;
      if (t >= F.start && t <= F.end) {
        const a = t < F.peak ? ((t - F.start) / (F.peak - F.start)) * 0.22 : (1 - (t - F.peak) / (F.end - F.peak)) * 0.22;
        ctx.strokeStyle = withAlpha(pal.fail, a);
        ctx.lineWidth = 6;
        ctx.strokeRect(C.x - 10, C.y - 10, C.w + 20, C.h + 22);
      }
    }

    // Success light sweep.
    if (state.tag === 'RESULT' && state.score.hit && !reduced) {
      const S = MOTION.successSweep;
      const u = (t - S.start) / (S.end - S.start);
      if (u >= 0 && u <= 1) {
        const x = C.x - 16 + u * (C.w + 8);
        const g = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 12, C.y, 24, C.h);
      }
    }

    // Overflow ribbons outside the front edges.
    const o = now - this.overflowAt;
    if (o >= 0 && o < 220 && !reduced) {
      const a = 1 - o / 220;
      ctx.fillStyle = `rgba(191,239,255,${0.7 * a})`;
      const drop = (o / 220) * 18;
      ctx.fillRect(C.x - 10, C.y - 12 + drop, 2, 30 - drop);
      ctx.fillRect(C.x + C.w + 8, C.y - 12 + drop, 2, 30 - drop);
    }
    ctx.restore();
  }

  private spawnSuccessDrops(at: number) {
    if (this.o.getReducedMotion()) return;
    const run = selectRun(this.o.controller.state);
    const heightPx = run ? (this.lastVolume / 100) * C.h : 0;
    const y = BOTTOM - heightPx;
    this.drops = Array.from({ length: 6 }, (_, i) => ({
      x: i < 3 ? C.x - 14 - i * 4 : C.x + C.w + 14 + (i - 3) * 4,
      y,
      vx: (i < 3 ? -1 : 1) * (4 + Math.random() * 8),
      vy: -(40 + Math.random() * 40),
      r: 1 + Math.random(),
      born: at + 40,
    }));
  }

  private drawDrops(now: number, reduced: boolean) {
    if (reduced || this.drops.length === 0) return;
    const { ctx } = this;
    const life = 600;
    ctx.save();
    for (const d of this.drops) {
      const t = (now - d.born) / 1000;
      if (t < 0 || t * 1000 > life) continue;
      const x = d.x + d.vx * t;
      const y = d.y + d.vy * t + 0.5 * 160 * t * t;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,247,245,${0.5 * (1 - (t * 1000) / life)})`;
      ctx.fill();
    }
    ctx.restore();
    if (this.drops.every((d) => now - d.born > life)) this.drops = [];
  }

  private applyShake(state: GameState, now: number, reduced: boolean) {
    let x = 0;
    if (!reduced && state.tag === 'RESULT' && !state.score.hit) {
      const t = now - this.stopAt - MOTION.shake.start;
      const keys = MOTION.shake.keys;
      if (t >= 0 && t <= keys[keys.length - 1][0]) {
        for (let i = 1; i < keys.length; i++) {
          if (t <= keys[i][0]) {
            const [t0, x0] = keys[i - 1];
            const [t1, x1] = keys[i];
            x = x0 + ((x1 - x0) * (t - t0)) / (t1 - t0);
            break;
          }
        }
      }
    }
    const next = x ? `translateX(${x * this.scale}px)` : '';
    if (this.o.shakeTarget.style.transform !== next) this.o.shakeTarget.style.transform = next;
  }
}
