import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@captiveorigins/onelineage-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
})
