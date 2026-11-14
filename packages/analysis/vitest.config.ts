import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Read sibling packages from source, so tests never depend on a stale build.
export default defineConfig({
  // Simulating the denser planted families takes a few seconds each.
  test: { testTimeout: 60_000 },
  resolve: {
    alias: {
      '@extantape/onefamily-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@extantape/onefamily-connectors': fileURLToPath(new URL('../connectors/src/index.ts', import.meta.url)),
      '@extantape/onefamily-simulate': fileURLToPath(new URL('../simulate/src/index.ts', import.meta.url)),
    },
  },
})
