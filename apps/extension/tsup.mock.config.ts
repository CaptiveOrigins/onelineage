import { defineConfig } from 'tsup'

// The local mock genealogy site, for trying the extension by hand. Never part of the extension.
export default defineConfig({
  entry: { 'mock-site': 'mock-site/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'mock-dist',
  outExtension: () => ({ js: '.mjs' }),
  noExternal: [/^@extantape\//],
  external: [/^node:/],
  clean: true,
})
