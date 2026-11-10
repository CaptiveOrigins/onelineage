/**
 * A small seeded random generator (mulberry32). Every random choice in the analysis draws from one of these,
 * so the same inputs and seed always give the same groups (S3).
 */
export class SeededRandom {
  private s: number
  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new Error(`seed must be a whole number, got ${seed}`)
    // Mix the seed so that 0, 1, 2… start far apart.
    this.s = (Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) ^ 0x2545f491) >>> 0
  }
  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** A whole number in [0, n). */
  below(n: number): number {
    return Math.floor(this.next() * n)
  }
  /** Fisher–Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.below(i + 1)
      const t = items[i] as T
      items[i] = items[j] as T
      items[j] = t
    }
    return items
  }
}
