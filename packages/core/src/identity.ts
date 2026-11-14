/**
 * One person, many services (ADR 0001). Every human gets one universal OneFamily ID. Each service's
 * ID attaches to it through an identity link, and only a person confirms a link. The engine only proposes,
 * with its evidence. It never merges people on its own, and never on a name alone.
 *
 * Someone confirmed on two or more services is an anchor. Their segment data on one service can then stand
 * in for their match on another, and their shared matches tie the two services' groups together.
 */
import type { MatchObservation } from './model.js'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32, no I, L, O or U

/** A new universal person ID: "OL-" and 20 random base32 characters (100 bits). Never reused, never derived from anything. */
export function newPersonId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20))
  return 'OL-' + [...bytes].map((b) => ALPHABET[b & 31]).join('')
}

export type ServiceRef = { service: string; id: string }
export type IdentityLink = { person: string; ref: ServiceRef; evidence: string[]; confirmedBy: string; at: string }

export class IdentityRegistry {
  private readonly byRef = new Map<string, IdentityLink>()
  constructor(links: readonly IdentityLink[] = []) {
    for (const l of links) this.add(l)
  }
  private key(r: ServiceRef) {
    return `${r.service}:${r.id}`
  }
  add(link: IdentityLink): void {
    const existing = this.byRef.get(this.key(link.ref))
    if (existing && existing.person !== link.person) {
      throw new Error(`${link.ref.service} ${link.ref.id} is already linked to ${existing.person}; undo that link first`)
    }
    this.byRef.set(this.key(link.ref), link)
  }
  /** Undo a link, for example a wrong one. Everything built on it gets recalculated by the caller. */
  remove(ref: ServiceRef): boolean {
    return this.byRef.delete(this.key(ref))
  }
  personOf(ref: ServiceRef): string | undefined {
    return this.byRef.get(this.key(ref))?.person
  }
  refsOf(person: string): ServiceRef[] {
    return [...this.byRef.values()].filter((l) => l.person === person).map((l) => l.ref)
  }
  /** People confirmed on two or more services. */
  anchors(): string[] {
    const services = new Map<string, Set<string>>()
    for (const l of this.byRef.values()) (services.get(l.person) ?? services.set(l.person, new Set()).get(l.person)!).add(l.ref.service)
    return [...services].filter(([, s]) => s.size >= 2).map(([p]) => p).sort()
  }
}

export type LinkProposal = { a: ServiceRef; b: ServiceRef; score: number; evidence: string[] }

const normName = (n: string) => n.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Propose which matches on two services are the same person, using what's observed from family kits that
 * tested on both. Matching kits are given as pairs: the same family member's kit on service A and on service B.
 *
 * Evidence:
 * - Similar cM to each shared family kit. Services measure differently, so the ratio must be within ±35%,
 *   and it counts more when it's close.
 * - The same normalised full name, or failing that the same surname.
 * - Wildly different cM counts against a pair.
 *
 * Each match takes at most one proposal, the best one. Proposals below `minScore` are dropped, and so is any
 * proposal whose runner-up, for either match, scores within `margin` of it. A close second, such as a
 * sibling with similar cM, means the evidence can't tell them apart. Everything returned still needs a
 * person's confirmation.
 */
export function proposeLinks(a: readonly MatchObservation[], b: readonly MatchObservation[], kitPairs: readonly [string, string][], minScore = 3, margin = 0.5): LinkProposal[] {
  const kitMap = new Map(kitPairs)
  const byMatchA = new Map<string, MatchObservation[]>()
  for (const o of a) (byMatchA.get(o.match) ?? byMatchA.set(o.match, []).get(o.match)!).push(o)
  const byMatchB = new Map<string, MatchObservation[]>()
  for (const o of b) (byMatchB.get(o.match) ?? byMatchB.set(o.match, []).get(o.match)!).push(o)
  const candidates: LinkProposal[] = []
  for (const [ma, oa] of byMatchA) {
    for (const [mb, ob] of byMatchB) {
      let score = 0
      const evidence: string[] = []
      let compared = 0
      for (const x of oa) {
        const kitB = kitMap.get(x.kit)
        const y = ob.find((o) => o.kit === kitB)
        if (!y) continue
        compared++
        const r = Math.log(x.sharedCm / y.sharedCm)
        if (Math.abs(r) <= Math.log(1.35)) {
          const s = 2 * (1 - Math.abs(r) / Math.log(1.35)) + 0.5
          score += s
          evidence.push(`${Math.round(x.sharedCm)} cM vs ${Math.round(y.sharedCm)} cM to the same family kit`)
        } else score -= 3
      }
      if (compared === 0) continue
      const na = normName(oa[0]!.name)
      const nb = normName(ob[0]!.name)
      if (na && na === nb && na.includes(' ')) { score += 3; evidence.push('same full name') }
      else if (na.split(' ').pop() === nb.split(' ').pop() && na.includes(' ') && nb.includes(' ')) { score += 1; evidence.push('same surname') }
      if (score >= minScore) candidates.push({ a: { service: oa[0]!.service, id: ma }, b: { service: ob[0]!.service, id: mb }, score, evidence })
    }
  }
  candidates.sort((x, y) => y.score - x.score)
  const second = (pick: (c: LinkProposal) => string, id: string, best: LinkProposal) => candidates.find((c) => c !== best && pick(c) === id)?.score ?? -Infinity
  const usedA = new Set<string>()
  const usedB = new Set<string>()
  const out: LinkProposal[] = []
  for (const c of candidates) {
    if (usedA.has(c.a.id) || usedB.has(c.b.id)) continue
    if (c.score - second((x) => x.a.id, c.a.id, c) < margin || c.score - second((x) => x.b.id, c.b.id, c) < margin) { usedA.add(c.a.id); usedB.add(c.b.id); continue }
    usedA.add(c.a.id)
    usedB.add(c.b.id)
    out.push(c)
  }
  return out
}
