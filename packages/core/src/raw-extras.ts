/**
 * Raw-file extras (OneLineage plan section 5i):
 * - `phaseWithParent`: split a child's raw kit into the half from one tested parent and the half from the
 *   other parent. Each half-kit makes a match's side certain.
 * - `rebuildFromDescendants`: partly rebuild a relative who never tested from children and the other parent.
 *   That's a genetic profile of someone who never consented, so on real data it needs the owner's rule and
 *   a recorded consent. It's refused otherwise.
 * - `xPathPossible`: whether X DNA can pass along a line, which rules branches in or out for X matches.
 */
import type { KitCalls } from './compare.js'

type Calls = { rsid: string[]; position: number[]; call: string[] }
export type HalfKit = Map<string, Calls>

const alleles = (g: string): [string, string] | null => (g.length === 2 && g !== '--' ? [g[0]!, g[1]!] : null)

/**
 * Halves of a child's kit, each encoded as a homozygous call of the allele from that side, so ordinary
 * comparison works on them. "--" where it can't be told apart: both het and alike, a missing call, or a
 * parent and child that contradict each other (a likely error).
 */
export function phaseWithParent(childKit: KitCalls, parentKit: KitCalls): { fromParent: HalfKit; fromOther: HalfKit; resolved: number; total: number } {
  const fromParent: HalfKit = new Map()
  const fromOther: HalfKit = new Map()
  let resolved = 0
  let total = 0
  for (const [chr, c] of childKit) {
    const p = parentKit.get(chr)
    const pm = new Map<string, string>()
    p?.rsid.forEach((r, i) => pm.set(r, p.call[i] as string))
    const fp: Calls = { rsid: [], position: [], call: [] }
    const fo: Calls = { rsid: [], position: [], call: [] }
    c.rsid.forEach((r, i) => {
      total++
      const ca = alleles(c.call[i] as string)
      const pa = alleles(pm.get(r) ?? '--')
      let a: string | null = null
      let b: string | null = null
      if (ca && pa) {
        if (ca[0] === ca[1]) { if (pa.includes(ca[0])) { a = ca[0]; b = ca[0] } }
        else if (pa[0] === pa[1]) {
          if (pa[0] === ca[0]) { a = ca[0]; b = ca[1] }
          else if (pa[0] === ca[1]) { a = ca[1]; b = ca[0] }
        }
      }
      const pos = Number(c.position[i])
      fp.rsid.push(r); fp.position.push(pos); fp.call.push(a ? a + a : '--')
      fo.rsid.push(r); fo.position.push(pos); fo.call.push(b ? b + b : '--')
      if (a) resolved++
    })
    fromParent.set(chr, fp)
    fromOther.set(chr, fo)
  }
  return { fromParent, fromOther, resolved, total }
}

export class RebuildRefused extends Error {
  constructor() {
    super('Rebuilding the DNA of someone who never tested needs the owner\'s rule (N126) and a recorded consent for real data. It runs on made-up test families only.')
    this.name = 'RebuildRefused'
  }
}

export type RebuildConsent = { synthetic: true } | { decision: { kind: 'rebuild-consent'; seq: number } }

/**
 * Partly rebuild an untested person P from P's children and the children's other parent (P's partner). For
 * each child, the alleles not from the partner came from P. Across children, a marker where two different
 * alleles came from P is a known heterozygote. One allele seen is kept as half-known ("A?"). Nothing is
 * filled in that wasn't observed.
 */
export function rebuildFromDescendants(children: readonly KitCalls[], partner: KitCalls, consent: RebuildConsent): { rebuilt: Map<string, Calls>; halves: HalfKit[]; known: number; halfKnown: number; total: number } {
  if (!('synthetic' in consent) && consent.decision?.kind !== 'rebuild-consent') throw new RebuildRefused()
  if (children.length < 2) throw new Error('rebuilding needs at least two children')
  const seen = new Map<string, { pos: number; chr: string; got: Set<string> }>()
  const halves: HalfKit[] = []
  for (const ch of children) {
    const { fromOther } = phaseWithParent(ch, partner)
    halves.push(fromOther)
    for (const [chr, c] of fromOther) c.rsid.forEach((r, i) => {
      const call = c.call[i] as string
      let e = seen.get(r)
      if (!e) seen.set(r, (e = { pos: c.position[i] as number, chr, got: new Set() }))
      if (call !== '--') e.got.add(call[0] as string)
    })
  }
  const rebuilt = new Map<string, Calls>()
  let known = 0
  let halfKnown = 0
  for (const [r, e] of seen) {
    let calls = rebuilt.get(e.chr)
    if (!calls) rebuilt.set(e.chr, (calls = { rsid: [], position: [], call: [] }))
    const g = [...e.got].sort()
    const call = g.length === 2 ? g.join('') : g.length === 1 ? `${g[0]}?` : '--'
    if (g.length === 2) known++
    else if (g.length === 1) halfKnown++
    calls.rsid.push(r); calls.position.push(e.pos); calls.call.push(call)
  }
  for (const c of rebuilt.values()) {
    const order = c.position.map((_, i) => i).sort((x, y) => c.position[x]! - c.position[y]!)
    c.rsid = order.map((i) => c.rsid[i]!); c.position = order.map((i) => c.position[i]!); c.call = order.map((i) => c.call[i]!)
  }
  // Compare the person with others through `halves` (with compareHalves): a partial genotype can't rule strangers out.
  return { rebuilt, halves, known, halfKnown, total: seen.size }
}

/**
 * Whether X DNA can pass up a line. Give the sexes from the person upward: the person, their parent on
 * the line, that parent's parent, and so on. A man's X comes only from his mother, so a male followed by a
 * male breaks the path.
 */
export function xPathPossible(sexesUpward: readonly ('M' | 'F')[]): boolean {
  for (let i = 0; i + 1 < sexesUpward.length; i++) if (sexesUpward[i] === 'M' && sexesUpward[i + 1] === 'M') return false
  return true
}
