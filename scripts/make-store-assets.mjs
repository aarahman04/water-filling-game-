// Rasterizes the brand drop (public/favicon.svg) into Capacitor asset sources and Play Store graphics.
// Run: npm i --no-save sharp@0.34 && node scripts/make-store-assets.mjs
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const BG = '#101f2c';
const WATER = '#229dc2';

/** The favicon drop (24×24 design grid) scaled to `size` px, centred on (cx, cy). */
const drop = (size, cx, cy) => {
  const k = size / 24;
  const t = `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})`;
  return (
    `<path transform="${t}" d="M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Z" fill="${WATER}"/>` +
    `<path transform="${t}" d="M8 15c0 2 1 3 2 3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/>`
  );
};
const svg = (w, h, body, bg = BG) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      (bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : '') +
      body +
      '</svg>',
  );

await mkdir('assets', { recursive: true });
await mkdir('store', { recursive: true });

await sharp(svg(1024, 1024, drop(760, 512, 512))).png().toFile('assets/icon-only.png');
await sharp(svg(1024, 1024, drop(520, 512, 512), null)).png().toFile('assets/icon-foreground.png'); // adaptive safe zone
await sharp(svg(1024, 1024, '')).png().toFile('assets/icon-background.png');
await sharp(svg(2732, 2732, drop(560, 1366, 1366))).png().toFile('assets/splash.png');
await sharp(svg(2732, 2732, drop(560, 1366, 1366))).png().toFile('assets/splash-dark.png');

// Play Console: 512×512 32-bit PNG icon, 1024×500 24-bit feature graphic.
await sharp(svg(512, 512, drop(380, 256, 256))).ensureAlpha().png().toFile('store/icon-512.png');
const title =
  `<text x="470" y="235" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="130" fill="#ffffff">FILL</text>` +
  `<text x="470" y="370" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="130" fill="${WATER}">LINE</text>`;
await sharp(svg(1024, 500, drop(320, 250, 250) + title)).flatten({ background: BG }).removeAlpha().png().toFile('store/feature-graphic.png');

console.log('assets/ and store/ written');
