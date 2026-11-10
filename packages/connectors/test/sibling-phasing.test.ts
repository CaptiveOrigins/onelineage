import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { ibdStates, phaseThreeSiblings, siblingCrossovers, type IbdStretch } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { AlleleBook, child, founderGenome, genotypesOf, makePanel, Rng, writeRaw, type Genome } from '@captiveorigins/onelineage-simulate'
import { importRawDna } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const panel = makePanel(13, 50)
const book = new AlleleBook(panel, 13)
const rng = new Rng(13)
const father = founderGenome('father')
const mother = founderGenome('mother')
const sibs: Record<string, Genome> = { A: child(father, mother, rng), B: child(father, mother, rng), C: child(father, mother, rng) }
const enc = new TextEncoder()
const kitOf = async (name: string, seed: number) => (await importRawDna({ file: `${name}.txt`, bytes: enc.encode(writeRaw('ftdna', panel, genotypesOf(sibs[name]!, panel, book, seed))), terms })).calls

const labelAt = (hap: Genome[0], chr: number, cm: number) => hap[chr - 1]!.find((s) => s.start <= cm && cm < s.end)!.label
const truthState = (x: Genome, y: Genome, chr: number, cm: number) => (labelAt(x[0], chr, cm) === labelAt(y[0], chr, cm) ? 1 : 0) + (labelAt(x[1], chr, cm) === labelAt(y[1], chr, cm) ? 1 : 0)
const trueCrossovers = (g: Genome) => g.flatMap((hap) => hap.flatMap((segs, c) => segs.slice(1).map((s) => ({ chromosome: String(c + 1), atCm: s.start }))))
const stateAt = (st: readonly IbdStretch[], chr: number, cm: number) => st.find((s) => s.chromosome === String(chr) && s.startCm <= cm && cm <= s.endCm)?.state

describe('visual phasing building blocks, with three siblings and no parents', async () => {
  const [ka, kb, kc] = await Promise.all([kitOf('A', 1), kitOf('B', 2), kitOf('C', 3)])
  const states = new Map([['A|B', ibdStates(ka, kb)], ['A|C', ibdStates(ka, kc)], ['B|C', ibdStates(kb, kc)]])

  it('reads how much two siblings share (none, one or both copies) correctly along the genome', () => {
    let right = 0
    let total = 0
    for (const [pair, st] of states) {
      const [x, y] = pair.split('|') as [string, string]
      for (let chr = 1; chr <= 22; chr++) for (let cm = 2; cm < 60; cm += 1) {
        const got = stateAt(st, chr, cm)
        if (got === undefined) continue
        total++
        if (got === truthState(sibs[x]!, sibs[y]!, chr, cm)) right++
      }
    }
    expect(right / total).toBeGreaterThan(0.9)
  })

  it('attributes crossovers to the right sibling, close to where they really happened', () => {
    const found = siblingCrossovers(states, ['A', 'B', 'C'])
    expect(found.length).toBeGreaterThan(20)
    const near = found.filter((c) => trueCrossovers(sibs[c.sibling]!).some((t) => t.chromosome === c.chromosome && Math.abs(t.atCm - c.atCm) <= 5))
    expect(near.length / found.length).toBeGreaterThan(0.85)
  })

  it('the phasing chart matches the true grandparents along the genome (labels are relative, so up to swapping)', () => {
    const pieces = phaseThreeSiblings(states, ['A', 'B', 'C'])
    let right = 0
    let total = 0
    for (let chr = 1; chr <= 22; chr++) {
      // Score each of the 8 ways to name the unnamed labels, and keep the best per chromosome.
      let best = 0
      let count = 0
      for (let sym = 0; sym < 8; sym++) {
        let ok = 0
        count = 0
        for (let cm = 3; cm < 60; cm += 1) for (const sib of ['A', 'B', 'C']) for (const side of [1, 2] as const) {
          const piece = pieces.find((p) => p.sibling === sib && p.chromosome === String(chr) && p.side === side && p.startCm <= cm && cm <= p.endCm)
          if (!piece) continue
          count++
          const parentIdx = (sym & 1 ? 3 - side : side) - 1 // which real parent this side is
          const label = labelAt(sibs[sib]![parentIdx]!, chr, cm)
          const gp = label.endsWith(':0') ? 'a' : 'b'
          const flip = parentIdx === 0 ? sym & 2 : sym & 4
          if ((flip ? (gp === 'a' ? 'b' : 'a') : gp) === piece.grandparent) ok++
        }
        best = Math.max(best, ok)
      }
      right += best
      total += count
    }
    expect(total).toBeGreaterThan(1000)
    expect(right / total).toBeGreaterThan(0.85)
  })

  it('needs three or more siblings', () => {
    expect(() => siblingCrossovers(new Map(), ['A', 'B'])).toThrow(/three or more/)
  })
})
