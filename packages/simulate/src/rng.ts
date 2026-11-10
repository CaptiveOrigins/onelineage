/** A small seeded random generator (mulberry32), so every planted family is reproducible from its seed (S3). */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9
  }
  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list')
    return items[Math.floor(this.next() * items.length)] as T
  }
  /** Poisson by inversion; fine for the small means used here (crossovers per chromosome). */
  poisson(mean: number): number {
    const l = Math.exp(-mean)
    let k = 0
    let p = 1
    do {
      k++
      p *= this.next()
    } while (p > l)
    return k - 1
  }
  /** A UUID-shaped ID in upper case, like the service test IDs. Made up, never real. */
  guid(): string {
    const hex = () => Math.floor(this.next() * 16).toString(16).toUpperCase()
    const part = (n: number) => Array.from({ length: n }, hex).join('')
    return `${part(8)}-${part(4)}-4${part(3)}-${'89AB'[this.int(0, 3)]}${part(3)}-${part(12)}`
  }
}
