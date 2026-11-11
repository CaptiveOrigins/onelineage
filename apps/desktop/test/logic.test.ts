import { describe, expect, it } from 'vitest'
import { normalizePedigree, projectPedigree, validatePedigree } from '@captiveorigins/onepedigree-core'
import type { BackupState, MatchRow, Status } from '../host/protocol'
import { firstLaunchStep, flowInputs, nextStepDown, stepLabel } from '../src/flow'
import { cmInput, DEFAULT_SORT, filterMatches, nextSort, NO_FILTER, sortMatches } from '../src/matches'
import { recordedTree, relabel, withCandidateFathers, type TreePerson } from '../src/pedigree'
import { createStandIns, standInCandidate, variantKey } from '../src/standins'

describe('stand-in names', () => {
  it('gives every instance of a word the same stand-in, wherever it appears', () => {
    const s = createStandIns('salt-1')
    const a = s.name('Corin Brathford')
    const b = s.name('Elsa Brathford')
    expect(a.split(' ')[1]).toBe(b.split(' ')[1])
    expect(s.name('BRATHFORD')).toBe(a.split(' ')[1]!.toUpperCase())
    expect(s.name('brathford')).toBe(a.split(' ')[1]!.toLowerCase())
    expect(a).not.toMatch(/Brathford|Corin/)
  })

  it('keeps digits and punctuation, and changes initials', () => {
    const s = createStandIns('salt-1')
    expect(s.name('brath42')).toMatch(/^[a-z]+42$/)
    const initials = s.name('B. K.')
    expect(initials).toMatch(/^[A-Z]\. [A-Z]\.$/)
    expect(initials).not.toBe('B. K.')
  })

  it('never gives two different words the same stand-in', () => {
    const s = createStandIns('salt-2')
    const words = Array.from({ length: 1500 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26) % 26)}x`)
    const out = new Set(words.map((w) => s.word(w.replace(/\d/g, ''))))
    expect(out.size).toBe(new Set(words.map((w) => w.replace(/\d/g, ''))).size)
  })

  it('is the same for the same salt, and different for another salt', () => {
    expect(createStandIns('a').name('Mirelle Dunmore')).toBe(createStandIns('a').name('Mirelle Dunmore'))
    expect(createStandIns('a').name('Mirelle Dunmore')).not.toBe(createStandIns('b').name('Mirelle Dunmore'))
    expect(standInCandidate('dunmore', 'a')).toMatch(/^[A-Z][a-z]+$/)
  })
})

describe('the first-launch flow', () => {
  const status = (home: Status['home']): Status => ({ home, current: home, demoAvailable: false, keyStore: '' })
  const lib = (use: boolean): NonNullable<Status['home']> => ({ path: '/x', created: '', demo: false, kits: 0, use: use ? { use: 'personal', at: '', policy: '' } : null })
  const backups = (destinations: number, required: number): BackupState => ({
    bypass: (2 - required) as 0 | 1 | 2,
    required,
    destinations: Array.from({ length: destinations }, (_, i) => ({ path: `/d${i}`, lastCheckedBackup: null, problems: [], warnings: [], cloudSynced: false })),
    verdict: { ok: false, required, current: 0, message: '' },
  })

  it('goes library, then use, then backups, then ready', () => {
    expect(firstLaunchStep(flowInputs(status(null), null))).toBe('library')
    expect(firstLaunchStep(flowInputs(status(lib(false)), backups(0, 2)))).toBe('use')
    expect(firstLaunchStep(flowInputs(status(lib(true)), backups(1, 2)))).toBe('backups')
    expect(firstLaunchStep(flowInputs(status(lib(true)), backups(2, 2)))).toBe('ready')
  })

  it('accepts fewer destinations only after the requirement was lowered', () => {
    expect(firstLaunchStep(flowInputs(status(lib(true)), backups(1, 1)))).toBe('ready')
    expect(firstLaunchStep(flowInputs(status(lib(true)), backups(0, 0)))).toBe('ready')
    expect(firstLaunchStep(flowInputs(status(lib(true)), null))).toBe('backups')
  })

  it('offers one step down at a time, saying what would be lost', () => {
    expect(nextStepDown(0)).toMatchObject({ to: 1 })
    expect(nextStepDown(1)).toMatchObject({ to: 2 })
    expect(nextStepDown(1)!.loses).toMatch(/lost/)
    expect(nextStepDown(2)).toBeNull()
    expect(stepLabel('use')).toBe('Step 2 of 3')
    expect(stepLabel('ready')).toBe('')
  })
})

describe('the matches table', () => {
  const row = (match: string, name: string, cm: number, side: MatchRow['side'], treeStatus: string, date: string | null): MatchRow => ({ match, name, cm, segments: Math.ceil(cm / 30), longestCm: cm / 2, side, treeStatus, date })
  const rows = [
    row('a', 'Corin Brathford', 870, 'paternal', 'Public linked tree', '2018-01-02'),
    row('b', 'Elsa Dunmore', 45, 'maternal', 'No trees', '2021-05-06'),
    row('c', 'velth42', 12, 'unassigned', 'Unlinked tree', null),
    row('d', 'Mira Brathford', 220, 'both', 'Private linked tree', '2016-03-04'),
  ]

  it('filters by name, side, tree and cM range', () => {
    expect(filterMatches(rows, { ...NO_FILTER, text: 'brath' }).map((r) => r.match)).toEqual(['a', 'd'])
    expect(filterMatches(rows, { ...NO_FILTER, side: 'maternal' }).map((r) => r.match)).toEqual(['b'])
    expect(filterMatches(rows, { ...NO_FILTER, tree: 'public' }).map((r) => r.match)).toEqual(['a'])
    expect(filterMatches(rows, { ...NO_FILTER, tree: 'any-tree' }).map((r) => r.match)).toEqual(['a', 'c', 'd'])
    expect(filterMatches(rows, { ...NO_FILTER, tree: 'no-tree' }).map((r) => r.match)).toEqual(['b'])
    expect(filterMatches(rows, { ...NO_FILTER, minCm: 20, maxCm: 300 }).map((r) => r.match)).toEqual(['b', 'd'])
  })

  it('searches the name as shown, so privacy mode never matches a hidden name', () => {
    const s = createStandIns('t')
    expect(filterMatches(rows, { ...NO_FILTER, text: 'brath' }, s.name)).toEqual([])
    const shown = s.name('Brathford').toLowerCase()
    expect(filterMatches(rows, { ...NO_FILTER, text: shown }, s.name).map((r) => r.match)).toEqual(['a', 'd'])
  })

  it('sorts each column both ways, with missing dates last', () => {
    expect(sortMatches(rows, DEFAULT_SORT).map((r) => r.match)).toEqual(['a', 'd', 'b', 'c'])
    expect(sortMatches(rows, { key: 'name', dir: 'ascending' }).map((r) => r.match)).toEqual(['a', 'b', 'd', 'c'])
    expect(sortMatches(rows, { key: 'date', dir: 'ascending' }).map((r) => r.match)).toEqual(['d', 'a', 'b', 'c'])
    expect(sortMatches(rows, { key: 'date', dir: 'descending' }).map((r) => r.match)).toEqual(['b', 'a', 'd', 'c'])
    expect(sortMatches(rows, { key: 'side', dir: 'ascending' }).map((r) => r.side)).toEqual(['both', 'maternal', 'paternal', 'unassigned'])
  })

  it('flips direction on the same header, and starts new columns sensibly', () => {
    expect(nextSort(DEFAULT_SORT, 'cm')).toEqual({ key: 'cm', dir: 'ascending' })
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', dir: 'ascending' })
    expect(nextSort(DEFAULT_SORT, 'date')).toEqual({ key: 'date', dir: 'descending' })
    expect(cmInput(' 20 ')).toBe(20)
    expect(cmInput('')).toBeNull()
    expect(cmInput('abc')).toBeNull()
    expect(cmInput('-4')).toBeNull()
  })
})

describe('OnePedigree documents for the theory page', () => {
  const p = (id: string, father: string | null, mother: string | null, sex: 'M' | 'F' = 'M'): TreePerson => ({ id, given: `G${id}`, surname: 'Brathford', sex, birthYear: 1900, deathYear: 1970, father, mother })
  const people = [p('me', 'dad', 'mum'), p('dad', 'gf', 'gm'), p('mum', 'mf', 'mm', 'F'), p('gf', null, null), p('gm', null, null, 'F'), p('mf', 'ggf', null), p('mm', null, null, 'F'), p('ggf', null, null), p('other', 'og', null), p('og', null, null)]

  it('follows recorded parents up to the generation limit', () => {
    const doc = recordedTree(people, 'me', 2)
    expect(doc.individuals.map((i) => i.id).sort()).toEqual(['dad', 'gf', 'gm', 'me', 'mf', 'mm', 'mum'])
    expect(validatePedigree(normalizePedigree(doc)).valid).toBe(true)
    expect(projectPedigree(normalizePedigree(doc), { focalId: 'me', view: 'pedigree', ancestorDepth: 3 }).occurrences.length).toBe(7)
  })

  it('moves the questioned father into candidates: the recorded man and the other man', () => {
    const doc = recordedTree(people, 'me', 3)
    const t = withCandidateFathers(doc, { child: 'mf', recordedFather: 'ggf', biologicalFather: 'other' }, people)
    const mf = t.individuals.find((i) => i.id === 'mf')!
    expect(mf.parentage?.parents).toEqual([])
    expect(mf.parentage?.uncertainParents).toEqual([{ role: 'father', candidates: [{ individual: 'ggf', probability: 0.5 }, { individual: 'other', probability: 0.5 }] }])
    expect(t.individuals.map((i) => i.id)).toEqual(expect.arrayContaining(['other', 'og', 'ggf']))
    expect(() => withCandidateFathers(doc, { child: 'mf', recordedFather: 'dad', biologicalFather: 'other' }, people)).toThrow(/isn't recorded as a parent/)
    expect(() => withCandidateFathers(doc, { child: 'mf', recordedFather: 'ggf', biologicalFather: 'other' }, people, { recorded: 0.7, other: 0.5 })).toThrow(/at most 1/)
  })

  it('relabels for the privacy switch without touching IDs or structure', () => {
    const s = createStandIns('x')
    const doc = relabel(recordedTree(people, 'me', 1), s.name)
    expect(doc.individuals.every((i) => !/Brathford/.test(i.label ?? ''))).toBe(true)
    expect(doc.individuals.map((i) => i.id).sort()).toEqual(['dad', 'me', 'mum'])
  })
})

describe('stand-ins keep the shape of the family (plan 2b)', () => {
  it('keeps patronymic endings and name prefixes', () => {
    const s = createStandIns('shape')
    expect(s.word('Halvardsdotter')).toMatch(/sdotter$/)
    expect(s.word('Bergsson')).toMatch(/sson$/)
    expect(s.word('McGarrow')).toMatch(/^Mc/)
    expect(s.name("O'Brennan")).toMatch(/^O'/)
    expect(s.name("O'Brennan")).not.toBe("O'Brennan")
  })
  it('gives spelling variants a shared root, and still keeps them apart', () => {
    expect(variantKey('Vellén')).toBe(variantKey('Velleen'))
    expect(variantKey('Garrick')).toBe(variantKey('Garick'))
    const s = createStandIns('variants')
    const a = s.word('Garrick')
    const b = s.word('Garick')
    expect(a).not.toBe(b)
    expect(a.slice(0, 4)).toBe(b.slice(0, 4))
  })
  it('never uses a real word from the library, and remembers pairings across sessions', () => {
    const fresh = createStandIns('keep').word('Arlow')
    const avoid = createStandIns('keep', { reserved: [fresh] }).word('Arlow')
    expect(avoid.toLowerCase()).not.toBe(fresh.toLowerCase())
    const saved: Record<string, string> = {}
    const first = createStandIns('one', { onNew: (w, s) => { saved[w] = s } })
    const x = first.word('Tennick')
    const later = createStandIns('a different salt', { known: saved })
    expect(later.word('Tennick')).toBe(x)
    expect(Object.keys(saved)).toEqual(['tennick'])
  })
  it('handles names that start with accented letters', () => {
    const s = createStandIns('accents')
    expect(s.name('Åsa Öberg')).not.toMatch(/Åsa|Öberg/)
  })
})
