import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
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
  checkAdsEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
    base: './',
    plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
    build: mode === 'singlefile' ? { outDir: 'dist-single', copyPublicDir: false } : { outDir: 'dist' },
    test: { environment: 'node' },
  }
})
