/**
 * Minimal synthesized SFX following the handoff's audio brief (no audio files ship):
 * soft pour loop (40ms in / 100ms out), glass ping on success reveal, dry tap on miss.
 * Driven purely by game hooks. The AudioContext is created on the first fillStart,
 * which always runs inside a pointer/key gesture, satisfying autoplay policies.
 */

import type { GameController } from '../game';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pour: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
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
    ];
    return () => offs.forEach((off) => off());
  }

  /** Unlock audio from any user gesture (Play button). */
  unlock() {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
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
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown-ish noise
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
    src.connect(filter).connect(gain).connect(this.master);
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

  private tone(freq: number, dur: number, type: OscillatorType, peak: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private ping() {
    this.tone(1760, 0.12, 'sine', 0.12);
    this.tone(2637, 0.1, 'sine', 0.05);
  }

  private tap() {
    this.tone(140, 0.1, 'triangle', 0.2);
  }
}
