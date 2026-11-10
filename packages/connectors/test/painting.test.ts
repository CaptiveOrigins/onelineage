import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { assignSides, compareKits, paint } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { AlleleBook, genotypesOf, makePanel, shared, standardFamily, writeRaw, type Person } from '@captiveorigins/onelineage-simulate'
import { importRawDna } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const family = standardFamily({ seed: 9 })
const panel = makePanel(9, 50)
const book = new AlleleBook(panel, 9)
const enc = new TextEncoder()
const byId = new Map(family.persons.map((p) => [p.id, p]))
const kitOf = async (p: Person) => (await importRawDna({ file: `${p.id}.txt`, bytes: enc.encode(writeRaw('23andme', panel, genotypesOf(family.genomes.get(p.id)!, panel, book, Number(p.id.slice(1))))), terms })).calls

const bioAncestors = (p: Person, out = new Set<string>()): Set<string> => {
  for (const id of [p.bioFather, p.bioMother]) if (id && !out.has(id)) { out.add(id); bioAncestors(byId.get(id)!, out) }
  return out
}
const tester = byId.get(family.kits[0]!)!
const mother = byId.get(family.kits[1]!)!
const mothersFather = byId.get(mother.bioFather!)!
const mothersMother = byId.get(mother.bioMother!)!
const truthCm = (a: Person, b: Person) => shared(family.genomes.get(a.id)!, family.genomes.get(b.id)!).totalCm
/** A cousin through one of the mother's parents' families, but not descended from the mother's parent itself. */
const cousinVia = (grandparent: Person) => {
  const gp = new Set([grandparent.bioFather, grandparent.bioMother].filter(Boolean) as string[])
  return family.persons.find((p) => {
    const a = bioAncestors(p)
    return p.id !== mother.id && [...gp].some((g) => a.has(g)) && !a.has(grandparent.id) && p.id !== grandparent.id && truthCm(tester, p) >= 40
  })
}

describe('painting segments onto ancestors', async () => {
  const rMP = cousinVia(mothersFather)!
  const rMM = cousinVia(mothersMother)!
  const [kt, km, k1, k2] = await Promise.all([kitOf(tester), kitOf(mother), kitOf(rMP), kitOf(rMM)])
  const refs = [
    { name: 'cousin through the mother\'s father', path: 'MP', segments: assignSides(compareKits(kt, k1).segments, compareKits(km, k1).segments, null) },
    { name: 'cousin through the mother\'s mother', path: 'MM', segments: assignSides(compareKits(kt, k2).segments, compareKits(km, k2).segments, null) },
  ]
  const { stretches, conflicts } = paint(refs)

  it('a maternal cousin\'s segments are placed on the mother\'s side', () => {
    expect(refs[0]!.segments.length).toBeGreaterThan(0)
    expect(refs[0]!.segments.every((s) => s.side === 'maternal')).toBe(true)
  })

  it('each painted stretch really came from that ancestor\'s family (checked against the simulation)', () => {
    const genome = family.genomes.get(tester.id)!
    const mp = bioAncestors(mothersFather)
    const mm = bioAncestors(mothersMother)
    expect(stretches.length).toBeGreaterThan(0)
    for (const s of stretches) {
      const mid = (s.startCm + s.endCm) / 2
      const seg = genome[1][Number(s.chromosome) - 1]!.find((x) => x.start <= mid && mid < x.end)!
      const founder = seg.label.split(':')[0]!
      const lineage = s.path === 'MP' ? mp : mm
      expect(lineage.has(founder) || founder === (s.path === 'MP' ? mothersFather.id : mothersMother.id)).toBe(true)
    }
  })

  it('the two lines never claim the same stretch', () => {
    expect(conflicts).toEqual([])
  })

  it('without a parent kit, sides stay unknown and nothing is painted', () => {
    const unsided = assignSides(compareKits(kt, k1).segments, null, null)
    expect(unsided.every((s) => s.side === 'unknown')).toBe(true)
    expect(paint([{ name: 'x', path: 'MP', segments: unsided }]).stretches).toEqual([])
  })
})

describe('conflicts are reported, never guessed away', () => {
  it('two lines claiming the same stretch on one side', () => {
    const seg = { chromosome: '1', startBp: 1, endBp: 2, startCm: 10, endCm: 40, cm: 30, markers: 900, side: 'maternal' as const }
    const r = paint([{ name: 'a', path: 'MP', segments: [seg] }, { name: 'b', path: 'MM', segments: [seg] }])
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]!.paths).toEqual(['MP', 'MM'])
  })
  it('a deeper ancestor inside the same line is not a conflict', () => {
    const seg = { chromosome: '1', startBp: 1, endBp: 2, startCm: 10, endCm: 40, cm: 30, markers: 900, side: 'maternal' as const }
    expect(paint([{ name: 'a', path: 'MP', segments: [seg] }, { name: 'b', path: 'MPM', segments: [seg] }]).conflicts).toEqual([])
  })
})
