import { AUTOSOME_CM, type Genome, type Haplotype, type Segment } from './genome.js'
import type { Rng } from './rng.js'

/** A founder: each chromosome copy is one segment carrying a unique label. */
export function founderGenome(id: string): Genome {
  const copy = (side: 0 | 1): Haplotype => AUTOSOME_CM.map((len) => [{ start: 0, end: len, label: `${id}:${side}` }])
  return [copy(0), copy(1)]
}

/** Pieces of `segs` that lie within [a, b). */
function slice(segs: readonly Segment[], a: number, b: number): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    const start = Math.max(s.start, a)
    const end = Math.min(s.end, b)
    if (end > start) out.push({ start, end, label: s.label })
  }
  return out
}

/** Merge touching pieces with the same label. */
function tidy(segs: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.label === s.label && Math.abs(last.end - s.start) < 1e-9) last.end = s.end
    else out.push({ ...s })
  }
  return out
}

/**
 * One gamete: for each chromosome, crossovers at Poisson(length / 100) uniform points, switching between
 * the parent's two copies, starting from a random copy. No crossover interference, a stated simplification.
 */
export function gamete(parent: Genome, rng: Rng): Haplotype {
  return AUTOSOME_CM.map((len, c) => {
    const points = Array.from({ length: rng.poisson(len / 100) }, () => rng.next() * len).sort((x, y) => x - y)
    const bounds = [0, ...points, len]
    let side = rng.int(0, 1)
    const out: Segment[] = []
    for (let i = 0; i < bounds.length - 1; i++) {
      const copy = parent[side as 0 | 1][c] ?? []
      out.push(...slice(copy, bounds[i] as number, bounds[i + 1] as number))
      side = 1 - side
    }
    return tidy(out)
  })
}

export function child(father: Genome, mother: Genome, rng: Rng): Genome {
  return [gamete(father, rng), gamete(mother, rng)]
}
