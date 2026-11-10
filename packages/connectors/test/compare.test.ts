import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { compareKits, triangulate } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { AlleleBook, genotypesOf, makePanel, shared, standardFamily, writeRaw, type Person } from '@captiveorigins/onelineage-simulate'
import { importRawDna } from '../src/index.js'

// A dense made-up panel (about 50 markers per cM, 175,000 in all), closer to a real chip.
const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const family = standardFamily({ seed: 9 })
const panel = makePanel(9, 50)
const book = new AlleleBook(panel, 9)
const enc = new TextEncoder()
const byId = new Map(family.persons.map((p) => [p.id, p]))
const kitOf = async (p: Person) => (await importRawDna({ file: `${p.id}.txt`, bytes: enc.encode(writeRaw('ancestry', panel, genotypesOf(family.genomes.get(p.id)!, panel, book, p.id.length * 31 + Number(p.id.slice(1))))), terms })).calls
const truth = (a: Person, b: Person) => shared(family.genomes.get(a.id)!, family.genomes.get(b.id)!).totalCm

const tester = byId.get(family.kits[0]!)!
const mother = byId.get(family.kits[1]!)!
// A relative on the mother's side: someone who shares with both, 100–1500 cM with the tester.
const relative = family.persons.find((p) => p !== tester && p !== mother && truth(tester, p) > 100 && truth(tester, p) < 1500 && truth(mother, p) > truth(tester, p))!
const stranger = family.persons.find((p) => p.noise)!

describe('comparing two raw kits on this Mac', async () => {
  const [kt, km, kr, ks] = await Promise.all([kitOf(tester), kitOf(mother), kitOf(relative), kitOf(stranger)])

  it('a parent and child match along nearly every chromosome', () => {
    const c = compareKits(kt, km)
    expect(c.segments).toHaveLength(22)
    expect(c.totalCm).toBeGreaterThan(truth(tester, mother) * 0.97)
    expect(c.map).toMatch(/approximate/)
  })

  it('a relative\'s total is close to the true shared DNA', () => {
    const t = truth(tester, relative)
    const c = compareKits(kt, kr)
    expect(Math.abs(c.totalCm - t)).toBeLessThan(Math.max(30, t * 0.1))
    // Tolerance must not inflate a real relative's total either.
    expect(Math.abs(compareKits(kt, kr, { errorTolerance: 50 }).totalCm - t)).toBeLessThan(Math.max(30, t * 0.1))
  })

  it('an unrelated person matches nothing', () => {
    expect(compareKits(kt, ks).totalCm).toBe(0)
  })

  it('with chip errors, tolerance keeps a parent and child whole; without it they fragment', async () => {
    const noisy = async (p: Person) => (await importRawDna({ file: `${p.id}-e.txt`, bytes: enc.encode(writeRaw('ancestry', panel, genotypesOf(family.genomes.get(p.id)!, panel, book, 77 + Number(p.id.slice(1)), 0.003, 0.003))), terms })).calls
    const [nt, nm] = await Promise.all([noisy(tester), noisy(mother)])
    const strict = compareKits(nt, nm)
    const tolerant = compareKits(nt, nm, { errorTolerance: 50 })
    expect(strict.segments.length).toBeGreaterThan(30)
    expect(tolerant.segments.length).toBeLessThanOrEqual(24)
    expect(tolerant.totalCm).toBeGreaterThan(truth(tester, mother) * 0.97)
    expect(compareKits(nt, await kitOf(stranger), { errorTolerance: 50 }).totalCm).toBe(0)
  })

  it('triangulation finds the stretches all three share', () => {
    const tri = triangulate(compareKits(kt, km).segments, compareKits(kt, kr).segments, compareKits(km, kr).segments)
    expect(tri.length).toBeGreaterThan(0)
    for (const s of tri) expect(s.cm).toBeGreaterThanOrEqual(7)
  })
})
