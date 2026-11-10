/**
 * The blind-first gate (ADR 0002). A kit is blind until unblinded on purpose. While it's blind, nothing
 * may read its tree sources: match trees, common-ancestor hints, the user's own tree, groups and notes.
 */
export type Unblinding = { kit: string; at: string; by: string }

export class TreeSourceSealed extends Error {
  constructor(public readonly kit: string, what: string) {
    super(`${what} is sealed: kit ${kit} is still blind. Unblind it first, on purpose; that's recorded.`)
    this.name = 'TreeSourceSealed'
  }
}

export class BlindGate {
  private readonly open = new Map<string, Unblinding>()
  constructor(unblindings: readonly Unblinding[] = []) {
    for (const u of unblindings) this.open.set(u.kit, u)
  }
  isBlind(kit: string): boolean {
    return !this.open.has(kit)
  }
  /** Returns the record to append to the decisions log. */
  unblind(kit: string, by: string, at = new Date().toISOString()): Unblinding {
    const u = { kit, at, by }
    this.open.set(kit, u)
    return u
  }
  /** Throws unless the kit has been unblinded. */
  requireUnblinded(kit: string, what: string): void {
    if (this.isBlind(kit)) throw new TreeSourceSealed(kit, what)
  }
}

/** Sources that are made up on purpose (planted test families). They're exempt from service terms, never from blindness. */
export const SYNTHETIC_SOURCES: ReadonlySet<string> = new Set(['planted'])
