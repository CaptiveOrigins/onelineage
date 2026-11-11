import { defineConfig } from 'tsup'

// The extension as Chrome loads it: dist/ holds manifest.json, the service worker, the side panel and its page.
// Each script is one self-contained file. Nothing from Node is bundled.
export default defineConfig({
  entry: { background: 'src/background.ts', sidepanel: 'src/sidepanel.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'chrome116',
  outDir: 'dist',
  splitting: false,
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  publicDir: 'public',
})
