/**
 * Building blocks for visual phasing with siblings, when no parent has tested (Kathy Johnston's method,
 * done by computer).
 *
 * 1. `ibdStates`: along each chromosome, how much two full siblings share. 0 means neither copy is shared
 *    (opposite homozygotes appear), 1 means one copy (no opposite homozygotes, but genotypes differ), and
 *    2 means both copies (genotypes identical). Judged in windows of markers, then merged.
 * 2. `siblingCrossovers`: with three or more siblings, a change of state that shows up in every pair that
 *    includes one sibling, and in no other pair, is a crossover in that sibling. Those points are where a
 *    sibling's DNA switches from one grandparent to the other, which is what a visual phasing chart is drawn from.
 *
 * Which grandparent each piece came from, and which parent's side it's on, needs more evidence (a match
 * placed on a side, or a parent kit). It's kept separate and never guessed.
 */
import type { GeneticMap, KitCalls } from './compare.js'
import { ONE_CM_PER_MB } from './compare.js'

export type IbdState = 0 | 1 | 2
export type IbdStretch = { chromosome: string; startCm: number; endCm: number; state: IbdState }

type Paired = { pos: number; a: string; b: string }

function pairCalls(a: KitCalls, b: KitCalls, chr: string): Paired[] {
  const ca = a.get(chr)
  const cb = b.get(chr)
  if (!ca || !cb) return []
  const other = new Map<string, string>()
  cb.rsid.forEach((r, i) => other.set(r, cb.call[i] as string))
  const out: Paired[] = []
  ca.rsid.forEach((r, i) => {
    const x = ca.call[i] as string
    const y = other.get(r)
    if (y === undefined || x === '--' || y === '--' || x.length !== 2 || y.length !== 2) return
    out.push({ pos: Number(ca.position[i]), a: x, b: y })
  })
  return out.sort((p, q) => p.pos - q.pos)
}

const sorted = (g: string) => (g[0]! <= g[1]! ? g : g[1]! + g[0]!)

export type IbdOptions = { window?: number; map?: GeneticMap; chromosomes?: readonly string[]; /** Opposite-homozygote share above which a window is state 0. */ ibd0At?: number; /** Differing-genotype share below which a window is state 2. */ ibd2Below?: number }

export function ibdStates(a: KitCalls, b: KitCalls, opts: IbdOptions = {}): IbdStretch[] {
  const window = opts.window ?? 150
  const map = opts.map ?? ONE_CM_PER_MB
  const ibd0At = opts.ibd0At ?? 0.01
  const ibd2Below = opts.ibd2Below ?? 0.03
  const out: IbdStretch[] = []
  for (const chr of opts.chromosomes ?? Array.from({ length: 22 }, (_, i) => String(i + 1))) {
    const calls = pairCalls(a, b, chr)
    for (let s = 0; s < calls.length; s += window) {
      const w = calls.slice(s, s + window)
      let opp = 0
      let diff = 0
      for (const m of w) {
        const ah = m.a[0] === m.a[1]
        const bh = m.b[0] === m.b[1]
        if (ah && bh && m.a[0] !== m.b[0]) opp++
        if (sorted(m.a) !== sorted(m.b)) diff++
      }
      const state: IbdState = opp / w.length > ibd0At ? 0 : diff / w.length < ibd2Below ? 2 : 1
      const startCm = map.toCm(chr, w[0]!.pos)
      const endCm = map.toCm(chr, w[w.length - 1]!.pos)
      const last = out[out.length - 1]
      if (last && last.chromosome === chr && last.state === state) last.endCm = endCm
      else out.push({ chromosome: chr, startCm, endCm, state })
    }
  }
  return out
}

export type Crossover = { sibling: string; chromosome: string; atCm: number }

/**
 * Crossovers attributed to individual siblings, from the IBD states of every pair. A boundary near the same
 * position (within `toleranceCm`) in all pairs that include one sibling, and in none of the others, is that
 * sibling's crossover. Boundaries that fit no single sibling are left out, never forced.
 */
export function siblingCrossovers(states: ReadonlyMap<string, readonly IbdStretch[]>, siblings: readonly string[], toleranceCm = 3): Crossover[] {
  if (siblings.length < 3) throw new Error('crossovers can only be attributed with three or more siblings')
  const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)
  const pairs: [string, string][] = []
  for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) pairs.push([siblings[i]!, siblings[j]!])
  const boundaries = new Map<string, { chromosome: string; at: number }[]>()
  for (const [x, y] of pairs) {
    const st = states.get(key(x, y))
    if (!st) throw new Error(`no IBD states for ${x} and ${y}`)
    const b: { chromosome: string; at: number }[] = []
    for (let i = 1; i < st.length; i++) if (st[i]!.chromosome === st[i - 1]!.chromosome) b.push({ chromosome: st[i]!.chromosome, at: st[i]!.startCm })
    boundaries.set(key(x, y), b)
  }
  const has = (pair: string, chr: string, at: number) => (boundaries.get(pair) ?? []).some((b) => b.chromosome === chr && Math.abs(b.at - at) <= toleranceCm)
  const out: Crossover[] = []
  for (const s of siblings) {
    const own = pairs.filter(([x, y]) => x === s || y === s).map(([x, y]) => key(x, y))
    const others = pairs.filter(([x, y]) => x !== s && y !== s).map(([x, y]) => key(x, y))
    for (const b of boundaries.get(own[0]!) ?? []) {
      if (own.every((p) => has(p, b.chromosome, b.at)) && others.every((p) => !has(p, b.chromosome, b.at))) {
        if (!out.some((c) => c.sibling === s && c.chromosome === b.chromosome && Math.abs(c.atCm - b.at) <= toleranceCm)) out.push({ sibling: s, chromosome: b.chromosome, atCm: b.at })
      }
    }
  }
  return out.sort((p, q) => Number(p.chromosome) - Number(q.chromosome) || p.atCm - q.atCm)
}

