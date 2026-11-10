/**
 * The Leiden algorithm (Traag, Waltman and van Eck, "From Louvain to Leiden: guaranteeing well-connected
 * communities", Scientific Reports 9, 5233, 2019), written here from the paper.
 *
 * It optimises modularity with a resolution parameter γ (the "RB configuration" quality):
 *   Q = Σ_c [ e_c / m − γ (K_c / 2m)² ]
 * where e_c is the edge weight inside community c, K_c the summed node strengths in c, and m the total edge weight.
 *
 * Each pass has three phases:
 * 1. fast local moving: nodes move to the neighbouring community that raises Q most, revisiting only nodes
 *    whose neighbourhood changed
 * 2. refinement: inside each community, nodes start alone and merge only into well-connected sub-communities,
 *    chosen at random with odds rising steeply with the gain (randomness θ). This is what guarantees that
 *    every community is connected, which Louvain doesn't
 * 3. aggregation: each refined sub-community becomes one node, starting in its unrefined community
 * Passes repeat until nothing moves. Every random choice draws from one seeded generator (S3).
 */
import { type Graph, graphFromEdges } from './graph.js'
import { SeededRandom } from './rng.js'

export type LeidenOptions = {
  /** γ. Higher gives more, smaller groups. Default 1 (plain modularity). */
  resolution?: number
  /** Seed for every random choice. Default 0. */
  seed?: number
  /** θ, how random the refinement's choices are. Default 0.01, as in the paper. */
  randomness?: number
  /** Full passes over the original graph, each starting from the last result. Stops early once stable. Default 10. */
  maxIterations?: number
  /** A starting partition, as community numbers per node. Default: every node alone. */
  initial?: readonly number[]
}

export type Partition = {
  /** Community per node, numbered from 0 by size, largest first; ties go to the community with the lowest node. */
  membership: number[]
  /** Q as defined above, at the resolution used. */
  quality: number
}

const EPS = 1e-12

type Level = { g: Graph; k: Float64Array; n: number }

function strengths(g: Graph): Float64Array {
  const k = new Float64Array(g.ids.length)
  g.wt.forEach((ws, v) => { let s = 2 * (g.self[v] as number); for (const w of ws) s += w; k[v] = s })
  return k
}

export function leiden(graph: Graph, opts: LeidenOptions = {}): Partition {
  const gamma = opts.resolution ?? 1
  const theta = opts.randomness ?? 0.01
  const rng = new SeededRandom(opts.seed ?? 0)
  const n = graph.ids.length
  if (n === 0) return { membership: [], quality: 0 }
  const k0 = strengths(graph)
  let twoM = 0
  for (const x of k0) twoM += x
  if (twoM === 0) {
    // No edges: every node is its own community.
    return { membership: graph.ids.map((_, i) => i), quality: 0 }
  }
  let membership = opts.initial ? compact(opts.initial) : graph.ids.map((_, i) => i)
  if (membership.length !== n) throw new Error('initial partition has the wrong length')

  for (let iter = 0; iter < (opts.maxIterations ?? 10); iter++) {
    const before = membership.join(',')
    membership = onePass({ g: graph, k: k0, n }, membership, gamma, theta, twoM, rng)
    if (membership.join(',') === before) break
  }
  membership = bySize(membership)
  return { membership, quality: quality(graph, membership, gamma) }
}

/** One Leiden pass from a starting partition of the original graph. Returns the partition of the original nodes. */
function onePass(start: Level, initial: number[], gamma: number, theta: number, twoM: number, rng: SeededRandom): number[] {
  let level = start
  let memb = compact(initial)
  /** Original node → node of the current level. */
  let at = start.g.ids.map((_, i) => i)
  for (;;) {
    moveNodes(level, memb, gamma, twoM, rng)
    memb = compact(memb)
    const communities = Math.max(...memb) + 1
    if (communities === level.n) break
    let refined = refine(level, memb, gamma, theta, twoM, rng)
    // If refinement leaves every node alone, aggregating by it would change nothing; use the partition itself.
    if (Math.max(...refined) + 1 === level.n) refined = memb.slice()
    const agg = aggregate(level, refined, memb)
    at = at.map((v) => agg.nodeOf[v] as number)
    level = agg.level
    memb = agg.membership
  }
  return at.map((v) => memb[v] as number)
}

