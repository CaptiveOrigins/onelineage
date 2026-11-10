/**
 * Segment painting: which ancestor each stretch of a person's DNA came from, as people do by hand in
 * DNA Painter, worked out from raw-kit comparisons.
 *
 * 1. Side: a stretch shared with a match is on the mother's side if the mother shares that same stretch
 *    with the match, and on the father's side if the father does. With no parent kit, it stays unknown.
 * 2. Ancestor: each reference relative is tagged with the line they descend from, as a path from the person:
 *    "M" is the mother, "MP" the mother's father, "MPM" his mother, and so on.
 * 3. Painting: references' stretches are laid on the side's chromosome copy. Two paths conflict where they
 *    overlap but neither is an ancestor of the other, such as "MP" against "MM". Conflicts are reported,
 *    never resolved by guessing.
 */
import type { DnaSegment } from './compare.js'

export type Side = 'maternal' | 'paternal'
export type AncestorPath = string // e.g. "MP": the mother's father

function overlapCm(a: DnaSegment, b: DnaSegment): number {
  if (a.chromosome !== b.chromosome) return 0
  return Math.max(0, Math.min(a.endCm, b.endCm) - Math.max(a.startCm, b.startCm))
}

export type SidedSegment = DnaSegment & { side: Side | 'unknown' }

/**
 * Give each of the person's segments with a match a side, using the parents' segments with the same match.
 * A segment needs at least `minShare` of its length confirmed by one parent, and none by the other.
 */
export function assignSides(withMatch: readonly DnaSegment[], motherWithMatch: readonly DnaSegment[] | null, fatherWithMatch: readonly DnaSegment[] | null, minShare = 0.5): SidedSegment[] {
  return withMatch.map((s) => {
    const m = motherWithMatch ? motherWithMatch.reduce((t, x) => t + overlapCm(s, x), 0) / s.cm : 0
    const f = fatherWithMatch ? fatherWithMatch.reduce((t, x) => t + overlapCm(s, x), 0) / s.cm : 0
    const side: Side | 'unknown' = m >= minShare && f < minShare ? 'maternal' : f >= minShare && m < minShare ? 'paternal' : 'unknown'
    return { ...s, side }
  })
}

export type Reference = { name: string; path: AncestorPath; segments: readonly SidedSegment[] }
export type PaintedStretch = { side: Side; chromosome: string; startCm: number; endCm: number; path: AncestorPath; from: string[] }
export type PaintConflict = { side: Side; chromosome: string; startCm: number; endCm: number; paths: [AncestorPath, AncestorPath]; from: [string, string] }

const related = (a: AncestorPath, b: AncestorPath) => a.startsWith(b) || b.startsWith(a)
const sideOfPath = (p: AncestorPath): Side => (p.startsWith('M') ? 'maternal' : 'paternal')

export function paint(references: readonly Reference[], minCm = 7): { stretches: PaintedStretch[]; conflicts: PaintConflict[] } {
  const stretches: PaintedStretch[] = []
  const conflicts: PaintConflict[] = []
  for (const ref of references) {
    if (!/^[MP]+$/.test(ref.path)) throw new Error(`"${ref.path}" isn't an ancestor path (letters M and P from the person)`)
    for (const s of ref.segments) {
      if (s.side === 'unknown' || s.side !== sideOfPath(ref.path)) continue
      for (const other of stretches) {
        if (other.side !== s.side || other.chromosome !== s.chromosome || related(other.path, ref.path)) continue
        const start = Math.max(other.startCm, s.startCm)
        const end = Math.min(other.endCm, s.endCm)
        if (end - start >= minCm) conflicts.push({ side: s.side, chromosome: s.chromosome, startCm: start, endCm: end, paths: [other.path, ref.path], from: [other.from[0] as string, ref.name] })
      }
      const same = stretches.find((o) => o.side === s.side && o.chromosome === s.chromosome && o.path === ref.path && overlapCm({ ...s }, { ...s, startCm: o.startCm, endCm: o.endCm }) > 0)
      if (same) {
        same.startCm = Math.min(same.startCm, s.startCm)
        same.endCm = Math.max(same.endCm, s.endCm)
        if (!same.from.includes(ref.name)) same.from.push(ref.name)
      } else stretches.push({ side: s.side, chromosome: s.chromosome, startCm: s.startCm, endCm: s.endCm, path: ref.path, from: [ref.name] })
    }
  }
  return { stretches, conflicts }
}
