import { describe, expect, it } from 'vitest'
import { exportKit, MATCH_LIST_COLUMNS, MATCH_TREE_COLUMNS, MIN_MATCH_CM, shared, SHARED_MATCH_COLUMNS, SHARED_MATCH_MIN_CM, standardFamily, truthJson, type Family, type Person } from '../src/index.js'

const family = standardFamily({ seed: 7 })
const byId = new Map(family.persons.map((p) => [p.id, p]))
const tester = byId.get(family.kits[0] as string) as Person
const g = (p: Person) => family.genomes.get(p.id)!

/** Ancestors through recorded parents, or through biological ones. */
function ancestors(p: Person, bio: boolean, out = new Set<string>()): Set<string> {
  for (const id of bio ? [p.bioFather, p.bioMother] : [p.father, p.mother]) {
    if (id && !out.has(id)) { out.add(id); ancestors(byId.get(id) as Person, bio, out) }
  }
  return out
}
const parseCsv = (text: string) => text.replace(/^﻿/, '').trimEnd().split('\n').map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1))

describe('the same seed gives the same family (S3)', () => {
  it('is byte-for-byte reproducible', () => {
    const again = standardFamily({ seed: 7 })
    expect(truthJson(again)).toBe(truthJson(family))
    expect(exportKit(again, tester.id).files).toEqual(exportKit(family, tester.id).files)
  })
  it('a different seed gives a different family', () => {
    expect(truthJson(standardFamily({ seed: 8 }))).not.toBe(truthJson(family))
  })
})

describe('the planted answers are really in the DNA', () => {
  const plant = <K extends Family['planted'][number]['kind']>(kind: K) =>
    family.planted.find((p) => p.kind === kind) as Extract<Family['planted'][number], { kind: K }>

  it('misattributed father: the recorded father\'s family shares no DNA with the tester; the real father\'s does', () => {
    const p = plant('misattributed-father')
    const recorded = byId.get(p.recordedFather)!
    const real = byId.get(p.biologicalFather)!
    const recordedParents = [recorded.father, recorded.mother].filter(Boolean) as string[]
    // Everyone descended from the recorded father's parents, but not from the tester's biological ancestors.
    const testerBio = ancestors(tester, true)
    let checked = 0
    for (const q of family.persons) {
      const qa = ancestors(q, true)
      if (!recordedParents.some((r) => qa.has(r)) || [...qa].some((a) => testerBio.has(a)) || testerBio.has(q.id)) continue
      expect(shared(g(tester), g(q)).totalCm).toBe(0)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
    // The real father's other descendants do share DNA with the tester.
    const realLine = family.persons.filter((q) => ancestors(q, true).has(real.id) && !ancestors(tester, true).has(q.id) && q.id !== tester.id)
    expect(realLine.some((q) => shared(g(tester), g(q)).totalCm > 0)).toBe(true)
    // And the trees still show the recorded father.
    expect(byId.get(p.child)!.father).toBe(recorded.id)
    expect(byId.get(p.child)!.bioFather).toBe(real.id)
  })

  it('half-sibling line: shares through one grandparent only', () => {
    const p = plant('half-sibling-line')
    const half = byId.get(p.halfSibling)!
    expect(half.bioFather).toBe(p.parent)
    expect(half.bioMother).toBe(p.secondPartner)
    expect(ancestors(tester, true).has(p.secondPartner)).toBe(false)
  })

  it('double cousins: two siblings from one family married two siblings from another', () => {
    const p = plant('double-cousins')
    const [b1, b2] = p.brothers.map((id) => byId.get(id)!)
    const [s1, s2] = p.sisters.map((id) => byId.get(id)!)
    expect(b1!.bioFather).toBe(b2!.bioFather)
    expect(s1!.bioFather).toBe(s2!.bioFather)
  })

  it('unrelated small matches carry one false segment and no shared matches', () => {
    const exp = exportKit(family, tester.id)
    const noise = exp.matches.filter((m) => m.noise)
    expect(noise.length).toBeGreaterThan(0)
    for (const m of noise) expect(m.cm).toBeLessThan(SHARED_MATCH_MIN_CM)
  })
})

describe('the exports have Genealogy Assistant\'s shapes', () => {
  const exp = exportKit(family, tester.id)
  const names = Object.keys(exp.files)
  const list = parseCsv(exp.files[names.find((n) => n.includes('DNA Matches'))!]!)

  it('the match list has the exact columns, a byte-order mark, and only matches of 8 cM or more', () => {
    expect(exp.files[names[0]!]!.startsWith('﻿')).toBe(true)
    expect(list[0]).toEqual([...MATCH_LIST_COLUMNS])
    const cm = list.slice(1).map((r) => Number(r[1]))
    expect(cm.every((x) => x >= MIN_MATCH_CM)).toBe(true)
    expect(cm).toEqual([...cm].sort((a, b) => b - a))
    expect(new Set(list.slice(1).map((r) => r[16])).size).toBe(list.length - 1)
  })

  it('shared-match files are symmetric and include only people at 20 cM or more with both', () => {
    const shared = names.filter((n) => n.startsWith('Shared Matches/'))
    expect(shared.length).toBeGreaterThan(10)
    const edges = new Set<string>()
    for (const n of shared) {
      const rows = parseCsv(exp.files[n]!)
      expect(rows[0]).toEqual([...SHARED_MATCH_COLUMNS])
      for (const r of rows.slice(1)) {
        expect(Number(r[1])).toBeGreaterThanOrEqual(SHARED_MATCH_MIN_CM)
        expect(Number(r[18])).toBeGreaterThanOrEqual(SHARED_MATCH_MIN_CM)
        edges.add(`${r[17]}>${r[15]}`)
      }
    }
    for (const e of edges) {
      const [a, b] = e.split('>')
      expect(edges.has(`${b}>${a}`)).toBe(true)
    }
  })

  it('match trees use the tree columns and hide living people', () => {
    const trees = parseCsv(exp.files[names.find((n) => n.includes('Match Trees'))!]!)
    expect(trees[0]).toEqual([...MATCH_TREE_COLUMNS])
    for (const r of trees.slice(1)) if (r[9] === 'Yes') { expect(r[6]).toBe('Living'); expect(r[7]).toBe('') }
  })
})
