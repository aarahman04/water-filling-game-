import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = mkdtempSync(join(tmpdir(), 'fill-line-ads-'));
const env = { ...process.env, ADMOB_APP_ID: '', VITE_ADS_MODE: '', VERCEL_ENV: '' };
const build = (overrides) => spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', output,
], { env: { ...env, ...overrides }, encoding: 'utf8' });

try {
  // Synthetic IDs only: no credentials or live ad requests.
  const result = build({
    ADMOB_APP_ID: 'ca-app-pub-1111111111111111~1111111111',
    VITE_ADS_MODE: 'production',
    VITE_ADMOB_REWARDED_ID: 'ca-app-pub-1111111111111111/1111111111',
    VITE_ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1111111111111111/2222222222',
    VITE_PRIVACY_URL: 'https://example.com/privacy.html',
    VERCEL_ENV: 'production',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(output, 'app-ads.txt'), 'utf8'),
    'google.com, pub-1111111111111111, DIRECT, f08c47fec0942fa0\n');
  const missing = build({ VERCEL_ENV: 'production' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Set ADMOB_APP_ID/);
  const invalid = build({ ADMOB_APP_ID: 'ca-app-pub-0000000000000000~0000000000' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /ADMOB_APP_ID must be a real/);
  console.log('Ad build checks passed: generated seller, missing ID, placeholder ID.');
} finally {
  rmSync(output, { recursive: true, force: true });
}
