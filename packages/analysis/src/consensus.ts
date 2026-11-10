/**
 * Consensus clustering: Leiden run many times, over several seeds and resolutions. Two matches end up in the same
 * group only if they were put together in at least `threshold` of the runs, and groups are the connected pieces
 * of that "usually together" graph. A match's stability is how often, on average, it sat with its group.
 */
import { components, type Graph, graphFromEdges, reweight } from './graph.js'
import { leiden } from './leiden.js'

export type ConsensusOptions = {
  /** Resolutions to run at. Default [0.5, 1, 1.5]. */
  resolutions?: readonly number[]
  /** Seeds to run with at each resolution. Default 0 to 9. */
  seeds?: readonly number[]
  /** Share of runs two matches must share a group in to be joined. Default 0.6. */
  threshold?: number
  /** Edge weight Leiden sees, from the match-to-match cM. Default log(1 + cM), which keeps a few close pairs from swamping the rest. */
  weight?: (cm: number) => number
}

export type ConsensusResult = {
  /** Group per node, numbered by size, largest first. */
  group: number[]
  /** Per node: mean co-assignment with the members of its own group (itself included), from 0 to 1. */
  stability: number[]
  runs: number
  settings: { resolutions: number[]; seeds: number[]; threshold: number }
}

export function consensusClusters(graph: Graph, opts: ConsensusOptions = {}): ConsensusResult {
  const resolutions = [...(opts.resolutions ?? [0.5, 1, 1.5])]
  const seeds = [...(opts.seeds ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]
  const threshold = opts.threshold ?? 0.6
  const g = reweight(graph, opts.weight ?? Math.log1p)
  const n = g.ids.length
  const co = new Float64Array(n * n)
  let runs = 0
  for (const r of resolutions) {
    for (const s of seeds) {
      const { membership } = leiden(g, { resolution: r, seed: s })
      const groups = new Map<number, number[]>()
      membership.forEach((c, v) => { const l = groups.get(c); if (l) l.push(v); else groups.set(c, [v]) })
      for (const members of groups.values()) for (const a of members) for (const b of members) co[a * n + b]! += 1
      runs++
    }
  }
  if (runs) for (let i = 0; i < co.length; i++) co[i]! /= runs

  const edges: [number, number, number][] = []
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (co[a * n + b]! >= threshold) edges.push([a, b, 1])
  const comps = components(graphFromEdges(g.ids, edges))
  const group = new Array<number>(n).fill(0)
  comps.forEach((c, i) => { for (const v of c) group[v] = i })
  const stability = group.map((gi, v) => {
    const members = comps[gi] as number[]
    let s = 0
    for (const u of members) s += co[v * n + u]!
    return s / members.length
  })
  return { group, stability, runs, settings: { resolutions, seeds, threshold } }
}
