import { founderGenome, child as makeChild } from './meiosis.js'
import type { Genome } from './genome.js'
import { givenName, handle, place, surname } from './names.js'
import { Rng } from './rng.js'

export const GENERATOR_VERSION = '0.1.0'

export type Sex = 'M' | 'F'
export type Person = {
  id: string
  given: string
  surname: string
  sex: Sex
  birthYear: number
  deathYear: number | null
  /** Parents as records and trees show them. */
  father: string | null
  mother: string | null
  /** Parents in fact. Differ from the recorded ones only where a misattribution is planted. */
  bioFather: string | null
  bioMother: string | null
  place: string
  tested: boolean
  guid: string | null
  /** A public username instead of a real-looking name, as some testers use. */
  displayName: string
  /** Whether this tester shares a tree, and how. */
  tree: 'Public linked tree' | 'Unlinked tree' | 'Private linked tree' | 'No trees'
  /** Test date, as the service would show it. */
  matchDate: string
  noise: boolean
}

export type Planted =
  | { kind: 'misattributed-father'; child: string; recordedFather: string; biologicalFather: string }
  | { kind: 'half-sibling-line'; parent: string; firstPartner: string; secondPartner: string; halfSibling: string }
  | { kind: 'double-cousins'; brothers: [string, string]; sisters: [string, string] }
  | { kind: 'intermarried-community'; founders: string[]; branchTop: string[] }
  | { kind: 'unrelated-small-matches'; people: string[] }

export type Family = {
  seed: number
  generatorVersion: string
  /** Family kits: the tester first, then any relatives who tested as part of the family. */
  kits: string[]
  persons: Person[]
  genomes: Map<string, Genome>
  planted: Planted[]
  /** For each family kit: the people noise matches share a false segment with, and how much. */
  noise: { kit: string; person: string; cm: number }[]
}

export type ScenarioOptions = {
  seed: number
  /** Chance that a living person of testing age has tested. */
  testRate?: number
  /** Unrelated people who match a family kit on one small, false segment. */
  noiseMatches?: number
  /** Upper bound on people, to keep runs fast. */
  maxPeople?: number
}

/**
 * The standard planted family. Positions use ahnentafel numbers from the tester (1):
 * 2 father, 3 mother, 4–7 grandparents, 8–15 great-grandparents, 16–31 their parents.
 *
 * Planted answers:
 * - **Misattributed father:** 6 (mother's father) is recorded as the son of 12, but his biological father
 *   is another man with his own family. Trees show 12.
 * - **Half-sibling line:** 4 (father's father) has a child with a second partner.
 * - **Double cousins:** 10 and 11 each have a sibling, and those siblings marry each other.
 * - **Intermarried community:** the parents of 14 and 15 come from a small community whose members
 *   married within it for generations, along with other community families.
 * - **Unrelated small matches:** noise matches sharing one false segment of 8–12 cM.
 */
