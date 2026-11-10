import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Read sibling packages from source, so tests never depend on a stale build.
export default defineConfig({
  resolve: {
    alias: {
      '@captiveorigins/onelineage-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@captiveorigins/onelineage-simulate': fileURLToPath(new URL('../simulate/src/index.ts', import.meta.url)),
    },
  },
})
