import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build`                  → dist/  (static site for Vercel/Netlify + Capacitor webDir)
// `vite build --mode singlefile` → dist-single/index.html (everything inlined, for one-file sharing)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: mode === 'singlefile' ? { outDir: 'dist-single', copyPublicDir: false } : { outDir: 'dist' },
  test: { environment: 'node' },
}))
