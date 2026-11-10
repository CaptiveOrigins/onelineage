/**
 * Two-way splits, per side. Each side's network is split into its two best-separated halves, then each half again,
 * so the levels line up roughly with grandparents and great-grandparents.
 *
 * Only matches sharing 2 or more segments take part in the splits. A single-segment match often shares one old
 * segment with a large, tightly linked set of distant cousins, and such a pile-up can outweigh a real grandparent
 * line. Single-segment matches are attached afterwards, by where most of their links go.
 */
import { components, type Graph, type MatchGraph, reweight, subgraph } from './graph.js'
import { leiden, quality } from './leiden.js'

export type SplitOptions = {
  /** Leiden runs per split, with seeds 0 to runs − 1. Default 8. */
  runs?: number
  /** Smallest connected core worth splitting. Default 20. */
  minCore?: number
  /** The smaller half must hold at least this share of the core. Default 0.08. */
  minShare?: number
  /** Resolutions searched, by halving the range on a log scale. Default 0.0005 to 1, 30 steps. */
  resolutionRange?: readonly [number, number]
  searchSteps?: number
  /** A split is kept only with modularity at least this (on the match-to-match cM). Default 0.1. */
  minModularity?: number
  /** …and only if the runs agree on at least this share of matches. Default 0.85. */
  minAgreement?: number
  /** Levels of splitting below each side. Default 2. */
  maxDepth?: number
  /** Matches with fewer segments with the kit are attached afterwards, not split. Default 2. */
  minSegments?: number
  weight?: (cm: number) => number
}

export type TwoWay = {
  /** The heavier half (more summed cM with the kit) and the lighter one, as node numbers. */
  a: number[]
  b: number[]
  /** Core nodes the runs couldn't settle. They stay at the level above. */
  unsettled: number[]
  /** Nodes outside the largest connected piece. */
  outside: number[]
  modularity: number
  agreement: number
}

/**
 * Splits `nodes` of `graph` in two, or returns null when the largest connected piece is under `minCore` or no
 * resolution gives two big enough halves. Each run searches for the lowest resolution that gives at least two
 * groups with the second big enough. The runs are aligned to the first, and each node takes the majority label;
 * a tie leaves it unsettled.
 */
export function twoWaySplit(graph: Graph, nodes: readonly number[], cmOf: (node: number) => number, opts: SplitOptions = {}): TwoWay | null {
  const minCore = opts.minCore ?? 20
  const minShare = opts.minShare ?? 0.08
  const [lo0, hi0] = opts.resolutionRange ?? [0.0005, 1]
  const steps = opts.searchSteps ?? 30
  const comps = components(graph, nodes)
  const core = comps[0] ?? []
  if (core.length < minCore) return null
  const { graph: raw } = subgraph(graph, core)
  const g = reweight(raw, opts.weight ?? Math.log1p)
  const n = core.length

  const runs: number[][] = []
  for (let seed = 0; seed < (opts.runs ?? 8); seed++) {
    let lo = lo0
    let hi = hi0
    let best: number[] | null = null
    for (let i = 0; i < steps; i++) {
      const r = Math.sqrt(lo * hi)
      const { membership } = leiden(g, { resolution: r, seed })
      const sizes = countSizes(membership)
      const ok = sizes.length >= 2 && (sizes[1] as number) >= minShare * n
      if (ok) { best = membership; hi = r } else lo = r
      if (ok && sizes.length === 2) break
    }
    // Communities come numbered by size, so 0 and 1 are the two largest.
    if (best) runs.push(best.map((c) => (c === 0 ? 0 : c === 1 ? 1 : -1)))
  }
  if (!runs.length) return null

  const ref = runs[0] as number[]
  const aligned: number[][] = []
  const agree: number[] = []
  for (const p of runs) {
    let same = 0
    let both = 0
    for (let i = 0; i < n; i++) if (p[i]! >= 0 && ref[i]! >= 0) { both++; if (p[i] === ref[i]) same++ }
    const a = both ? same / both : 1
    agree.push(Math.max(a, 1 - a))
    aligned.push(a >= 0.5 ? p : p.map((x) => (x < 0 ? x : 1 - x)))
  }
  const label = core.map((_, i) => {
    let zero = 0
    let one = 0
    for (const p of aligned) { if (p[i] === 0) zero++; else if (p[i] === 1) one++ }
    return zero > one ? 0 : one > zero ? 1 : -1
  })
  let a = core.filter((_, i) => label[i] === 0)
  let b = core.filter((_, i) => label[i] === 1)
  const unsettled = core.filter((_, i) => label[i] === -1)
  const parts = label.map((x) => (x < 0 ? 2 : x))
  const modularity = quality(raw, parts, 1)
  const sum = (xs: number[]) => xs.reduce((s, v) => s + cmOf(v), 0)
  if (sum(b) > sum(a)) [a, b] = [b, a]
  const inCore = new Set(core)
  return { a, b, unsettled, outside: nodes.filter((v) => !inCore.has(v)), modularity, agreement: agree.reduce((s, x) => s + x, 0) / agree.length }
}

