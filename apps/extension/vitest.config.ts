import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: { alias: { '@captiveorigins/onelineage-core': src('core'), '@captiveorigins/onelineage-simulate': src('simulate') } },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60000 },
})
