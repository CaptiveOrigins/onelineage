/**
 * Genetic maps: turning base-pair positions into centimorgans. A map is read from the PLINK .map text
 * format published maps commonly use ("chromosome id cM position" per line, whitespace-separated). Between
 * listed points it interpolates linearly; past the ends it extends at the nearest interval's rate.
 *
 * OneLineage doesn't ship a map until its license is confirmed (see the repo's docs/decisions.md).
 * Without one, comparisons use the approximate 1 cM per Mb rule and say so.
 */
import type { GeneticMap } from './compare.js'

export function parsePlinkMap(name: string, text: string): GeneticMap {
  const points = new Map<string, { bp: number[]; cm: number[] }>()
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (t === '' || t.startsWith('#')) return
    const f = t.split(/\s+/)
    if (f.length < 4) throw new Error(`${name} line ${i + 1}: expected "chromosome id cM position"`)
    const chr = (f[0] as string).replace(/^chr/i, '').toUpperCase()
    const cm = Number(f[2])
    const bp = Number(f[3])
    if (!Number.isFinite(cm) || !Number.isInteger(bp)) throw new Error(`${name} line ${i + 1}: bad cM or position`)
    let p = points.get(chr)
    if (!p) points.set(chr, (p = { bp: [], cm: [] }))
    if (p.bp.length && bp <= (p.bp[p.bp.length - 1] as number)) throw new Error(`${name} line ${i + 1}: positions must increase within a chromosome`)
    if (p.cm.length && cm < (p.cm[p.cm.length - 1] as number)) throw new Error(`${name} line ${i + 1}: cM must not decrease within a chromosome`)
    p.bp.push(bp)
    p.cm.push(cm)
  })
  return {
    name,
    toCm(chromosome, position) {
      const p = points.get(chromosome.toUpperCase())
      if (!p || p.bp.length < 2) throw new Error(`${name} has no points for chromosome ${chromosome}`)
      const { bp, cm } = p
      let lo = 0
      let hi = bp.length - 1
      if (position <= (bp[0] as number)) hi = 1
      else if (position >= (bp[hi] as number)) lo = hi - 1
      else {
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1
          if ((bp[mid] as number) <= position) lo = mid
          else hi = mid
        }
      }
      const x0 = bp[lo] as number, x1 = bp[hi] as number, y0 = cm[lo] as number, y1 = cm[hi] as number
      return Math.max(0, y0 + ((position - x0) * (y1 - y0)) / (x1 - x0))
    },
  }
}