export type PhasedPiece = { sibling: string; chromosome: string; startCm: number; endCm: number; /** One of the two parents' sides, unnamed. */ side: 1 | 2; /** One of that parent's two parents, unnamed. */ grandparent: 'a' | 'b' }

/**
 * The visual phasing chart for three siblings: for every stretch of every chromosome, which grandparent
 * each sibling's two copies came from. Labels are relative. "Side 1" and "side 2" are the two parents, and
 * "a" and "b" are each parent's two parents, unnamed until a placed match or a parent kit says which is which.
 *
 * Method: each stretch between state changes has 64 possible assignments (each sibling's two copies, each
 * from grandparent a or b). Each assignment predicts the three pair states. A best path along the chromosome
 * balances disagreement with the observed states against the number of switches, since every switch is a
 * crossover. The first stretch is fixed to break the symmetry of the unnamed labels.
 */
export function phaseThreeSiblings(states: ReadonlyMap<string, readonly IbdStretch[]>, siblings: readonly [string, string, string], switchCost = 1.5): PhasedPiece[] {
  const [A, B, C] = siblings
  const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)
  const pairs: [number, number, string][] = [[0, 1, key(A, B)], [0, 2, key(A, C)], [1, 2, key(B, C)]]
  for (const [, , k] of pairs) if (!states.has(k)) throw new Error(`no IBD states for ${k.replace('|', ' and ')}`)
  const bits = (s: number) => [0, 1, 2].map((i) => [(s >> (2 * i)) & 1, (s >> (2 * i + 1)) & 1] as const) // per sibling: [side1, side2]
  const predict = (s: number, x: number, y: number) => { const b = bits(s); return (b[x]![0] === b[y]![0] ? 1 : 0) + (b[x]![1] === b[y]![1] ? 1 : 0) }
  const flips = (s: number, t: number) => { let d = s ^ t, n = 0; while (d) { n += d & 1; d >>= 1 } return n }
  const out: PhasedPiece[] = []
  const chromosomes = [...new Set([...states.values()].flatMap((st) => st.map((x) => x.chromosome)))]
  for (const chr of chromosomes) {
    const lists = pairs.map(([, , k]) => (states.get(k) ?? []).filter((x) => x.chromosome === chr))
    const cuts = [...new Set(lists.flatMap((l) => l.flatMap((x) => [x.startCm, x.endCm])))].sort((p, q) => p - q)
    const intervals: { start: number; end: number; obs: (IbdState | undefined)[] }[] = []
    for (let i = 0; i + 1 < cuts.length; i++) {
      const start = cuts[i]!, end = cuts[i + 1]!, mid = (start + end) / 2
      if (end - start < 1e-9) continue
      intervals.push({ start, end, obs: lists.map((l) => l.find((x) => x.startCm <= mid && mid <= x.endCm)?.state) })
    }
    if (!intervals.length) continue
    const emit = (s: number, obs: (IbdState | undefined)[]) => pairs.reduce((t, [x, y], i) => t + (obs[i] === undefined ? 0 : Math.abs(predict(s, x, y) - (obs[i] as number))), 0)
    let cost = Array.from({ length: 64 }, (_, s) => ((s & 3) === 0 ? emit(s, intervals[0]!.obs) : Infinity))
    const back: number[][] = []
    for (let i = 1; i < intervals.length; i++) {
      const next: number[] = new Array(64).fill(Infinity)
      const from: number[] = new Array(64).fill(0)
      for (let t = 0; t < 64; t++) {
        for (let s = 0; s < 64; s++) {
          const c = cost[s]! + switchCost * flips(s, t)
          if (c < next[t]!) { next[t] = c; from[t] = s }
        }
        next[t]! += emit(t, intervals[i]!.obs)
      }
      back.push(from)
      cost = next
    }
    let s = cost.indexOf(Math.min(...cost))
    const path = [s]
    for (let i = back.length - 1; i >= 0; i--) { s = back[i]![s]!; path.unshift(s) }
    path.forEach((st, i) => {
      const b = bits(st)
      siblings.forEach((sib, j) => {
        for (const side of [1, 2] as const) {
          const gp = b[j]![side - 1] ? 'b' : 'a'
          const last = [...out].reverse().find((p) => p.sibling === sib && p.chromosome === chr && p.side === side)
          if (last && last.grandparent === gp && Math.abs(last.endCm - intervals[i]!.start) < 1e-9) last.endCm = intervals[i]!.end
          else out.push({ sibling: sib, chromosome: chr, startCm: intervals[i]!.start, endCm: intervals[i]!.end, side, grandparent: gp })
        }
      })
    })
  }
  return out
}