export function standardFamily(opts: ScenarioOptions): Family {
  const rng = new Rng(opts.seed)
  const testRate = opts.testRate ?? 0.3
  const maxPeople = opts.maxPeople ?? 4000
  const persons = new Map<string, Person>()
  const genomes = new Map<string, Genome>()
  const planted: Planted[] = []
  let n = 0

  const add = (p: Omit<Person, 'id' | 'guid' | 'displayName' | 'tree' | 'matchDate' | 'deathYear' | 'tested' | 'noise'>, genome: Genome | null): Person => {
    if (persons.size >= maxPeople) throw new Error(`planted family grew past maxPeople (${maxPeople})`)
    const id = `P${String(++n).padStart(4, '0')}`
    const death = p.birthYear < 1935 ? p.birthYear + rng.int(55, 92) : null
    const person: Person = {
      ...p,
      id,
      deathYear: death,
      tested: false,
      guid: null,
      displayName: `${p.given} ${p.surname}`,
      tree: 'No trees',
      matchDate: '',
      noise: false,
    }
    persons.set(id, person)
    genomes.set(id, genome ?? founderGenome(id))
    return person
  }
  const founder = (sex: Sex, birthYear: number, sur?: string, at?: string, genome?: Genome) =>
    add({ given: givenName(rng, sex), surname: sur ?? surname(rng), sex, birthYear, father: null, mother: null, bioFather: null, bioMother: null, place: at ?? place(rng) }, genome ?? null)
  const birth = (f: Person, m: Person, year: number, opts2: { bioFather?: Person; sex?: Sex } = {}) => {
    const sex = opts2.sex ?? (rng.chance(0.5) ? 'M' : 'F')
    const bio = opts2.bioFather ?? f
    const g = makeChild(genomes.get(bio.id) as Genome, genomes.get(m.id) as Genome, rng)
    return add(
      { given: givenName(rng, sex), surname: f.surname, sex, birthYear: year, father: f.id, mother: m.id, bioFather: bio.id, bioMother: m.id, place: rng.chance(0.8) ? f.place : place(rng) },
      g,
    )
  }

  /** Descendants of a couple's line down to the present, with spouses as new founders. */
  const descend = (p: Person, spouseFrom?: (partner: Person) => Person) => {
    if (p.birthYear >= 1970 || persons.size > maxPeople - 60) return
    const spouse = spouseFrom?.(p) ?? founder(p.sex === 'M' ? 'F' : 'M', p.birthYear + rng.int(-4, 4))
    const [f, m] = p.sex === 'M' ? [p, spouse] : [spouse, p]
    const kids = p.birthYear < 1940 ? rng.int(1, 3) : rng.int(0, 2)
    for (let i = 0; i < kids; i++) descend(birth(f, m, p.birthYear + rng.int(23, 34)), spouseFrom)
  }

  // --- The intermarried community: 10 founders, four generations marrying within it.
  let community: Person[] = []
  const commFounders: Person[] = []
  for (let i = 0; i < 10; i++) commFounders.push(founder(i % 2 ? 'F' : 'M', 1720 + rng.int(-5, 5), undefined, 'Lowmere, Region C'))
  community = commFounders
  for (let gen = 1; gen <= 4; gen++) {
    const men = community.filter((p) => p.sex === 'M')
    const women = community.filter((p) => p.sex === 'F')
    const next: Person[] = []
    for (let i = 0; i < 12; i++) {
      const f = rng.pick(men)
      const m = rng.pick(women)
      next.push(birth(f, m, 1720 + gen * 30 + rng.int(-4, 4), { sex: i % 2 ? 'F' : 'M' }))
    }
    community = next
  }
  /** A spouse born into the community: a new descendant of its last generation, near the partner's age. */
  const fromCommunity = (partner: Person) => {
    const f = rng.pick(community.filter((p) => p.sex === 'M'))
    const m = rng.pick(community.filter((p) => p.sex === 'F'))
    const c = birth(f, m, partner.birthYear + rng.int(-4, 4), { sex: partner.sex === 'M' ? 'F' : 'M' })
    return c
  }

  // --- The tester's ancestors, top down. Generation 4 (16–31) are founders, except where planted.
  const A = new Map<number, Person>()
  const yearOf = (k: number) => 1992 - 29 * Math.floor(Math.log2(k)) + rng.int(-3, 3)

  // Double cousins: parents of 10 (20, 21) and of 11 (22, 23) are founders; their second children marry.
  for (let k = 16; k <= 31; k++) {
    if (k >= 28) {
      // 28–31 come from the community (born ~1840s, children of the last community generation).
      const sex: Sex = k % 2 ? 'F' : 'M'
      const f = rng.pick(community.filter((p) => p.sex === 'M'))
      const m = rng.pick(community.filter((p) => p.sex === 'F'))
      A.set(k, birth(f, m, yearOf(k), { sex }))
    } else {
      A.set(k, founder(k % 2 ? 'F' : 'M', yearOf(k)))
    }
  }
  planted.push({ kind: 'intermarried-community', founders: commFounders.map((p) => p.id), branchTop: [28, 29, 30, 31].map((k) => A.get(k)!.id) })

  const coupleChild = (k: number, opts2: { bioFather?: Person } = {}) =>
    birth(A.get(2 * k)!, A.get(2 * k + 1)!, yearOf(k), { sex: k % 2 ? 'F' : 'M', ...opts2 })

  // Misattributed father of 6: 12 is the recorded father; a different man is the biological father.
  const bioParents = [founder('M', yearOf(24)), founder('F', yearOf(25))] as const
  const realFather = birth(bioParents[0], bioParents[1], yearOf(12), { sex: 'M' })
  for (let i = 0; i < rng.int(1, 2); i++) descend(birth(bioParents[0], bioParents[1], yearOf(12) + rng.int(-6, 6)))
  const realFatherWife = founder('F', realFather.birthYear + 2)
  for (let i = 0; i < rng.int(2, 3); i++) descend(birth(realFather, realFatherWife, realFather.birthYear + rng.int(24, 34)))

  for (let k = 15; k >= 1; k--) {
    if (k === 6) {
      const c = coupleChild(6, { bioFather: realFather })
      A.set(6, c)
      planted.push({ kind: 'misattributed-father', child: c.id, recordedFather: A.get(12)!.id, biologicalFather: realFather.id })
    } else {
      A.set(k, coupleChild(k))
    }
  }

  // Siblings of every ancestor, and their lines (the tester's cousins).
  for (let k = 1; k <= 15; k++) {
    const f = A.get(2 * k)!
    const m = A.get(2 * k + 1)!
    const sibs = k === 1 ? rng.int(0, 2) : rng.int(1, 3)
    for (let i = 0; i < sibs; i++) {
      const sib = birth(f, m, A.get(k)!.birthYear + rng.int(-7, 7), { bioFather: k === 6 ? realFather : f })
      descend(sib, [7, 14, 15].includes(k) && rng.chance(0.5) ? fromCommunity : undefined)
    }
  }

  // Double cousins: a sibling of 10 marries a sibling of 11.
  const sibOf = (k: number, sex: Sex) => birth(A.get(2 * k)!, A.get(2 * k + 1)!, A.get(k)!.birthYear + rng.int(-4, 4), { sex })
  const brother = sibOf(10, 'M')
  const sister = sibOf(11, 'F')
  for (let i = 0; i < rng.int(2, 3); i++) descend(birth(brother, sister, brother.birthYear + rng.int(24, 34)))
  planted.push({ kind: 'double-cousins', brothers: [A.get(10)!.id, brother.id], sisters: [A.get(11)!.id, sister.id] })

  // Half-sibling line: 4 has a child with a second partner.
  const second = founder('F', A.get(4)!.birthYear + rng.int(-2, 6))
  const halfSib = birth(A.get(4)!, second, A.get(2)!.birthYear + rng.int(4, 12))
  descend(halfSib)
  planted.push({ kind: 'half-sibling-line', parent: A.get(4)!.id, firstPartner: A.get(5)!.id, secondPartner: second.id, halfSibling: halfSib.id })

  // Other community families with lines to the present (extra matches on that branch).
  for (let i = 0; i < 3; i++) {
    const f = rng.pick(community.filter((p) => p.sex === 'M'))
    const m = rng.pick(community.filter((p) => p.sex === 'F'))
    descend(birth(f, m, 1855 + rng.int(-5, 5)), fromCommunity)
  }

  // Who tested. The tester and the tester's mother are the family kits.
  const tester = A.get(1)!
  const mother = A.get(3)!
  const kits = [tester.id, mother.id]
  let day = 0
  const dateFor = () => {
    const d = new Date(Date.UTC(2015, 0, 1) + (day = (day + rng.int(1, 9)) % 4000) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  for (const p of persons.values()) {
    const living = p.deathYear === null && p.birthYear >= 1925 && p.birthYear <= 2005
    if (kits.includes(p.id) || (living && rng.chance(testRate))) {
      p.tested = true
      p.guid = rng.guid()
      p.matchDate = dateFor()
      p.displayName = rng.chance(0.15) ? handle(rng) : rng.chance(0.1) ? `${p.given[0]}. ${p.surname[0]}.` : `${p.given} ${p.surname}`
      p.tree = kits.includes(p.id) ? 'Private linked tree' : rng.pick(['Public linked tree', 'Public linked tree', 'Unlinked tree', 'Private linked tree', 'No trees'] as const)
    }
  }

  // Unrelated small matches: testers from outside the family, with one false segment each.
  const noise: Family['noise'] = []
  const noisePeople: string[] = []
  for (let i = 0; i < (opts.noiseMatches ?? 40); i++) {
    const p = founder(rng.chance(0.5) ? 'M' : 'F', 1950 + rng.int(0, 45))
    p.tested = true
    p.noise = true
    p.guid = rng.guid()
    p.matchDate = dateFor()
    p.displayName = rng.chance(0.3) ? handle(rng) : `${p.given} ${p.surname}`
    p.tree = rng.pick(['Public linked tree', 'Unlinked tree', 'No trees'] as const)
    noisePeople.push(p.id)
    noise.push({ kit: rng.pick(kits), person: p.id, cm: 8 + Math.round(rng.next() * 40) / 10 })
  }
  planted.push({ kind: 'unrelated-small-matches', people: noisePeople })

  return { seed: opts.seed, generatorVersion: GENERATOR_VERSION, kits, persons: [...persons.values()], genomes, planted, noise }
}
