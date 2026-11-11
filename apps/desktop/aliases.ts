import { fileURLToPath } from 'node:url'

/** The sibling packages, read from source in dev and tests, so nothing needs building first. */
const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url))
export const packageAliases = {
  '@captiveorigins/onelineage-core': src('core'),
  '@captiveorigins/onelineage-connectors': src('connectors'),
  '@captiveorigins/onelineage-library': src('library'),
  '@captiveorigins/onelineage-simulate': src('simulate'),
  '@captiveorigins/onelineage-analysis': src('analysis'),
}
