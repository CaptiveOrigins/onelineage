/**
 * Made-up genotypes for planted families, so raw-DNA importers and kit comparisons can be tested without
 * anyone's real DNA. A marker panel is spread along each chromosome. Every founder chromosome copy gets an
 * allele at each marker, and a person's genotype comes from the two copies they inherited.
 */
import { AUTOSOME_CM, type Genome } from './genome.js'
import { Rng } from './rng.js'

export type Marker = { rsid: string; chromosome: number; /** Made-up base-pair position. */ position: number; cm: number; ref: string; alt: string; altFreq: number }
export type Panel = { markers: Marker[] }
/** One person's calls, in panel order: two letters, or "--" for no call. */
export type Genotypes = string[]

const BASES = ['A', 'C', 'G', 'T'] as const

/** About `perCm` markers per centimorgan, at made-up positions (1 cM ≈ 1,000,000 bp, a common rule of thumb). */
export function makePanel(seed: number, perCm = 6): Panel {
  const rng = new Rng(seed ^ 0x5eed)
  const markers: Marker[] = []
  let rs = 100000
  AUTOSOME_CM.forEach((len, c) => {
    const n = Math.round(len * perCm)
    for (let i = 0; i < n; i++) {
      const cm = ((i + rng.next()) / n) * len
      const ref = rng.pick(BASES)
      const alt = rng.pick(BASES.filter((b) => b !== ref))
      markers.push({ rsid: `rs${(rs += rng.int(1, 40))}`, chromosome: c + 1, position: Math.round(cm * 1_000_000) + 1, cm, ref, alt, altFreq: 0.05 + rng.next() * 0.45 })
    }
  })
  return { markers }
}

/** Alleles for every founder chromosome copy, drawn on demand and remembered, so the same label always gives the same allele. */
export class AlleleBook {
  private readonly rng: Rng
  private readonly book = new Map<string, Uint8Array>()
  constructor(private readonly panel: Panel, seed: number) {
    this.rng = new Rng(seed ^ 0xa11e1e)
  }
  /** 0 = reference, 1 = alternative, for this founder copy at every marker. */
  alleles(label: string): Uint8Array {
    let a = this.book.get(label)
    if (!a) {
      a = new Uint8Array(this.panel.markers.length)
      this.panel.markers.forEach((m, i) => { a![i] = this.rng.chance(m.altFreq) ? 1 : 0 })
      this.book.set(label, a)
    }
    return a
  }
}

/** A person's genotype at every marker, with a small rate of no-calls, as real chips have. */
export function genotypesOf(genome: Genome, panel: Panel, book: AlleleBook, seed: number, noCallRate = 0.003, errorRate = 0): Genotypes {
  const rng = new Rng(seed)
  const out: Genotypes = new Array(panel.markers.length)
  const labelAt = (hap: Genome[0], m: Marker) => {
    for (const s of hap[m.chromosome - 1] ?? []) if (s.start <= m.cm && m.cm < s.end) return s.label
    throw new Error(`no segment covers chromosome ${m.chromosome} at ${m.cm} cM`)
  }
  panel.markers.forEach((m, i) => {
    if (rng.chance(noCallRate)) { out[i] = '--'; return }
    const a = book.alleles(labelAt(genome[0], m))[i] ? m.alt : m.ref
    const b = book.alleles(labelAt(genome[1], m))[i] ? m.alt : m.ref
    out[i] = [a, b].sort().join('')
    // A chip error: the call comes out as a homozygote of a random one of the two alleles.
    if (errorRate > 0 && rng.chance(errorRate)) { const x = rng.chance(0.5) ? m.ref : m.alt; out[i] = x + x }
  })
  return out
}
