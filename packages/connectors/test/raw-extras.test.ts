import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { compareHalves, compareKits, phaseWithParent, rebuildFromDescendants, RebuildRefused, xPathPossible } from '@extantape/onefamily-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { AlleleBook, child, founderGenome, genotypesOf, makePanel, Rng, writeRaw, type Genome } from '@extantape/onefamily-simulate'
import { importRawDna } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const panel = makePanel(17, 50)
const book = new AlleleBook(panel, 17)
const rng = new Rng(17)
const enc = new TextEncoder()
let n = 0
const kitOf = async (g: Genome) => (await importRawDna({ file: `k${++n}.txt`, bytes: enc.encode(writeRaw('livingdna', panel, genotypesOf(g, panel, book, 500 + n))), terms })).calls

// Grandparents G1+G2 have two children, P (who never tested) and S. P and Q have three children. S's child is K.
const G1 = founderGenome('G1'), G2 = founderGenome('G2'), Q = founderGenome('Q'), R = founderGenome('R'), stranger = founderGenome('X')
const P = child(G1, G2, rng), S = child(G1, G2, rng)
const kids = [child(P, Q, rng), child(P, Q, rng), child(P, Q, rng)]
const K = child(S, R, rng)

describe('half-kits from one tested parent', async () => {
  const [kid, q, k] = await Promise.all([kitOf(kids[0]!), kitOf(Q), kitOf(K)])
  const { fromParent, fromOther, resolved, total } = phaseWithParent(kid, q)
  it('most markers are resolved', () => expect(resolved / total).toBeGreaterThan(0.6))
  it("the half from the untested parent matches that parent's family; the tested parent's half doesn't", () => {
    expect(compareKits(fromOther, k, { minMarkers: 150 }).totalCm).toBeGreaterThan(100)
    expect(compareKits(fromParent, k, { minMarkers: 150 }).totalCm).toBe(0)
  })
})

describe('rebuilding someone who never tested', async () => {
  const [q, s, x, ...ch] = await Promise.all([kitOf(Q), kitOf(S), kitOf(stranger), ...kids.map(kitOf)])

  it('is refused for real data without a recorded consent', () => {
    expect(() => rebuildFromDescendants(ch, q, { decision: { kind: 'other', seq: 1 } } as never)).toThrow(RebuildRefused)
  })

  const { rebuilt, halves, known, halfKnown, total } = rebuildFromDescendants(ch, q, { synthetic: true })
  it('recovers most of the person, and every recovered allele is really theirs', () => {
    expect((known + halfKnown) / total).toBeGreaterThan(0.7)
    const truth = genotypesOf(P, panel, book, 1, 0)
    const idx = new Map(panel.markers.map((m, i) => [m.rsid, i]))
    let checked = 0
    let wrong = 0
    for (const c of rebuilt.values()) c.rsid.forEach((r, i) => {
      const call = c.call[i]!
      if (call === '--') return
      const t = truth[idx.get(r)!]!
      checked++
      if (call.endsWith('?') ? !t.includes(call[0]!) : [...call].sort().join('') !== [...t].sort().join('')) wrong++
    })
    expect(checked).toBeGreaterThan(1000)
    expect(wrong / checked).toBeLessThan(0.02)
  })
  it("the rebuilt kit matches the person's sibling, and not a stranger", () => {
    expect(compareHalves(halves, s, { minMarkers: 150 }).totalCm).toBeGreaterThan(1000)
    expect(compareHalves(halves, x, { minMarkers: 150 }).totalCm).toBe(0)
  })
})

describe('X-DNA paths', () => {
  it('a man gets his X only from his mother', () => {
    expect(xPathPossible(['M', 'F', 'M', 'F'])).toBe(true)
    expect(xPathPossible(['F', 'M', 'F'])).toBe(true)
    expect(xPathPossible(['M', 'M'])).toBe(false)
    expect(xPathPossible(['F', 'F', 'M', 'M'])).toBe(false)
  })
})
