// Play Store phone screenshots (1080×1920) from the dev build.
// Run: npm i --no-save puppeteer@24 ; start `npm run dev -- --port 5199 --strictPort` ; node scripts/capture-screenshots.mjs
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const URL = 'http://localhost:5199/';
const OUT = 'store/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('fill-line/save', JSON.stringify({ version: 1, seenTutorial: true, bestLevel: 7, gamesPlayed: 12 }));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(1500);
await page.screenshot({ path: `${OUT}/01-menu.png` });

const dispatch = (type) =>
  page.evaluate((t) => window.__fillLine.controller.dispatch({ type: t, now: performance.now() }), type);

await dispatch('START_RUN');
await sleep(900);
await page.screenshot({ path: `${OUT}/02-level-intro.png` });
await sleep(1800); // intro is 2300 ms → READY

const hold = await page.evaluate(() => {
  const f = window.__fillLine;
  const s = f.controller.state;
  return f.solveIdealHoldMs(f.getLevel(s.run.level), s.run.setup);
});
await dispatch('FILL_PRESS');
await sleep(hold * 0.65);
await page.screenshot({ path: `${OUT}/03-pouring.png` });
await sleep(hold * 0.35);
await dispatch('FILL_RELEASE');
await sleep(1400);
await page.screenshot({ path: `${OUT}/04-on-the-line.png` });

await browser.close();
console.log(`screenshots written to ${OUT}/`);
