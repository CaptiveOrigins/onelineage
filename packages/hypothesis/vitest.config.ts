import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@captiveorigins/onelineage-simulate': fileURLToPath(new URL('../simulate/src/index.ts', import.meta.url)) } },
  test: { testTimeout: 60000 },
})
