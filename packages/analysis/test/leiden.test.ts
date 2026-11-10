import { describe, expect, it } from 'vitest'
import { components, consensusClusters, type Graph, graphFromEdges, leiden, quality, SeededRandom, subgraph } from '../src/index.js'

const graph = (n: number, edges: [number, number, number?][]) =>
  graphFromEdges(Array.from({ length: n }, (_, i) => `n${i}`), edges.map(([a, b, w]) => [a, b, w ?? 1] as const))

/** Two complete graphs of `k` nodes, joined by one edge. */
const twoCliques = (k: number) => {
  const e: [number, number][] = []
  for (const off of [0, k]) for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) e.push([off + a, off + b])
  e.push([0, k])
  return graph(2 * k, e)
}

/** Zachary's karate club (1977), 34 members and 78 friendships, the usual first check for community detection. */
const KARATE = '0-1,0-2,0-3,0-4,0-5,0-6,0-7,0-8,0-10,0-11,0-12,0-13,0-17,0-19,0-21,0-31,1-2,1-3,1-7,1-13,1-17,1-19,1-21,1-30,2-3,2-7,2-8,2-9,2-13,2-27,2-28,2-32,3-7,3-12,3-13,4-6,4-10,5-6,5-10,5-16,6-16,8-30,8-32,8-33,9-33,13-33,14-32,14-33,15-32,15-33,18-32,18-33,19-33,20-32,20-33,22-32,22-33,23-25,23-27,23-29,23-32,23-33,24-25,24-27,24-31,25-31,26-29,26-33,27-33,28-31,28-33,29-32,29-33,30-32,30-33,31-32,31-33,32-33'
const karate = graph(34, KARATE.split(',').map((e) => e.split('-').map(Number) as [number, number]))

/** A random graph: `n` nodes, each pair joined with probability p, with weights from 1 to 5. */
function randomGraph(seed: number, n: number, p: number): Graph {
  const rng = new SeededRandom(seed)
  const e: [number, number, number][] = []
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rng.next() < p) e.push([a, b, 1 + rng.below(5)])
  return graph(n, e)
}

/** Planted partition: `groups` groups of `size`, dense inside, sparse between. */
function planted(seed: number, groups: number, size: number, pIn: number, pOut: number): Graph {
  const rng = new SeededRandom(seed)
  const e: [number, number][] = []
  const n = groups * size
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const same = Math.floor(a / size) === Math.floor(b / size)
    if (rng.next() < (same ? pIn : pOut)) e.push([a, b])
  }
  return graph(n, e)
}

describe('Leiden', () => {
  it('splits two cliques joined by one edge, and reports the textbook modularity', () => {
    const g = twoCliques(5)
    const p = leiden(g, { seed: 1 })
    expect(p.membership).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
    // m = 21 edges; each half has 10 inside and degree total 21: Q = 2 × (10/21 − (21/42)²).
    expect(p.quality).toBeCloseTo(2 * (10 / 21 - 0.25), 12)
    expect(quality(g, p.membership)).toBeCloseTo(p.quality, 12)
  })

  it('finds the best known split of the karate club (modularity 0.4198) on every seed', () => {
    for (let seed = 0; seed < 10; seed++) {
      const p = leiden(karate, { seed })
      expect(p.quality).toBeGreaterThan(0.4197)
      expect(new Set(p.membership).size).toBe(4)
    }
  })

  it('recovers planted groups', () => {
    const g = planted(3, 4, 15, 0.5, 0.02)
    const p = leiden(g, { seed: 0 })
    for (let grp = 0; grp < 4; grp++) {
      const labels = new Set(p.membership.slice(grp * 15, grp * 15 + 15))
      expect(labels.size).toBe(1)
    }
    expect(new Set(p.membership).size).toBe(4)
  })

  it('always returns connected communities, the guarantee Louvain lacks', () => {
    for (let seed = 0; seed < 30; seed++) {
      const g = randomGraph(seed, 60, 0.06)
      for (const resolution of [0.5, 1, 2]) {
        const { membership } = leiden(g, { seed, resolution })
        for (const c of new Set(membership)) {
          const members = membership.flatMap((x, v) => (x === c ? [v] : []))
          expect(components(subgraph(g, members).graph)).toHaveLength(1)
        }
      }
    }
  })

  it('never ends below where it started, and gives more groups at higher resolution', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = randomGraph(100 + seed, 50, 0.1)
      const singles = quality(g, g.ids.map((_, i) => i))
      const low = leiden(g, { seed, resolution: 0.2 })
      const high = leiden(g, { seed, resolution: 3 })
      expect(leiden(g, { seed }).quality).toBeGreaterThan(singles)
      expect(new Set(high.membership).size).toBeGreaterThan(new Set(low.membership).size)
    }
  })

  it('gives the same answer for the same seed (S3)', () => {
    const g = randomGraph(7, 80, 0.08)
    for (let seed = 0; seed < 5; seed++) expect(leiden(g, { seed }).membership).toEqual(leiden(g, { seed }).membership)
  })

  it('numbers communities by size, largest first', () => {
    const { membership } = leiden(planted(5, 3, 10, 0.6, 0.01), { seed: 2 })
    const sizes = [0, 1, 2].map((c) => membership.filter((x) => x === c).length)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })

  it('handles graphs with no nodes or no edges', () => {
    expect(leiden(graph(0, [])).membership).toEqual([])
    expect(leiden(graph(3, [])).membership).toEqual([0, 1, 2])
  })

  it('refuses a seed that is not a whole number', () => {
    expect(() => leiden(karate, { seed: 1.5 })).toThrow(/whole number/)
  })
})

describe('consensus clustering', () => {
  it('joins only matches that are usually together, and reports how stable each one is', () => {
    const r = consensusClusters(twoCliques(6))
    expect(r.runs).toBe(30)
    expect(new Set(r.group.slice(0, 6)).size).toBe(1)
    expect(new Set(r.group.slice(6)).size).toBe(1)
    expect(r.group[0]).not.toBe(r.group[6])
    for (const s of r.stability) expect(s).toBe(1)
  })

  it('leaves a node that flips between groups on its own when it is below the threshold', () => {
    // Node 10 hangs evenly between two cliques of five.
    const e: [number, number][] = []
    for (const off of [0, 5]) for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) e.push([off + a, off + b])
    e.push([10, 0], [10, 5])
    const r = consensusClusters(graph(11, e), { threshold: 0.9 })
    expect(r.group[10]).not.toBe(r.group[0])
    expect(r.group[10]).not.toBe(r.group[5])
  })
})
