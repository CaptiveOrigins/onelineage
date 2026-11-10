#!/usr/bin/env node
/**
 * Write a planted family to disk: one folder per family kit, in Genealogy Assistant's CSV shapes, plus truth.json.
 *   onelineage-simulate --seed 1 --out fixtures/generated/planted-1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { exportKit, standardFamily, truthJson } from './index.js'

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const seed = Number(arg('seed', '1'))
const out = arg('out', `fixtures/generated/planted-${seed}`) as string
if (!Number.isInteger(seed)) throw new Error('--seed must be a whole number')

const family = standardFamily({ seed })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'truth.json'), truthJson(family))
for (const kitId of family.kits) {
  const kit = family.persons.find((p) => p.id === kitId)!
  const { files, matches } = exportKit(family, kitId)
  for (const [name, text] of Object.entries(files)) {
    const path = join(out, `Kit ${kit.displayName}`, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  console.log(`${kit.displayName}: ${matches.length} matches, ${Object.keys(files).length} files`)
}
console.log(`Made-up family, seed ${seed}, written to ${out}`)
