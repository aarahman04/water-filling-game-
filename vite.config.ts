import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const AD_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544'

// Release builds set VITE_ADS_MODE=production; refuse to build them with missing or test ad IDs.
function checkAdsEnv(env: Record<string, string>) {
  if (env.VITE_ADS_MODE !== 'production') return
  for (const key of ['VITE_ADMOB_REWARDED_ID', 'VITE_ADMOB_INTERSTITIAL_ID']) {
    const id = env[key] ?? ''
    if (!AD_UNIT.test(id) || id.startsWith(TEST_PUBLISHER)) throw new Error(`${key} must be a real AdMob ad unit ID when VITE_ADS_MODE=production`)
  }
  if (!/^https:\/\/\S+$/.test(env.VITE_PRIVACY_URL ?? '')) throw new Error('VITE_PRIVACY_URL must be an https URL when VITE_ADS_MODE=production')
}

// `vite build`                  → dist/  (static site for Vercel/Netlify + Capacitor webDir)
// `vite build --mode singlefile` → dist-single/index.html (everything inlined, for one-file sharing)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'ADMOB_'])
  checkAdsEnv(env)
  const appId = env.ADMOB_APP_ID ?? ''
  if (appId && (!/^ca-app-pub-\d{16}~\d{10}$/.test(appId) || appId.startsWith(TEST_PUBLISHER) || appId.startsWith('ca-app-pub-0000000000000000'))) {
    throw new Error('ADMOB_APP_ID must be a real AdMob app ID for app-ads.txt generation')
  }
  if (!appId && (env.VITE_ADS_MODE === 'production' || process.env.VERCEL_ENV === 'production')) {
    throw new Error('Set ADMOB_APP_ID in the build environment to generate app-ads.txt')
  }
  return {
    base: './',
    plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [{
      name: 'app-ads-txt',
      generateBundle() {
        if (!appId) return
        this.emitFile({
          type: 'asset',
          fileName: 'app-ads.txt',
          source: `google.com, ${appId.split('~')[0].replace('ca-app-', '')}, DIRECT, f08c47fec0942fa0\n`,
        })
      },
    } satisfies Plugin])],
    build: mode === 'singlefile' ? { outDir: 'dist-single', copyPublicDir: false } : { outDir: 'dist' },
    test: { environment: 'node' },
  }
})
