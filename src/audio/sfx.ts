/**
 * Synthesized water and glass sounds (no downloads or audio files):
 * filtered pour with small bubble resonances, a warm chime on success, a soft miss cue.
 * Driven purely by game hooks. The AudioContext is created on the first fillStart,
 * which always runs inside a pointer/key gesture, satisfying autoplay policies.
 */

import type { GameController } from '../game';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pour: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private water: AudioBuffer | null = null;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  bind(c: GameController): () => void {
    const offs = [
      c.on('fillStart', () => this.startPour()),
      c.on('fillStop', () => this.stopPour()),
      c.on('levelPass', () => this.ping()),
      c.on('levelFail', () => this.tap()),
      c.on('pause', () => this.stopPour()),
      c.on('stateChange', ({ to }) => { if (to === 'MENU') this.stopPour(); }),
      c.on('victory', () => {
        [660, 880, 1320].forEach((freq, i) => this.tone(freq, 0.55, 'sine', 0.08, i * 0.12));
      }),
    ];
    return () => offs.forEach((off) => off());
  }

  /** Unlock audio from any user gesture (Play button). */
  unlock() {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private startPour() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.stopPour();
    if (!this.water) {
      const len = ctx.sampleRate * 4;
      this.water = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.water.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.88 + (Math.random() * 2 - 1) * 0.12;
        data[i] = last * (0.65 + 0.12 * Math.sin(2 * Math.PI * i / ctx.sampleRate));
      }
      // Short, rounded resonances make the stream sound liquid rather than like static.
      for (let start = 0; start < len; start += Math.floor(ctx.sampleRate * (0.08 + Math.random() * 0.12))) {
        const freq = 420 + Math.random() * 900;
        const duration = 0.045 + Math.random() * 0.04;
        for (let j = 0; j < ctx.sampleRate * duration; j++) {
          const t = j / ctx.sampleRate;
          data[(start + j) % len] += 0.16 * Math.sin(2 * Math.PI * (freq * t - 1800 * t * t)) * Math.sin(Math.PI * t / duration) ** 2;
        }
      }
      // Smooth the loop boundary to avoid a click every four seconds.
      const edge = Math.floor(ctx.sampleRate * 0.01);
      for (let i = 0; i < edge; i++) {
        data[i] *= i / edge;
        data[len - 1 - i] *= i / edge;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = this.water;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.5;
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 0.06);
    src.connect(filter).connect(lowCut).connect(gain).connect(this.master);
    src.onended = () => { src.disconnect(); filter.disconnect(); lowCut.disconnect(); gain.disconnect(); };
    src.start();
    this.pour = { src, gain };
  }

  private stopPour() {
    if (!this.pour || !this.ctx) return;
    const { src, gain } = this.pour;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    src.stop(t + 0.12);
    this.pour = null;
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  private ping() {
    this.tone(880, 0.42, 'sine', 0.10);
    this.tone(1320, 0.32, 'sine', 0.045, 0.065);
  }

  private tap() {
    this.tone(220, 0.16, 'sine', 0.09);
    this.tone(165, 0.2, 'sine', 0.065, 0.06);
  }
}
