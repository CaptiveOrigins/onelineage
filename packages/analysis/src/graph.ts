/**
 * The match network: one node per match, one edge per shared-match link, weighted by the cM the two matches
 * share with each other.
 */
import type { MatchObservation, SharedMatchLink } from '@extantape/onefamily-core'

/** An undirected weighted graph on whole-number nodes. Self-loops are kept apart, in `self`. */
export type Graph = {
  /** Node labels, in node order. */
  ids: readonly string[]
  /** Per node: neighbours and edge weights, as parallel arrays. Every edge is listed from both ends. */
  nbr: readonly number[][]
  wt: readonly number[][]
  /** Per node: self-loop weight (only aggregated graphs have any). */
  self: readonly number[]
}

export function graphFromEdges(ids: readonly string[], edges: Iterable<readonly [number, number, number]>): Graph {
  const nbr: number[][] = ids.map(() => [])
  const wt: number[][] = ids.map(() => [])
  const self = ids.map(() => 0)
  for (const [a, b, w] of edges) {
    if (a === b) { self[a] = (self[a] as number) + w; continue }
    ;(nbr[a] as number[]).push(b); (wt[a] as number[]).push(w)
    ;(nbr[b] as number[]).push(a); (wt[b] as number[]).push(w)
  }
  return { ids, nbr, wt, self }
}

/** The same graph with every edge weight passed through `f`. */
export function reweight(g: Graph, f: (w: number) => number): Graph {
  return { ids: g.ids, nbr: g.nbr, wt: g.wt.map((ws) => ws.map(f)), self: g.self.map((w) => (w ? f(w) : 0)) }
}

/** The subgraph on the given nodes, renumbered in the order given. */
export function subgraph(g: Graph, nodes: readonly number[]): { graph: Graph; from: number[] } {
  const at = new Map(nodes.map((v, i) => [v, i]))
  const edges: [number, number, number][] = []
  nodes.forEach((v, i) => {
    const ns = g.nbr[v] as number[]
    const ws = g.wt[v] as number[]
    for (let j = 0; j < ns.length; j++) {
      const k = at.get(ns[j] as number)
      if (k !== undefined && i < k) edges.push([i, k, ws[j] as number])
    }
    if (g.self[v]) edges.push([i, i, g.self[v] as number])
  })
  return { graph: graphFromEdges(nodes.map((v) => g.ids[v] as string), edges), from: [...nodes] }
}

/** Connected components, largest first; ties go to the one holding the lowest node. */
export function components(g: Graph, nodes?: readonly number[]): number[][] {
  const allowed = nodes ? new Set(nodes) : null
  const seen = new Set<number>()
  const out: number[][] = []
  for (const s of nodes ?? g.ids.map((_, i) => i)) {
    if (seen.has(s)) continue
    const comp: number[] = []
    const stack = [s]
    seen.add(s)
    while (stack.length) {
      const v = stack.pop() as number
      comp.push(v)
      for (const u of g.nbr[v] as number[]) {
        if (!seen.has(u) && (!allowed || allowed.has(u))) { seen.add(u); stack.push(u) }
      }
    }
    out.push(comp.sort((a, b) => a - b))
  }
  return out.sort((a, b) => b.length - a.length || (a[0] as number) - (b[0] as number))
}

export type GraphOptions = {
  /** Smallest total cM with the kit for a match to be a node. The scripts this ports use 20, where shared-match lists start. */
  minCm?: number
  /** Largest total cM. Very close family share with nearly everyone and would tie every group together. Default 400. */
  maxCm?: number
}

export type Exclusion = { match: string; reason: 'below-min-cm' | 'above-max-cm' | 'both-sides' | 'no-shared-match-list' | 'no-links' }

export type MatchGraph = {
  kit: string
  /** Raw match-to-match cM on the edges; the strongest figure where a pair is listed twice. */
  graph: Graph
  observations: ReadonlyMap<string, MatchObservation>
  /** Matches left out of the network, and why. */
  excluded: Exclusion[]
}

/**
 * Builds the network the clustering runs on:
 * - nodes are matches from `minCm` to `maxCm` that have their own shared-match list, and aren't marked as on both sides
 * - edges are shared-match links between two nodes, weighted by the cM the two share (the larger, if listed twice)
 * - matches with no edge at all are listed as excluded, with reason `no-links`
 * Nodes are ordered by match ID, so the input order never changes the result.
 */
export function buildMatchGraph(observations: readonly MatchObservation[], links: readonly SharedMatchLink[], opts: GraphOptions = {}): MatchGraph {
  const minCm = opts.minCm ?? 20
  const maxCm = opts.maxCm ?? 400
  const kits = new Set([...observations.map((o) => o.kit), ...links.map((l) => l.kit)])
  if (kits.size !== 1) throw new Error(`clustering runs on one kit at a time; got ${kits.size}`)
  const kit = [...kits][0] as string
  const byMatch = new Map(observations.map((o) => [o.match, o]))
  if (byMatch.size !== observations.length) throw new Error('a match appears more than once in the observations')
  const hasList = new Set(links.map((l) => l.a))

  const excluded: Exclusion[] = []
  const keep: string[] = []
  for (const o of [...observations].sort((x, y) => cmp(x.match, y.match))) {
    if (o.sharedCm < minCm) excluded.push({ match: o.match, reason: 'below-min-cm' })
    else if (o.sharedCm > maxCm) excluded.push({ match: o.match, reason: 'above-max-cm' })
    else if (o.side === 'both') excluded.push({ match: o.match, reason: 'both-sides' })
    else if (!hasList.has(o.match)) excluded.push({ match: o.match, reason: 'no-shared-match-list' })
    else keep.push(o.match)
  }
  const at = new Map(keep.map((m, i) => [m, i]))
  const best = new Map<string, [number, number, number]>()
  for (const l of links) {
    const a = at.get(l.a)
    const b = at.get(l.b)
    if (a === undefined || b === undefined || a === b) continue
    const [i, j] = a < b ? [a, b] : [b, a]
    const key = `${i},${j}`
    const prev = best.get(key)
    if (!prev || prev[2] < l.cmAB) best.set(key, [i, j, l.cmAB])
  }
  const full = graphFromEdges(keep, [...best.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]))
  const linked = keep.map((_, i) => i).filter((i) => (full.nbr[i] as number[]).length > 0)
  for (const i of keep.map((_, i) => i)) if (!(full.nbr[i] as number[]).length) excluded.push({ match: keep[i] as string, reason: 'no-links' })
  excluded.sort((x, y) => cmp(x.match, y.match))
  return { kit, graph: subgraph(full, linked).graph, observations: byMatch, excluded }
}

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
