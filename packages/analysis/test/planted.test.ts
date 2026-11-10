/**
 * Safeguard S2: the analysis must find the planted answers in made-up families before it sees real data.
 * Each family is simulated, exported in Genealogy Assistant's shapes, and read back through the real importer.
 */
import { describe, expect, it } from 'vitest'
import { buildMatchGraph, clusterKit, nestedSplit, propagateFromSeeds, SeededRandom, UNPLACED, type ClusterRun } from '../src/index.js'
import { branch, branchAt, plantedKit, type MatchTruth, type PlantedKit } from './planted.js'

const gen = (a: number) => Math.floor(Math.log2(a))
/** Shares DNA with the kit only through the intermarried community: every closest shared ancestor is a
 * community-born great-great-grandparent or further back, on the maternal grandmother's side. */
const viaCommunity = (t: MatchTruth) => t.closest.length > 0 && t.closest.every((a) => gen(a) >= 4 && branchAt(a, 2) === 7)

type Case = { seed: number; testRate?: number }
// The simulator's default family (as the CLI writes it), and a denser one, where more relatives have tested.
const CASES: Case[] = [1, 2, 3, 4, 5].map((seed) => ({ seed })).concat([1, 2, 3].map((seed) => ({ seed, testRate: 0.7 })))
const name = (c: Case) => `seed ${c.seed}${c.testRate ? `, test rate ${c.testRate}` : ''}`

const cache = new Map<string, Promise<{ pk: PlantedKit; run: ClusterRun }>>()
const load = (c: Case) => {
  const key = name(c)
  if (!cache.has(key)) {
    cache.set(key, plantedKit(c.seed, 0, c.testRate).then((pk) => ({ pk, run: clusterKit(pk.imported.observations, pk.imported.links) })))
  }
  return cache.get(key)!
}
const groupsOf = (run: ClusterRun) => {
  const out = new Map<string, string[]>()
  for (const m of run.matches) out.set(m.group, [...(out.get(m.group) ?? []), m.match])
  return out
}

describe.each(CASES.map((c) => [name(c), c] as const))('planted family, %s', (_, c) => {
  it('keeps the paternal and maternal sides apart', async () => {
    const { pk, run } = await load(c)
    expect(run.matches.length).toBeGreaterThan(30)
    for (const [, members] of groupsOf(run)) {
      const sides = new Set(members.map((m) => branch(pk.truth.get(m)!, 1)))
      expect(sides.size, `a group mixes sides (${name(c)})`).toBe(1)
    }
    // The side splits keep each side's matches under its own letter.
    for (const m of run.matches) {
      const side = branch(pk.truth.get(m.match)!, 1)
      if (m.path) expect(m.path[0]).toBe(side === 2 ? 'P' : 'M')
    }
  })

  it('keeps every group to one grandparent line', async () => {
    const { pk, run } = await load(c)
    for (const [, members] of groupsOf(run)) {
      // Matches through two grandparents (children of the kit's aunts and uncles) are left out of the count.
      const lines = new Set(members.map((m) => branch(pk.truth.get(m)!, 2)).filter((b) => b !== null))
      expect(lines.size, `a group mixes grandparent lines (${name(c)})`).toBeLessThanOrEqual(1)
    }
  })

  it("doesn't merge the misattributed father's real line with the recorded father's line", async () => {
    const { pk } = await load(c)
    const obs = pk.imported.observations
    // The recorded father's family shares no DNA with the kit, so none of them can join any group.
    for (const o of obs) expect(pk.recordedLine.has(pk.truth.get(o.match)!.person.id)).toBe(false)
    // Seeded from the strongest matches on each great-grandparent line, the real father's line (12, biologically)
    // and the line of the other parent (13) never take each other's matches.
    const pool = obs.filter((o) => o.side === 'maternal' && o.sharedCm >= 20).sort((a, b) => b.sharedCm - a.sharedCm || (a.match < b.match ? -1 : 1))
    const pick = (f: (t: MatchTruth) => boolean) => pool.filter((o) => o.sharedCm <= 400 && f(pk.truth.get(o.match)!)).slice(0, 3).map((o) => o.match)
    const seeds = {
      real: pick((t) => branch(t, 3) === 12),
      other: pick((t) => branch(t, 3) === 13),
      grandmother: pick((t) => branch(t, 2) === 7),
    }
    expect(seeds.real.length).toBeGreaterThan(0)
    const { placements } = propagateFromSeeds(pool.map((o) => o.match), seeds, pk.imported.links)
    const realLine = placements.filter((p) => branch(pk.truth.get(p.match)!, 3) === 12)
    for (const p of placements) {
      const b3 = branch(pk.truth.get(p.match)!, 3)
      if (b3 === 13) expect(p.line).not.toBe('real')
      if (b3 === 12) expect(p.line).not.toBe('other')
      if (branch(pk.truth.get(p.match)!, 2) === 7) expect(['grandmother', UNPLACED]).toContain(p.line)
    }
    expect(realLine.filter((p) => p.line === 'real').length / realLine.length).toBeGreaterThanOrEqual(0.75)
  })

  it('gathers the intermarried community into one group of its own', async () => {
    const { pk, run } = await load(c)
    const community = run.matches.filter((m) => viaCommunity(pk.truth.get(m.match)!))
    if (!community.length) return // this family has no community-only match of 20 cM or more
    const groups = new Set(community.map((m) => m.group))
    expect(groups.size).toBe(1)
    const members = run.matches.filter((m) => groups.has(m.group))
    // Its group holds nobody from the other three grandparents' lines.
    for (const m of members) expect([7, null]).toContain(branch(pk.truth.get(m.match)!, 2))
  })

  it('leaves unrelated small matches out, and unplaced', async () => {
    const { pk, run } = await load(c)
    const noise = [...pk.truth.values()].filter((t) => t.noise)
    expect(noise.length).toBeGreaterThan(0)
    const grouped = new Set(run.matches.map((m) => m.match))
    for (const t of noise) {
      expect(grouped.has(t.guid)).toBe(false)
      expect(run.excluded.find((e) => e.match === t.guid)?.reason).toBe('below-min-cm')
    }
    // Even offered to seeded placement alongside everyone else, none is placed.
    const seeds = { line: run.matches.slice(0, 3).map((m) => m.match) }
    const { placements } = propagateFromSeeds(pk.imported.observations.map((o) => o.match), seeds, pk.imported.links)
    for (const t of noise) expect(placements.find((p) => p.match === t.guid)!.line).toBe(UNPLACED)
  })
})

