import { AUTOSOME_CM, type Genome } from './genome.js'

export type SharedSegment = { chromosome: number; start: number; end: number; cm: number }
export type Sharing = { totalCm: number; segments: SharedSegment[]; longestCm: number }

/**
 * Identical-by-descent sharing between two people: the stretches where any copy of one carries the same
 * founder label as any copy of the other. Fully identical stretches count once, as Ancestry-style totals do.
 * Segments shorter than `minSegmentCm` are dropped, the way services drop short segments.
 */
export function shared(a: Genome, b: Genome, minSegmentCm = 7): Sharing {
  const segments: SharedSegment[] = []
  AUTOSOME_CM.forEach((len, c) => {
    const pts = new Set<number>([0, len])
    for (const g of [a, b]) for (const h of g) for (const s of h[c] ?? []) { pts.add(s.start); pts.add(s.end) }
    const cuts = [...pts].sort((x, y) => x - y)
    const labelsAt = (g: Genome, x: number) => {
      const out = new Set<string>()
      for (const h of g) for (const s of h[c] ?? []) if (s.start <= x && x < s.end) out.add(s.label)
      return out
    }
    let open: number | null = null
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i] as number
      const hi = cuts[i + 1] as number
      const mid = (lo + hi) / 2
      const la = labelsAt(a, mid)
      let hit = false
      for (const l of labelsAt(b, mid)) if (la.has(l)) { hit = true; break }
      if (hit && open === null) open = lo
      if (!hit && open !== null) { segments.push({ chromosome: c + 1, start: open, end: lo, cm: lo - open }); open = null }
    }
    if (open !== null) segments.push({ chromosome: c + 1, start: open, end: len, cm: len - open })
  })
  const kept = segments.filter((s) => s.cm >= minSegmentCm)
  const totalCm = kept.reduce((t, s) => t + s.cm, 0)
  return { totalCm, segments: kept, longestCm: kept.reduce((m, s) => Math.max(m, s.cm), 0) }
}
