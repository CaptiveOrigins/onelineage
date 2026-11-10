/**
 * One-to-one comparison of two raw DNA kits on this Mac, the way GEDmatch's one-to-one works: find the
 * stretches where the two never have opposite homozygous calls (AA against BB). A long enough, dense enough
 * stretch is a segment the two very likely inherited from a shared ancestor.
 *
 * Positions are base pairs. Turning them into centimorgans needs a genetic map. The default here is the
 * common rule of thumb of 1 cM per million base pairs. That's approximate, and every result says which map
 * it used, so a published map can replace it later without changing anything else.
 */

export type KitCalls = ReadonlyMap<string, { rsid: readonly string[]; position: Int32Array | readonly number[]; call: readonly string[] }>

export type GeneticMap = { name: string; toCm: (chromosome: string, position: number) => number }
export const ONE_CM_PER_MB: GeneticMap = { name: 'approximate: 1 cM per Mb', toCm: (_c, p) => p / 1_000_000 }

export type CompareOptions = {
  /** Shortest segment kept, in cM. Services use about 6–8. */
  minCm?: number
  /** Fewest compared markers in a kept segment. Real chips: several hundred. */
  minMarkers?: number
  map?: GeneticMap
  /** Chromosomes compared. Autosomes by default; X is compared separately because it's inherited differently. */
  chromosomes?: readonly string[]
  /**
   * Genotyping-error tolerance: the window, in markers on each side, used to judge an opposite homozygote.
   * A break is treated as a likely chip error when the window holds no more than `maxBreaksNearby` other
   * breaks. Unrelated people have breaks every few dozen markers, so their windows are crowded. 0 turns it off.
   */
  errorTolerance?: number
  maxBreaksNearby?: number
}

export type DnaSegment = { chromosome: string; startBp: number; endBp: number; startCm: number; endCm: number; cm: number; markers: number }
export type Comparison = { segments: DnaSegment[]; totalCm: number; longestCm: number; comparedMarkers: number; map: string }

const AUTOSOMES = Array.from({ length: 22 }, (_, i) => String(i + 1))

function oppositeHomozygous(a: string, b: string): boolean {
  if (a.length !== 2 || b.length !== 2 || a === '--' || b === '--') return false
  return a[0] === a[1] && b[0] === b[1] && a[0] !== b[0]
}

export function compareKits(a: KitCalls, b: KitCalls, opts: CompareOptions = {}): Comparison {
  const minCm = opts.minCm ?? 7
  const minMarkers = opts.minMarkers ?? 300
  const map = opts.map ?? ONE_CM_PER_MB
  const segments: DnaSegment[] = []
  let compared = 0
  for (const chr of opts.chromosomes ?? AUTOSOMES) {
    const ca = a.get(chr)
    const cb = b.get(chr)
    if (!ca || !cb) continue
    const other = new Map<string, string>()
    cb.rsid.forEach((r, i) => other.set(r, cb.call[i] as string))
    // Markers both kits called, in position order.
    const shared: { pos: number; a: string; b: string }[] = []
    ca.rsid.forEach((r, i) => {
      const callB = other.get(r)
      const callA = ca.call[i] as string
      if (callB === undefined || callA === '--' || callB === '--') return
      shared.push({ pos: Number(ca.position[i]), a: callA, b: callB })
    })
    shared.sort((x, y) => x.pos - y.pos)
    compared += shared.length
    let start = 0
    const close = (endIdx: number) => {
      const n = endIdx - start
      if (n <= 0) return
      const s = shared[start]!
      const e = shared[endIdx - 1]!
      const startCm = map.toCm(chr, s.pos)
      const endCm = map.toCm(chr, e.pos)
      if (endCm - startCm >= minCm && n >= minMarkers) {
        segments.push({ chromosome: chr, startBp: s.pos, endBp: e.pos, startCm, endCm, cm: endCm - startCm, markers: n })
      }
    }
    const tol = opts.errorTolerance ?? 0
    const isBreak = shared.map((m) => oppositeHomozygous(m.a, m.b))
    const allowed = opts.maxBreaksNearby ?? 1
    const lone = (i: number) => {
      if (tol <= 0 || i < tol || i + tol >= shared.length) return false
      let near = 0
      for (let k = 1; k <= tol; k++) near += (isBreak[i - k] ? 1 : 0) + (isBreak[i + k] ? 1 : 0)
      return near <= allowed
    }
    for (let i = 0; i < shared.length; i++) {
      if (isBreak[i] && !lone(i)) { close(i); start = i + 1 }
    }
    close(shared.length)
  }
  const totalCm = segments.reduce((t, s) => t + s.cm, 0)
  return { segments, totalCm, longestCm: segments.reduce((m, s) => Math.max(m, s.cm), 0), comparedMarkers: compared, map: map.name }
}

/**
 * Triangulation: where A–B, A–C and B–C segments all overlap, the three very likely share that stretch
 * from one ancestor. Returns the overlapping stretches.
 */
export function triangulate(ab: readonly DnaSegment[], ac: readonly DnaSegment[], bc: readonly DnaSegment[], minCm = 7): DnaSegment[] {
  const out: DnaSegment[] = []
  for (const x of ab) for (const y of ac) for (const z of bc) {
    if (x.chromosome !== y.chromosome || y.chromosome !== z.chromosome) continue
    const startCm = Math.max(x.startCm, y.startCm, z.startCm)
    const endCm = Math.min(x.endCm, y.endCm, z.endCm)
    if (endCm - startCm < minCm) continue
    out.push({
      chromosome: x.chromosome, startCm, endCm, cm: endCm - startCm,
      startBp: Math.max(x.startBp, y.startBp, z.startBp), endBp: Math.min(x.endBp, y.endBp, z.endBp),
      markers: Math.min(x.markers, y.markers, z.markers),
    })
  }
  return out
}