describe('the same inputs and seeds give the same result (S3)', () => {
  it('twice over, and whatever order the records come in', async () => {
    const { pk, run } = await load({ seed: 2, testRate: 0.7 })
    const again = clusterKit(pk.imported.observations, pk.imported.links)
    expect(again).toEqual(run)
    const rng = new SeededRandom(99)
    const shuffled = clusterKit(rng.shuffle([...pk.imported.observations]), rng.shuffle([...pk.imported.links]))
    expect(shuffled).toEqual(run)
  })

  it('stamps the engine, inputs and settings on every run (S12)', async () => {
    const { pk, run } = await load({ seed: 1 })
    expect(run.engine.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(run.kit).toBe(pk.imported.kit)
    expect(run.inputs.length).toBe(new Set(pk.imported.manifest.filter((f) => !f.file.includes('Match Trees')).map((f) => f.sha256)).size)
    expect(run.settings.consensus).toEqual({ resolutions: [0.5, 1, 1.5], seeds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], threshold: 0.6, runs: 30 })
  })

  it('splits each side the same way every time', async () => {
    const { pk } = await load({ seed: 3, testRate: 0.7 })
    const mg = buildMatchGraph(pk.imported.observations, pk.imported.links)
    const a = nestedSplit(mg)
    expect(a.steps.some((s) => s.outcome === 'split')).toBe(true)
    expect(nestedSplit(mg)).toEqual(a)
  })
})

describe('the network', () => {
  it('reads one kit only, and says why each match was left out', async () => {
    const { pk } = await load({ seed: 1 })
    const mg = buildMatchGraph(pk.imported.observations, pk.imported.links)
    const reasons = new Set(mg.excluded.map((e) => e.reason))
    expect(reasons.has('below-min-cm')).toBe(true)
    expect(reasons.has('above-max-cm')).toBe(true)
    expect(mg.graph.ids.length + mg.excluded.length).toBe(pk.imported.observations.length)
    const other = pk.imported.observations.map((o, i) => (i === 0 ? { ...o, kit: 'another kit' } : o))
    expect(() => buildMatchGraph(other, pk.imported.links)).toThrow(/one kit/)
  })
})
