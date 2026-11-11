/**
 * The demo library: a planted family from `@captiveorigins/onelineage-simulate`, stored the way a real
 * library stores exports. Every person in it is invented. It lives in its own folder, never in the user's
 * library, so made-up kits can't mix with real ones.
 *
 * For each family kit it stores:
 *   - the match export, in Genealogy Assistant's CSV shapes (`<date> planted matches <name>`)
 *   - a raw DNA file in one company's layout (`<date> planted raw DNA <name>`)
 * and for the tester:
 *   - the recorded family tree as a OnePedigree document (`<date> planted own tree <name>`)
 *   - the planted answers (`<date> planted answers`), which a real library never has
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initLibrary, storeExport } from '@captiveorigins/onelineage-library'
import { AlleleBook, exportKit, genotypesOf, makePanel, standardFamily, truthJson, writeRaw, type RawFormat } from '@captiveorigins/onelineage-simulate'
import { recordedTree } from '../src/pedigree'

const enc = new TextEncoder()
const RAW_LAYOUTS: readonly RawFormat[] = ['ancestry', '23andme']

export const DEMO_NOTE = 'MADE-UP DEMO.txt'

export async function createDemoLibrary(dir: string, seed: number, now = new Date()): Promise<void> {
  initLibrary(dir, now)
  writeFileSync(
    join(dir, DEMO_NOTE),
    `This library was made up by OneLineage (planted family, seed ${seed}). Every person, name and DNA file in it is invented.\n`,
  )
  const date = now.toISOString().slice(0, 10)
  const family = standardFamily({ seed })
  const byId = new Map(family.persons.map((p) => [p.id, p]))
  // About 50 markers per cM, close to a real chip, so comparisons find real segments rather than chance runs.
  const panel = makePanel(seed, 50)
  const book = new AlleleBook(panel, seed)

  for (const [i, kitId] of family.kits.entries()) {
    const kit = byId.get(kitId)!
    const { files } = exportKit(family, kitId)
    await storeExport(dir, { date, service: 'planted', label: `matches ${kit.displayName}`, files: encodeAll(files) })
    const layout = RAW_LAYOUTS[i % RAW_LAYOUTS.length] as RawFormat
    const raw = writeRaw(layout, panel, genotypesOf(family.genomes.get(kitId)!, panel, book, seed * 31 + i), date)
    await storeExport(dir, { date, service: 'planted', label: `raw DNA ${kit.displayName}`, files: { [`${layout}-raw-data.txt`]: enc.encode(raw) } })
  }

  const tester = byId.get(family.kits[0] as string)!
  const tree = recordedTree(family.persons, tester.id, 4)
  await storeExport(dir, { date, service: 'planted', label: `own tree ${tester.displayName}`, files: { 'own-tree.onepedigree.json': enc.encode(JSON.stringify(tree, null, 2) + '\n') } })
  await storeExport(dir, { date, service: 'planted', label: 'answers', files: { 'truth.json': enc.encode(truthJson(family)) } })
}

function encodeAll(files: Record<string, string>): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))
}