function countSizes(memb: readonly number[]): number[] {
  const sizes: number[] = []
  for (const c of memb) sizes[c] = (sizes[c] ?? 0) + 1
  return sizes.sort((x, y) => y - x)
}

export type SplitStep = {
  path: string
  /** Matches that went into this split. */
  size: number
  outcome: 'split' | 'too-small' | 'not-reliable'
  modularity?: number
  agreement?: number
  sizes?: [number, number]
  unsettled?: number
  outside?: number
}

export type NestedSplit = {
  /**
   * Per match on the paternal or maternal side: its path, such as "P.1.2" (paternal side, heavier half, then
   * lighter half). A path ending in ".?" means not connected to the part that was split; ".single" means a
   * single-segment match that links mostly to other single-segment matches. A match the runs couldn't settle keeps
   * the path of the level above.
   */
  path: Map<string, string>
  steps: SplitStep[]
}

/**
 * Nested two-way splits of each side, as labelled by the service. Unassigned matches take no part.
 * Matches with too few segments are attached afterwards by majority of their links to placed matches on the same
 * side; a tie, or no links, leaves them "?".
 */
export function nestedSplit(mg: MatchGraph, opts: SplitOptions = {}): NestedSplit {
  const maxDepth = opts.maxDepth ?? 2
  const minSegments = opts.minSegments ?? 2
  const minModularity = opts.minModularity ?? 0.1
  const minAgreement = opts.minAgreement ?? 0.85
  const { graph } = mg
  const obs = (v: number) => mg.observations.get(graph.ids[v] as string)!
  const cmOf = (v: number) => obs(v).sharedCm
  const assign = new Map<number, string>()
  const steps: SplitStep[] = []

  const recurse = (sub: number[], path: string, depth: number) => {
    for (const v of sub) assign.set(v, path)
    if (depth > maxDepth) return
    const r = twoWaySplit(graph, sub, cmOf, opts)
    if (!r) { steps.push({ path, size: sub.length, outcome: 'too-small' }); return }
    const step: SplitStep = {
      path, size: sub.length, outcome: 'split', modularity: r.modularity, agreement: r.agreement,
      sizes: [r.a.length, r.b.length], unsettled: r.unsettled.length, outside: r.outside.length,
    }
    if (r.modularity < minModularity || r.agreement < minAgreement) { steps.push({ ...step, outcome: 'not-reliable' }); return }
    steps.push(step)
    for (const v of r.outside) assign.set(v, `${path}.?`)
    recurse(r.a, `${path}.1`, depth + 1)
    recurse(r.b, `${path}.2`, depth + 1)
  }

  for (const [side, label] of [['paternal', 'P'], ['maternal', 'M']] as const) {
    const sub = graph.ids.map((_, i) => i).filter((v) => obs(v).side === side)
    const multi = sub.filter((v) => obs(v).segments >= minSegments)
    const single = new Set(sub.filter((v) => obs(v).segments < minSegments))
    recurse(multi, label, 1)
    const multiSet = new Set(multi)
    const attached = new Map<number, string>()
    for (const v of single) {
      const near: string[] = []
      let singles = 0
      for (const u of graph.nbr[v] as number[]) {
        if (multiSet.has(u)) near.push(assign.get(u) as string)
        else if (single.has(u)) singles++
      }
      if (near.length && near.length >= singles) attached.set(v, majority(near) ?? `${label}.?`)
      else if (singles) attached.set(v, `${label}.single`)
      else attached.set(v, `${label}.?`)
    }
    for (const [v, p] of attached) assign.set(v, p)
  }
  const path = new Map<string, string>()
  for (const [v, p] of [...assign.entries()].sort((x, y) => x[0] - y[0])) path.set(graph.ids[v] as string, p)
  return { path, steps }
}

/** The most common value, or null on a tie for first. */
function majority(xs: readonly string[]): string | null {
  const count = new Map<string, number>()
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1)
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return null
  return ranked[0]![0]
}
