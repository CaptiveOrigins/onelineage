/**
 * The whole grouping run for one kit: network, consensus groups and side splits, with a stamp of what went in
 * and which settings and seeds were used (S3, S12). It reads only DNA figures: no trees, names or notes.
 */
import type { MatchObservation, SharedMatchLink } from '@captiveorigins/onelineage-core'
import { consensusClusters, type ConsensusOptions } from './consensus.js'
import { buildMatchGraph, cmp, type Exclusion, type GraphOptions } from './graph.js'
import { nestedSplit, type SplitOptions, type SplitStep } from './split.js'

export const ENGINE = { name: '@captiveorigins/onelineage-analysis', version: '0.1.0' } as const

export type ClusterOptions = { graph?: GraphOptions; consensus?: ConsensusOptions; split?: SplitOptions }

export type GroupedMatch = {
  match: string
  /** A neutral ID such as "G3", numbered by group size. Groups get names only after unblinding (ADR 0002). */
  group: string
  stability: number
  /** Side-split path such as "M.1.2", or null for a match on neither side. */
  path: string | null
}

export type ClusterRun = {
  engine: typeof ENGINE
  kit: string
  /** SHA-256 of every file the records came from, sorted. */
  inputs: string[]
  settings: { graph: Required<GraphOptions>; consensus: { resolutions: number[]; seeds: number[]; threshold: number; runs: number } }
  matches: GroupedMatch[]
  excluded: Exclusion[]
  splits: SplitStep[]
}

export function clusterKit(observations: readonly MatchObservation[], links: readonly SharedMatchLink[], opts: ClusterOptions = {}): ClusterRun {
  const graphOpts = { minCm: opts.graph?.minCm ?? 20, maxCm: opts.graph?.maxCm ?? 400 }
  const mg = buildMatchGraph(observations, links, graphOpts)
  const consensus = consensusClusters(mg.graph, opts.consensus)
  const split = nestedSplit(mg, opts.split)
  const width = String(Math.max(1, ...consensus.group.map((g) => g + 1))).length
  const matches = mg.graph.ids.map((m, v) => ({
    match: m,
    group: `G${String((consensus.group[v] as number) + 1).padStart(width, '0')}`,
    stability: round(consensus.stability[v] as number),
    path: split.path.get(m) ?? null,
  }))
  const inputs = [...new Set([...observations, ...links].map((r) => r.provenance.sha256))].sort(cmp)
  return {
    engine: ENGINE,
    kit: mg.kit,
    inputs,
    settings: { graph: graphOpts, consensus: { ...consensus.settings, runs: consensus.runs } },
    matches,
    excluded: mg.excluded,
    splits: split.steps,
  }
}

const round = (x: number) => Math.round(x * 1e6) / 1e6
