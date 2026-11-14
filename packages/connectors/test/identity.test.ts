import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { BlindGate, IdentityRegistry, newPersonId, proposeLinks, type MatchObservation } from '@extantape/onefamily-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { exportKit, Rng, standardFamily } from '@extantape/onefamily-simulate'
import { importGenealogyAssistant } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const family = standardFamily({ seed: 31, testRate: 0.5 })
const enc = new TextEncoder()
const rng = new Rng(31)
const gauss = () => Math.sqrt(-2 * Math.log(rng.next() || 1e-9)) * Math.cos(2 * Math.PI * rng.next())

describe('the same person on two services', async () => {
  // Service A: both family kits, imported the normal way from planted exports.
  const imported = await Promise.all(family.kits.map(async (k) => {
    const files = Object.fromEntries(Object.entries(exportKit(family, k).files).map(([n, t]) => [n, enc.encode(t)]))
    return importGenealogyAssistant({ source: 'planted', files, terms, blind: new BlindGate() })
  }))
  const a: MatchObservation[] = imported.flatMap((r) => r.observations)
  const guidToPerson = new Map(family.persons.filter((p) => p.guid).map((p) => [p.guid!, p]))

  // Service B: a made-up second company. Some of the same people tested there too, under new IDs, with cM
  // measured differently (about ±8%) and sometimes a different display name.
  const kitPairs: [string, string][] = imported.map((r) => [r.kit, `B-${r.kit}`])
  const onB = new Map<string, string>()
  for (const o of a) {
    const p = guidToPerson.get(o.match)!
    if (p.noise || family.kits.includes(p.id)) continue
    if (!onB.has(p.id)) { if (rng.chance(0.5)) onB.set(p.id, `B-${p.id}-${rng.int(1000, 9999)}`); else onB.set(p.id, '') }
  }
  const b: MatchObservation[] = a.flatMap((o) => {
    const p = guidToPerson.get(o.match)!
    const idB = onB.get(p.id)
    if (!idB) return []
    const name = (Number(idB.slice(-4)) % 10) < 7 ? o.name : `user${idB.slice(-4)}`
    return [{ ...o, service: 'serviceb', kit: `B-${o.kit}`, match: idB, name, sharedCm: Math.max(8, o.sharedCm * (1 + 0.08 * gauss())) }]
  })

  const proposals = proposeLinks(a, b, kitPairs)
  const correct = proposals.filter((x) => onB.get(guidToPerson.get(x.a.id)!.id) === x.b.id)

  it('proposes links that are almost always right', () => {
    expect(proposals.length).toBeGreaterThan(10)
    expect(correct.length / proposals.length).toBeGreaterThan(0.95)
  })
  it('finds over half of the people who are on both, preferring to miss one over a wrong link', () => {
    const both = [...onB.values()].filter(Boolean).length
    expect(correct.length / both).toBeGreaterThan(0.5)
  })
  it('every proposal carries its evidence', () => {
    for (const x of proposals) expect(x.evidence.length).toBeGreaterThan(0)
  })
})

describe('the identity registry', () => {
  it('gives every person a permanent random ID', () => {
    const ids = new Set(Array.from({ length: 200 }, newPersonId))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^OL-[0-9A-HJKMNP-TV-Z]{20}$/)
  })
  it('links confirmed service IDs to one person, finds anchors, and refuses double links until undone', () => {
    const reg = new IdentityRegistry()
    const p = newPersonId()
    const link = (service: string, id: string, person = p) => ({ person, ref: { service, id }, evidence: ['test'], confirmedBy: 'owner', at: '2026-11-10' })
    reg.add(link('ancestry', 'X1'))
    expect(reg.anchors()).toEqual([])
    reg.add(link('serviceb', 'Y1'))
    expect(reg.anchors()).toEqual([p])
    expect(() => reg.add(link('ancestry', 'X1', newPersonId()))).toThrow(/already linked/)
    expect(reg.remove({ service: 'serviceb', id: 'Y1' })).toBe(true)
    expect(reg.anchors()).toEqual([])
  })
})
