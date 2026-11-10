import { describe, expect, it } from 'vitest'
import type { SharedMatchLink } from '@captiveorigins/onelineage-core'
import { adjustedRandIndex, propagateFromSeeds, UNPLACED } from '../src/index.js'

const map = (xs: (string | number)[]) => new Map(xs.map((x, i) => [i, x]))

describe('adjusted Rand index', () => {
  it('is 1 for the same grouping under other names', () => {
    expect(adjustedRandIndex(map([0, 0, 1, 1, 2]), map(['b', 'b', 'a', 'a', 'c']))).toBe(1)
  })
  it('matches the published formula on a small case', () => {
    // Contingency (0,0)=2, (1,1)=1, (1,2)=1: index 1, expected 1/3, max 3/2, so ARI = (2/3) / (7/6) = 4/7.
    expect(adjustedRandIndex(map([0, 0, 1, 1]), map([0, 0, 1, 2]))).toBeCloseTo(4 / 7, 12)
  })
  it('is below zero for a grouping that cuts across the other', () => {
    expect(adjustedRandIndex(map([0, 0, 1, 1]), map([0, 1, 0, 1]))).toBeLessThan(0)
  })
  it('compares only the items both groupings have', () => {
    const a = new Map([['x', 1], ['y', 1], ['z', 2]])
    const b = new Map([['x', 5], ['y', 5], ['z', 6], ['extra', 7]])
    expect(adjustedRandIndex(a, b)).toBe(1)
  })
})

const link = (a: string, b: string, cmAB: number): SharedMatchLink =>
  ({ service: 'planted', kit: 'K', a, b, cmAB, segmentsAB: null, longestAB: null, provenance: { file: 'f', sha256: '0', row: 1 } })

describe('seeded placement', () => {
  const links = [
    // x links twice to line A, at 30 cM: placed on A.
    link('x', 'a1', 30), link('x', 'a2', 30),
    // y links once to A and once to B: no winner by 2 to 1, so unplaced.
    link('y', 'a1', 40), link('y', 'b1', 40),
    // z links once to A at 20 cM: one link isn't enough on its own.
    link('z', 'a1', 20),
    // w links only to x, twice over: placed on A in the second round, through x.
    link('w', 'x', 60), link('x', 'w', 60), link('w', 'a2', 25),
  ]
  const seeds = { A: ['a1', 'a2'], B: ['b1'] }
  const run = () => propagateFromSeeds(['a1', 'a2', 'b1', 'x', 'y', 'z', 'w', 'lonely'], seeds, links)

  it('places a match only when one line clearly wins, and leaves the rest unplaced', () => {
    const { placements } = run()
    const line = Object.fromEntries(placements.map((p) => [p.match, p.line]))
    expect(line).toEqual({ a1: 'A', a2: 'A', b1: 'B', x: 'A', y: UNPLACED, z: UNPLACED, w: 'A', lonely: UNPLACED })
    expect(placements.find((p) => p.match === 'a1')!.seed).toBe(true)
    expect(placements.find((p) => p.match === 'x')!.seed).toBe(false)
  })

  it('counts a pair listed from both ends once, at its larger cM', () => {
    const w = run().placements.find((p) => p.match === 'w')!
    expect(w.scores.A).toBeCloseTo(Math.log1p(60) + Math.log1p(25), 12)
  })

  it('refuses a match seeding two lines, and the reserved name', () => {
    expect(() => propagateFromSeeds([], { A: ['m'], B: ['m'] }, [])).toThrow(/two lines/)
    expect(() => propagateFromSeeds([], { [UNPLACED]: ['m'] }, [])).toThrow(/line name/)
  })
})
