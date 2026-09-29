// Run with Vite on port 5199 and the optional Puppeteer used by capture-screenshots.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const out = join(tmpdir(), 'fill-line-ui');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gameState = () => page.evaluate(() => window.__fillLine.controller.state.tag);
const until = (tag) => page.waitForFunction((t) => window.__fillLine.controller.state.tag === t, {}, tag);
await page.evaluateOnNewDocument(() => localStorage.setItem('fill-line/save', JSON.stringify({ version: 1, seenTutorial: true })));

try {
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [412, 915]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle0' });
    await page.locator('.controls .cta').click();
    await page.waitForSelector('.card--brief');
    assert.equal(await gameState(), 'PAUSED');
    await page.screenshot({ path: join(out, `brief-${width}.png`) });
    if (width === 320) {
      await page.locator('.brief__actions .cta--secondary').click();
      await wait(3100);
      assert.equal(await gameState(), 'PAUSED', 'Keep reading must hold the preview');
    }
    if (width !== 390) await page.locator('.brief__actions .cta--primary').click();
    await until('READY'); // One size exercises automatic dismissal without clicking.
    await wait(220);
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const { x, y, width, height, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height, bottom };
      };
      return {
        hud: rect('.hud'), lives: rect('.hud__lives'), art: rect('.stage__art'), button: rect('.controls .cta'),
        color: getComputedStyle(document.querySelector('.life__full')).color,
        stageText: document.querySelector('.stage').innerText,
        inert: document.querySelector('main').inert,
      };
    });
    assert.ok(Math.abs(layout.lives.x + layout.lives.width / 2 - width / 2) < 1, 'Lives must be centered');
    assert.equal(layout.color, 'rgb(131, 216, 243)');
    assert.equal(layout.stageText, '', 'No instructions may overlap the glass');
    assert.equal(layout.inert, false);
    assert.ok(layout.art.y >= layout.hud.bottom - 1);
    assert.ok(layout.art.bottom <= layout.button.y, 'Glass must fit above the button');
    assert.ok(layout.button.height >= 56 && layout.button.bottom <= height);
    await page.screenshot({ path: join(out, `ready-${width}.png`) });
  }

  // Real pointer capture: release outside the control still stops the water.
  const button = await page.$('.controls .cta');
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await until('FILLING');
  await wait(100);
  await page.mouse.move(4, 4);
  await page.mouse.up();
  await until('RESULT');
  assert.equal(await page.evaluate(() => window.__fillLine.controller.state.run.lives), 2);
  await wait(500);
  await page.locator('.controls .cta').click();
  await page.waitForSelector('.card--brief');
  assert.equal(await gameState(), 'PAUSED', 'Retry must get a new brief');

  // Drive perfect attempts through every level to verify stacked twist instructions.
  await page.evaluate(() => window.__fillLine.controller.stop());
  for (let level = 1; level <= 20; level++) {
    console.log(`Checking level ${level}`);
    await page.waitForFunction((n) => document.querySelector('.brief__eyebrow')?.textContent.includes(String(n).padStart(2, '0')), {}, level);
    assert.equal(await page.evaluate(() => window.__fillLine.controller.state.resumeTo.run.level), level);
    const instructionCount = await page.$$eval('.brief__twists li', (items) => items.length);
    const expected = await page.evaluate(() => {
      const s = window.__fillLine.controller.state.resumeTo;
      return Object.values(window.__fillLine.getLevel(s.run.level).twists).filter(Boolean).length;
    });
    assert.equal(instructionCount, expected);
    if (level === 20) await page.screenshot({ path: join(out, 'brief-level-20.png') });
    await page.locator('.brief__actions .cta--primary').click();
    await until('LEVEL_INTRO');
    const remainingPreview = await page.evaluate(() => window.__fillLine.controller.state.readyAt - performance.now());
    assert.ok(remainingPreview > 2000, 'Closing the brief must replay the full preview');
    await page.evaluate(() => {
      const f = window.__fillLine;
      f.controller.tick(f.controller.state.readyAt + 1);
    });
    await until('READY');
    await page.evaluate(() => {
      const f = window.__fillLine;
      const s = f.controller.state;
      const hold = f.solveIdealHoldMs(f.getLevel(s.run.level), s.run.setup);
      const t = performance.now();
      f.controller.dispatch({ type: 'FILL_PRESS', now: t - hold });
      f.controller.dispatch({ type: 'FILL_RELEASE', now: t });
      f.controller.tick(t + 500);
    });
    await until('RESULT');
    assert.equal(await page.evaluate(() => window.__fillLine.controller.state.score.hit), true);
    await page.evaluate(() => {
      const c = window.__fillLine.controller;
      if (c.state.next === 'victory') c.tick(c.state.advanceAt + 1);
      else c.dispatch({ type: 'CONTINUE', now: c.state.advanceAt + 1 });
    });
  }
  await until('VICTORY');

  // Render real Web Audio graphs offline: sound must be finite, quiet, and muteable.
  const sound = await page.evaluate(async () => {
    const { Sfx } = await import('/src/audio/sfx.ts');
    const { GameController, GAMEPLAY, getLevel, solveIdealHoldMs } = await import('/src/game/index.ts');
    const original = window.AudioContext;
    const results = [];
    try {
      for (const muted of [false, true]) {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        window.AudioContext = function () { return ctx; };
        const c = new GameController();
        const sfx = new Sfx(muted);
        const off = sfx.bind(c);
        c.dispatch({ type: 'START_RUN', now: 0, seed: 1 });
        c.tick(GAMEPLAY.timing.introMs);
        const hold = solveIdealHoldMs(getLevel(1), c.state.run.setup);
        c.dispatch({ type: 'FILL_PRESS', now: GAMEPLAY.timing.introMs });
        c.dispatch({ type: 'FILL_RELEASE', now: GAMEPLAY.timing.introMs + hold });
        c.tick(GAMEPLAY.timing.introMs + hold + 500);
        const data = (await ctx.startRendering()).getChannelData(0);
        results.push({ muted, finite: data.every(Number.isFinite), peak: data.reduce((n, v) => Math.max(n, Math.abs(v)), 0) });
        off();
      }
    } finally { window.AudioContext = original; }
    return results;
  });
  assert.ok(sound[0].finite && sound[0].peak > 0 && sound[0].peak < 0.5);
  assert.equal(sound[1].peak, 0);

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced');
  assert.equal(await page.$eval('.card', (card) => getComputedStyle(card).animationDuration), '0.1s');
  assert.deepEqual(errors, []);
  console.log(`UI checks passed: four phone sizes, automatic/held instructions, pointer capture, retries, all 20 levels, reduced motion, and offline sound/mute. Screenshots: ${out}`);
} finally {
  await browser.close();
}
