import { describe, expect, it } from 'vitest'
import { child, founderGenome, GENOME_CM, Rng, shared } from '../src/index.js'

/** Mean shared cM over many simulated pairs, compared with published averages (Shared cM Project, roughly). */
function meanShared(trials: number, make: (rng: Rng) => [ReturnType<typeof founderGenome>, ReturnType<typeof founderGenome>]) {
  const rng = new Rng(42)
  let total = 0
  for (let i = 0; i < trials; i++) {
    const [a, b] = make(rng)
    total += shared(a, b).totalCm
  }
  return total / trials
}

describe('simulated inheritance gives realistic sharing', () => {
  it('a parent and child share one full copy of the genome', () => {
    const rng = new Rng(1)
    const f = founderGenome('F')
    const m = founderGenome('M')
    expect(shared(f, child(f, m, rng)).totalCm).toBeCloseTo(GENOME_CM, 5)
  })

  it('full siblings average about 2,600 cM, half siblings about 1,750', () => {
    const full = meanShared(150, (rng) => {
      const f = founderGenome('F'), m = founderGenome('M')
      return [child(f, m, rng), child(f, m, rng)]
    })
    const half = meanShared(150, (rng) => {
      const f = founderGenome('F'), m1 = founderGenome('M1'), m2 = founderGenome('M2')
      return [child(f, m1, rng), child(f, m2, rng)]
    })
    expect(full).toBeGreaterThan(2350)
    expect(full).toBeLessThan(2850)
    expect(half).toBeGreaterThan(1550)
    expect(half).toBeLessThan(1950)
  })

  it('first cousins average about 850 cM', () => {
    const cousins = meanShared(150, (rng) => {
      const f = founderGenome('F'), m = founderGenome('M')
      const s1 = child(f, m, rng), s2 = child(f, m, rng)
      return [child(s1, founderGenome('X'), rng), child(founderGenome('Y'), s2, rng)]
    })
    expect(cousins).toBeGreaterThan(700)
    expect(cousins).toBeLessThan(1000)
  })

  it('unrelated founders share nothing', () => {
    expect(shared(founderGenome('A'), founderGenome('B')).totalCm).toBe(0)
  })
})
