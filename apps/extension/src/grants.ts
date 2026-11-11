/**
 * The grants the app gave, held in memory only. When one expires, everything shown under it is dropped.
 */
import type { Grant } from './wire'

export class GrantBook {
  private grants = new Map<string, Grant>()

  add(g: Grant, now: number): boolean {
    if (Date.parse(g.expiresAt) <= now) return false
    this.grants.set(g.id, g)
    return true
  }

  isActive(id: string, now: number): boolean {
    const g = this.grants.get(id)
    return Boolean(g && Date.parse(g.expiresAt) > now)
  }

  remove(id: string): boolean {
    return this.grants.delete(id)
  }

  /** Removes and returns every grant past its expiry. */
  sweep(now: number): Grant[] {
    const out = [...this.grants.values()].filter((g) => Date.parse(g.expiresAt) <= now)
    for (const g of out) this.grants.delete(g.id)
    return out
  }

  clear(): void {
    this.grants.clear()
  }
}