/** Phase 1: fast local moving, with a queue of nodes to revisit. Changes `memb` in place. */
function moveNodes({ g, k, n }: Level, memb: number[], gamma: number, twoM: number, rng: SeededRandom): void {
  const K = new Float64Array(n)
  const size = new Int32Array(n)
  for (let v = 0; v < n; v++) { K[memb[v] as number]! += k[v] as number; size[memb[v] as number]!++ }
  const empty: number[] = []
  for (let c = n - 1; c >= 0; c--) if (size[c] === 0) empty.push(c)

  const queue = rng.shuffle(Array.from({ length: n }, (_, i) => i))
  const inQ = new Uint8Array(n).fill(1)
  const wTo = new Float64Array(n)
  const touched: number[] = []
  const seen = new Uint8Array(n)
  let head = 0
  while (head < queue.length) {
    const v = queue[head++] as number
    inQ[v] = 0
    const own = memb[v] as number
    const kv = k[v] as number
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) {
      const c = memb[ns[j] as number] as number
      if (!seen[c]) { seen[c] = 1; touched.push(c) }
      wTo[c]! += ws[j] as number
    }
    K[own]! -= kv
    size[own]!--
    let best = own
    let bestGain = wTo[own]! - (gamma * kv * K[own]!) / twoM
    for (const c of touched) {
      const gain = wTo[c]! - (gamma * kv * K[c]!) / twoM
      if (gain > bestGain + EPS) { best = c; bestGain = gain }
    }
    // An empty community gains exactly 0.
    if (size[own]! > 0 && 0 > bestGain + EPS) { best = empty.pop() as number; bestGain = 0 }
    K[best]! += kv
    size[best]!++
    memb[v] = best
    if (size[own] === 0 && best !== own) empty.push(own)
    for (const c of touched) { wTo[c] = 0; seen[c] = 0 }
    touched.length = 0
    if (best !== own) {
      for (const u of ns) {
        if (!inQ[u] && memb[u] !== best) { inQ[u] = 1; queue.push(u) }
      }
    }
  }
}

/**
 * Phase 2: refinement. Within each community S, nodes begin alone. A node still alone, and well connected to the
 * rest of S, may join a well-connected sub-community of S that doesn't lower Q, picked at random with probability
 * proportional to exp(gain / θ).
 */
function refine({ g, k, n }: Level, memb: number[], gamma: number, theta: number, twoM: number, rng: SeededRandom): number[] {
  const KS = new Float64Array(n)
  for (let v = 0; v < n; v++) KS[memb[v] as number]! += k[v] as number
  const ref = Array.from({ length: n }, (_, i) => i)
  const Kr = Float64Array.from(k)
  const size = new Int32Array(n).fill(1)
  /** Edge weight from refined community c to the rest of its S. */
  const ext = new Float64Array(n)
  for (let v = 0; v < n; v++) {
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) if (memb[ns[j] as number] === memb[v]) ext[v]! += ws[j] as number
  }
  const wTo = new Float64Array(n)
  const seen = new Uint8Array(n)
  const touched: number[] = []
  for (const v of rng.shuffle(Array.from({ length: n }, (_, i) => i))) {
    const own = ref[v] as number
    if (size[own] !== 1) continue
    const S = memb[v] as number
    const kv = k[v] as number
    const extV = ext[own] as number
    if (extV < (gamma * kv * (KS[S]! - kv)) / twoM - EPS) continue
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) {
      const u = ns[j] as number
      if (memb[u] !== S) continue
      const c = ref[u] as number
      if (!seen[c]) { seen[c] = 1; touched.push(c) }
      wTo[c]! += ws[j] as number
    }
    const cands: number[] = [own]
    const gains: number[] = [0]
    for (const c of touched) {
      if (c === own) continue
      const wellConnected = ext[c]! >= (gamma * Kr[c]! * (KS[S]! - Kr[c]!)) / twoM - EPS
      if (!wellConnected) continue
      const gain = wTo[c]! - (gamma * kv * Kr[c]!) / twoM
      if (gain >= -EPS) { cands.push(c); gains.push(gain) }
    }
    let pick = own
    if (cands.length > 1) {
      const top = Math.max(...gains)
      const odds = gains.map((x) => Math.exp((x - top) / theta))
      let r = rng.next() * odds.reduce((a, b) => a + b, 0)
      pick = cands[cands.length - 1] as number
      for (let i = 0; i < cands.length; i++) {
        r -= odds[i] as number
        if (r < 0) { pick = cands[i] as number; break }
      }
    }
    if (pick !== own) {
      ref[v] = pick
      Kr[pick]! += kv
      Kr[own] = 0
      size[pick]!++
      size[own] = 0
      ext[pick] = ext[pick]! + extV - 2 * wTo[pick]!
    }
    for (const c of touched) { wTo[c] = 0; seen[c] = 0 }
    touched.length = 0
  }
  return compact(ref)
}

