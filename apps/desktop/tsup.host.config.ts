import { defineConfig } from 'tsup'

// The Node host as one file, which the Mac app starts beside its window. The sibling packages are bundled in.
export default defineConfig({
  entry: { host: 'host/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'host-dist',
  outExtension: () => ({ js: '.mjs' }),
  noExternal: [/^@captiveorigins\//],
  external: [/^node:/],
  clean: true,
  dts: false,
  sourcemap: false,
})
