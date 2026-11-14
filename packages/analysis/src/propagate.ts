/**
 * Seeded placement. A person picks a few matches they know belong to each line (the seeds). Every other match in
 * the pool is scored by its links to matches already placed: each link adds log(1 + cM) to that line. A match is
 * placed only when its best line scores at least `ratio` times the runner-up and at least `minScore`. Everything
 * else stays "unplaced", never guessed. Rounds repeat, all matches at once, until nothing changes.
 */
import type { SharedMatchLink } from '@extantape/onefamily-core'
import { cmp } from './graph.js'

export type PropagateOptions = {
  /** Winner must score at least this many times the runner-up. Default 2. */
  ratio?: number
  /** Winner must score at least this. Default 2 × log(1 + 20), about two links at 20 cM. */
  minScore?: number
  /** Most rounds. Default 10. */
  maxRounds?: number
  weight?: (cm: number) => number
}

export type Placement = {
  match: string
  /** The line, or "unplaced". */
  line: string
  seed: boolean
  /** Score per line from the final round's links to placed matches. */
  scores: Record<string, number>
}

export const UNPLACED = 'unplaced'

/**
 * @param pool  matches to place (seeds may be in it or not)
 * @param seeds line name → matches known to be on it. A match may seed only one line.
 * @param links shared-match links; a pair listed twice counts once, at its larger cM
 */
export function propagateFromSeeds(
  pool: readonly string[],
  seeds: Readonly<Record<string, readonly string[]>>,
  links: readonly SharedMatchLink[],
  opts: PropagateOptions = {},
): { placements: Placement[]; rounds: number } {
  const ratio = opts.ratio ?? 2
  const weight = opts.weight ?? Math.log1p
  const minScore = opts.minScore ?? 2 * weight(20)
  const adj = new Map<string, Map<string, number>>()
  const add = (a: string, b: string, c: number) => {
    let m = adj.get(a)
    if (!m) adj.set(a, (m = new Map()))
    m.set(b, Math.max(m.get(b) ?? 0, c))
  }
  for (const l of links) if (l.a !== l.b) { add(l.a, l.b, l.cmAB); add(l.b, l.a, l.cmAB) }

  const line = new Map<string, string>()
  for (const name of Object.keys(seeds).sort(cmp)) {
    if (name === UNPLACED) throw new Error(`"${UNPLACED}" can't be a line name`)
    for (const m of seeds[name] as readonly string[]) {
      const prev = line.get(m)
      if (prev !== undefined && prev !== name) throw new Error(`match ${m} seeds two lines: ${prev} and ${name}`)
      line.set(m, name)
    }
  }
  const fixed = new Set(line.keys())
  const order = [...new Set(pool)].sort(cmp)
  const score = (m: string) => {
    const s = new Map<string, number>()
    for (const [x, c] of adj.get(m) ?? []) {
      const l = line.get(x)
      if (l !== undefined && x !== m) s.set(l, (s.get(l) ?? 0) + weight(c))
    }
    return s
  }

  let rounds = 0
  for (; rounds < (opts.maxRounds ?? 10); ) {
    rounds++
    const next = new Map<string, string>()
    for (const m of order) {
      if (fixed.has(m)) continue
      const ranked = [...score(m).entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
      const [top, second] = ranked
      if (!top) continue
      const runnerUp = second ? second[1] : 0
      if (top[1] >= ratio * runnerUp && top[1] >= minScore) next.set(m, top[0])
    }
    let changed = 0
    for (const [m, l] of next) if (line.get(m) !== l) { line.set(m, l); changed++ }
    if (!changed) break
  }
  const placements = order.map((m) => ({
    match: m,
    line: line.get(m) ?? UNPLACED,
    seed: fixed.has(m),
    scores: Object.fromEntries([...score(m).entries()].sort((a, b) => cmp(a[0], b[0]))),
  }))
  return { placements, rounds }
}
