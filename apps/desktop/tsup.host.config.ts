import { defineConfig } from 'tsup'

// The Node host as one file, which the Mac app starts beside its window. The sibling packages are bundled in.
// Also the native messaging host Chrome starts for the extension, and the install script the person runs (ADR 0009).
export default defineConfig({
  entry: { host: 'host/main.ts', 'native-host': 'host/extension/native-main.ts', 'install-native-host': 'host/extension/install.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'host-dist',
  outExtension: () => ({ js: '.mjs' }),
  noExternal: [/^@extantape\//],
  external: [/^node:/],
  clean: true,
  dts: false,
  sourcemap: false,
})
