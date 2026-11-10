import { defineConfig } from 'vitest/config'
import { packageAliases } from './aliases'

export default defineConfig({
  resolve: { alias: packageAliases },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30000 },
})
