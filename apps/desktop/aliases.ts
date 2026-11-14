import { fileURLToPath } from 'node:url'

/** The sibling packages, read from source in dev and tests, so nothing needs building first. */
const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url))
export const packageAliases = {
  '@extantape/onefamily-core': src('core'),
  '@extantape/onefamily-connectors': src('connectors'),
  '@extantape/onefamily-library': src('library'),
  '@extantape/onefamily-simulate': src('simulate'),
  '@extantape/onefamily-analysis': src('analysis'),
}
