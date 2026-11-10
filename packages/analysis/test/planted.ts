/**
 * Test helper: a planted (made-up) family, exported as one kit's Genealogy Assistant files, read back through the
 * real importer, plus the truth about how each match is related to the kit.
 */
import { fileURLToPath } from 'node:url'
import { BlindGate } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { importGenealogyAssistant, type ImportResult } from '@captiveorigins/onelineage-connectors'
import { exportKit, standardFamily, type Family, type Person } from '@captiveorigins/onelineage-simulate'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const enc = new TextEncoder()

export type MatchTruth = {
  guid: string
  person: Person
  cm: number
  noise: boolean
  /** Ahnentafel numbers (biological, from the kit) of the closest ancestors the match shares with the kit. */
  closest: number[]
}

export type PlantedKit = {
  family: Family
  imported: ImportResult
  truth: Map<string, MatchTruth>
  /** The kit's biological ahnentafel number(s) for each ancestor. */
  ahnentafel: Map<string, number[]>
  /** Recorded-father line: descendants of the recorded father's parents who aren't biological kin of the kit. */
  recordedLine: Set<string>
}

const gen = (a: number) => Math.floor(Math.log2(a))
/** The ancestor at generation `g` above the kit that ahnentafel number `a` descends through. */
export const branchAt = (a: number, g: number) => (gen(a) >= g ? a >> (gen(a) - g) : null)

/** The branch at generation `g` shared by all of a match's closest common ancestors, or null if they differ. */
export function branch(t: MatchTruth, g: number): number | null {
  const set = new Set(t.closest.map((a) => branchAt(a, g)))
  return set.size === 1 ? ([...set][0] ?? null) : null
}

export async function plantedKit(seed: number, kitIndex = 0, testRate?: number): Promise<PlantedKit> {
  const family = standardFamily(testRate === undefined ? { seed } : { seed, testRate })
  const kitId = family.kits[kitIndex] as string
  const exported = exportKit(family, kitId)
  const files = Object.fromEntries(Object.entries(exported.files).map(([k, v]) => [k, enc.encode(v)]))
  const imported = await importGenealogyAssistant({ source: 'planted', files, terms, blind: new BlindGate() })

  const byId = new Map(family.persons.map((p) => [p.id, p]))
  const ahnentafel = new Map<string, number[]>()
  const walk = (id: string | null, a: number) => {
    if (!id || a >= 1 << 12) return
    const list = ahnentafel.get(id)
    if (list) list.push(a)
    else ahnentafel.set(id, [a])
    const p = byId.get(id) as Person
    walk(p.bioFather, 2 * a)
    walk(p.bioMother, 2 * a + 1)
  }
  walk(kitId, 1)
  const bioAncestors = (id: string, out = new Set<string>()) => {
    const p = byId.get(id) as Person
    for (const x of [p.bioFather, p.bioMother]) if (x && !out.has(x)) { out.add(x); bioAncestors(x, out) }
    return out
  }

  const truth = new Map<string, MatchTruth>()
  for (const m of exported.matches) {
    const person = byId.get(m.person) as Person
    const common = [...bioAncestors(person.id)].flatMap((x) => ahnentafel.get(x) ?? []).filter((a) => a > 1)
    const nearest = common.length ? Math.min(...common.map(gen)) : 0
    truth.set(m.guid, { guid: m.guid, person, cm: m.cm, noise: m.noise, closest: common.filter((a) => gen(a) === nearest) })
  }

  const mis = family.planted.find((p) => p.kind === 'misattributed-father')
  const recordedLine = new Set<string>()
  if (mis?.kind === 'misattributed-father') {
    const recorded = byId.get(mis.recordedFather) as Person
    const parents = [recorded.father, recorded.mother].filter(Boolean) as string[]
    for (const p of family.persons) {
      const anc = bioAncestors(p.id)
      if (parents.some((x) => anc.has(x)) && ![...anc].some((x) => ahnentafel.has(x)) && !ahnentafel.has(p.id)) recordedLine.add(p.id)
    }
  }
  return { family, imported, truth, ahnentafel, recordedLine }
}
