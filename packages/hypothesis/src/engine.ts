/**
 * Hypothesis engine (OneFamily plan section 7). Each hypothesis is a complete small family tree: who is
 * whose biological parent. To score one, the engine simulates inheritance through that exact tree many
 * times and asks how often each observed amount of shared DNA comes up. It's the idea behind What Are The
 * Odds?, using simulation rather than a fixed table, so half and full relationships, double cousins and
 * marriages within a family are handled by the tree itself.
 *
 * Stated limits:
 * - Pairs are treated as independent given the tree. Shared ancestors make them correlated, so odds can
 *   be overconfident, especially with many observations in one family. Read them as strong or weak evidence.
 * - The simulator has no crossover interference, and no service-style weighting such as Timber.
 * - People outside the tree are assumed unrelated.
 */
import { child, founderGenome, type Genome, Rng, shared } from '@extantape/onefamily-simulate'

export type TreePerson = { id: string; father?: string | null; mother?: string | null }
export type Hypothesis = { name: string; people: readonly TreePerson[]; /** Relative prior weight; default 1. */ prior?: number }
/** An observed match: shared cM between two people in the tree. Use 0 for "tested, but not a match". */
export type Observation = { a: string; b: string; cm: number }

export type ScoreOptions = {
  samples?: number
  seed?: number
  /** Below this, a pair counts as "not a match", as services report it. */
  matchThresholdCm?: number
}

export type Scored = { name: string; logLikelihood: number; posterior: number; perObservation: { a: string; b: string; cm: number; logLikelihood: number; simulatedMedianCm: number }[] }

/** Simulate one full replicate of the tree, founders first. */
function simulateTree(people: readonly TreePerson[], rng: Rng): Map<string, Genome> {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out = new Map<string, Genome>()
  const visiting = new Set<string>()
  const genomeOf = (id: string): Genome => {
    const done = out.get(id)
    if (done) return done
    const p = byId.get(id)
    if (!p) throw new Error(`${id} is named as a parent but isn't in the tree`)
    if (visiting.has(id)) throw new Error(`${id} is their own ancestor`)
    visiting.add(id)
    let g: Genome
    if (p.father && p.mother) g = child(genomeOf(p.father), genomeOf(p.mother), rng)
    else if (!p.father && !p.mother) g = founderGenome(`${id}#${rng.next()}`)
    else {
      // One recorded parent: the other is an unknown founder, so unrelated to everyone else in the tree.
      const known = genomeOf((p.father ?? p.mother) as string)
      const unknown = founderGenome(`${id}#other#${rng.next()}`)
      g = p.father ? child(known, unknown, rng) : child(unknown, known, rng)
    }
    visiting.delete(id)
    out.set(id, g)
    return g
  }
  for (const p of people) genomeOf(p.id)
  return out
}

/** Log-likelihood of one observed value given simulated values: a point mass for "not a match", a smoothed density above. */
function logLik(observed: number, sims: readonly number[], threshold: number): number {
  const n = sims.length
  const zeros = sims.filter((s) => s < threshold).length
  if (observed < threshold) return Math.log((zeros + 1) / (n + 2))
  let density = 0
  for (const s of sims) {
    if (s < threshold) continue
    const sd = Math.max(5, 0.1 * s)
    density += Math.exp(-0.5 * ((observed - s) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))
  }
  // Floor: a small uniform density over the possible range, so an unseen value is unlikely but not impossible.
  return Math.log((density + 1 / 3600) / (n + 2))
}

export function scoreHypotheses(hypotheses: readonly Hypothesis[], observations: readonly Observation[], opts: ScoreOptions = {}): Scored[] {
  const samples = opts.samples ?? 400
  const threshold = opts.matchThresholdCm ?? 8
  if (hypotheses.length === 0) throw new Error('no hypotheses to score')
  const names = new Set<string>()
  for (const h of hypotheses) {
    if (names.has(h.name)) throw new Error(`two hypotheses are named "${h.name}"`)
    names.add(h.name)
    const ids = new Set(h.people.map((p) => p.id))
    for (const o of observations) for (const x of [o.a, o.b]) if (!ids.has(x)) throw new Error(`hypothesis "${h.name}" has no ${x}`)
  }
  const scored = hypotheses.map((h, hi) => {
    const rng = new Rng((opts.seed ?? 1) * 1009 + hi)
    const sims: number[][] = observations.map(() => [])
    for (let r = 0; r < samples; r++) {
      const genomes = simulateTree(h.people, rng)
      observations.forEach((o, i) => {
        const cm = shared(genomes.get(o.a) as Genome, genomes.get(o.b) as Genome).totalCm
        sims[i]!.push(cm < threshold ? 0 : cm)
      })
    }
    const perObservation = observations.map((o, i) => {
      const s = [...sims[i]!].sort((x, y) => x - y)
      return { a: o.a, b: o.b, cm: o.cm, logLikelihood: logLik(o.cm, s, threshold), simulatedMedianCm: s[Math.floor(s.length / 2)] ?? 0 }
    })
    const logLikelihood = perObservation.reduce((t, x) => t + x.logLikelihood, 0) + Math.log(h.prior ?? 1)
    return { name: h.name, logLikelihood, posterior: 0, perObservation }
  })
  const max = Math.max(...scored.map((s) => s.logLikelihood))
  const total = scored.reduce((t, s) => t + Math.exp(s.logLikelihood - max), 0)
  for (const s of scored) s.posterior = Math.exp(s.logLikelihood - max) / total
  return scored.sort((a, b) => b.posterior - a.posterior)
}

/** Odds as a person would say them: "94%", or "over 99.9%". */
export function formatOdds(p: number): string {
  if (p > 0.999) return 'over 99.9%'
  if (p < 0.001) return 'under 0.1%'
  return `${Math.round(p * 1000) / 10}%`
}
