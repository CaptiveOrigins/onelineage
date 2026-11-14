import { describe, expect, it } from 'vitest'
import { shared, standardFamily, type Family, type Person } from '@extantape/onefamily-simulate'
import { formatOdds, scoreHypotheses, type Observation, type TreePerson } from '../src/index.js'

const family: Family = standardFamily({ seed: 21 })
const byId = new Map(family.persons.map((p) => [p.id, p]))
const tester = byId.get(family.kits[0]!)!
const planted = family.planted.find((p) => p.kind === 'misattributed-father') as Extract<Family['planted'][number], { kind: 'misattributed-father' }>
const child = byId.get(planted.child)!
const recorded = byId.get(planted.recordedFather)!
const real = byId.get(planted.biologicalFather)!
const brother = family.persons.find((p) => p.id !== real.id && p.sex === 'M' && p.bioFather === real.bioFather && p.bioMother === real.bioMother)!

const bioAnc = (p: Person, out = new Set<string>()): Set<string> => {
  for (const id of [p.bioFather, p.bioMother]) if (id && !out.has(id)) { out.add(id); bioAnc(byId.get(id)!, out) }
  return out
}
/** A tree holding these people and all their biological ancestors, with one person's father replaced. */
function tree(ids: readonly string[], fatherOfChild: string): TreePerson[] {
  const keep = new Set<string>()
  const add = (id: string) => { if (keep.has(id)) return; keep.add(id); const p = byId.get(id)!; for (const x of [p.bioFather, p.bioMother]) if (x) add(x) }
  for (const id of [...ids, fatherOfChild, real.id, recorded.id, brother.id]) add(id)
  return [...keep].map((id) => {
    const p = byId.get(id)!
    return { id, father: id === child.id ? fatherOfChild : p.bioFather, mother: p.bioMother }
  })
}
const cm = (a: Person, b: Person) => { const x = shared(family.genomes.get(a.id)!, family.genomes.get(b.id)!).totalCm; return x < 8 ? 0 : Math.round(x) }

// The tester's matches from three families: the recorded father's, the real father's, and the real father's brother's.
const descendantsOf = (anc: Person, not: string[]) => family.persons.filter((p) => p.tested && !p.noise && p.id !== tester.id && bioAnc(p).has(anc.id) && !not.some((n) => bioAnc(p).has(n) || p.id === n))
const recordedSide = recorded.bioFather ? descendantsOf(byId.get(recorded.bioFather)!, [child.id]).slice(0, 4) : []
const realSide = descendantsOf(real, [child.id]).slice(0, 4)
const brotherSide = descendantsOf(brother, []).slice(0, 3)
const matches = [...recordedSide, ...realSide, ...brotherSide]
const obs: Observation[] = matches.map((m) => ({ a: tester.id, b: m.id, cm: cm(tester, m) }))
const ids = [tester.id, ...matches.map((m) => m.id)]

describe('the hypothesis engine finds the planted father', () => {
  it('has matches on each side to work with', () => {
    expect(realSide.length).toBeGreaterThan(0)
    expect(obs.some((o) => o.cm > 0)).toBe(true)
  })

  const result = scoreHypotheses(
    [
      { name: 'the recorded father', people: tree(ids, recorded.id) },
      { name: 'the biological father', people: tree(ids, real.id) },
      { name: "the biological father's brother", people: tree(ids, brother.id) },
    ],
    obs,
    { samples: 300, seed: 3 },
  )

  it('puts the true father first, with strong odds over the recorded one', () => {
    expect(result[0]!.name).toBe('the biological father')
    const recordedOdds = result.find((r) => r.name === 'the recorded father')!.posterior
    expect(recordedOdds).toBeLessThan(0.001)
  })

  it('reports odds, never a single answer, and explains each match', () => {
    expect(result.reduce((t, r) => t + r.posterior, 0)).toBeCloseTo(1, 9)
    for (const r of result) expect(r.perObservation).toHaveLength(obs.length)
    expect(formatOdds(result[0]!.posterior)).toMatch(/%$/)
  })

  it('is reproducible from its seed (S3)', () => {
    const again = scoreHypotheses([{ name: 'a', people: tree(ids, real.id) }], obs, { samples: 50, seed: 9 })
    const twice = scoreHypotheses([{ name: 'a', people: tree(ids, real.id) }], obs, { samples: 50, seed: 9 })
    expect(again[0]!.logLikelihood).toBe(twice[0]!.logLikelihood)
  })
})

describe('textbook relationships', () => {
  const t = (rows: [string, string | null, string | null][]) => rows.map(([id, father, mother]) => ({ id, father, mother }))
  // Two people who share 1,750 cM: half siblings or full siblings?
  const half = t([['F', null, null], ['M1', null, null], ['M2', null, null], ['A', 'F', 'M1'], ['B', 'F', 'M2']])
  const full = t([['F', null, null], ['M1', null, null], ['A', 'F', 'M1'], ['B', 'F', 'M1']])
  it('1,750 cM favours half siblings; 2,650 cM favours full siblings', () => {
    const at = (cm: number) => scoreHypotheses([{ name: 'half', people: half }, { name: 'full', people: full }], [{ a: 'A', b: 'B', cm }], { samples: 300, seed: 1 })[0]!.name
    expect(at(1750)).toBe('half')
    expect(at(2650)).toBe('full')
  })
  it('refuses a tree that names a missing parent or a loop', () => {
    expect(() => scoreHypotheses([{ name: 'x', people: t([['A', 'Z', null]]) }], [], { samples: 1 })).toThrow(/isn't in the tree/)
    expect(() => scoreHypotheses([{ name: 'x', people: t([['A', 'B', null], ['B', 'A', null]]) }], [], { samples: 1 })).toThrow(/own ancestor/)
  })
})