/** Phase 3: one node per refined community, placed in its unrefined community. */
function aggregate({ g, k, n }: Level, refined: number[], memb: number[]): { level: Level; nodeOf: number[]; membership: number[] } {
  const count = Math.max(...refined) + 1
  const sums = new Map<number, number>()
  const selfW = new Float64Array(count)
  const k2 = new Float64Array(count)
  const membership = new Array<number>(count).fill(0)
  for (let v = 0; v < n; v++) {
    const a = refined[v] as number
    k2[a]! += k[v] as number
    selfW[a]! += g.self[v] as number
    membership[a] = memb[v] as number
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) {
      const u = ns[j] as number
      if (u < v) continue
      const b = refined[u] as number
      if (a === b) selfW[a]! += ws[j] as number
      else {
        const key = a < b ? a * count + b : b * count + a
        sums.set(key, (sums.get(key) ?? 0) + (ws[j] as number))
      }
    }
  }
  const edges: [number, number, number][] = [...sums.entries()].sort((x, y) => x[0] - y[0]).map(([key, w]) => [Math.floor(key / count), key % count, w])
  selfW.forEach((w, a) => { if (w) edges.push([a, a, w]) })
  const ids = Array.from({ length: count }, (_, i) => String(i))
  return { level: { g: graphFromEdges(ids, edges), k: k2, n: count }, nodeOf: refined, membership: compact(membership) }
}

/** Renumber communities 0, 1, 2… in order of first appearance. */
function compact(memb: readonly number[]): number[] {
  const map = new Map<number, number>()
  return memb.map((c) => {
    let x = map.get(c)
    if (x === undefined) { x = map.size; map.set(c, x) }
    return x
  })
}

/** Renumber communities by size, largest first; ties go to the community holding the lowest node. */
export function bySize(memb: readonly number[]): number[] {
  const first = new Map<number, number>()
  const size = new Map<number, number>()
  memb.forEach((c, v) => { if (!first.has(c)) first.set(c, v); size.set(c, (size.get(c) ?? 0) + 1) })
  const order = [...first.keys()].sort((a, b) => size.get(b)! - size.get(a)! || first.get(a)! - first.get(b)!)
  const to = new Map(order.map((c, i) => [c, i]))
  return memb.map((c) => to.get(c) as number)
}

/** Q = Σ_c [ e_c / m − γ (K_c / 2m)² ]. With γ = 1 this is Newman's modularity. */
export function quality(g: Graph, memb: readonly number[], gamma = 1): number {
  const k = strengths(g)
  let twoM = 0
  for (const x of k) twoM += x
  if (twoM === 0) return 0
  const inside = new Map<number, number>()
  const K = new Map<number, number>()
  memb.forEach((c, v) => {
    K.set(c, (K.get(c) ?? 0) + (k[v] as number))
    let e = 2 * (g.self[v] as number)
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) if (memb[ns[j] as number] === c) e += ws[j] as number
    inside.set(c, (inside.get(c) ?? 0) + e)
  })
  let q = 0
  for (const [c, Kc] of K) q += (inside.get(c) as number) / twoM - gamma * (Kc / twoM) ** 2
  return q
}
