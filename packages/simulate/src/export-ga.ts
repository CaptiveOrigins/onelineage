/**
 * Export a planted family from one family kit's point of view, in the CSV shapes Genealogy Assistant
 * produces for Ancestry data: the match list, one shared-matches file per match of 20 cM or more, and
 * match trees. Every name, ID and number here is made up.
 */
import type { Genome } from './genome.js'
import { shared } from './ibd.js'
import type { Family, Person } from './scenario.js'
import { Rng } from './rng.js'

export const MATCH_LIST_COLUMNS = [
  'Match Name', 'Shared cM', 'Unweighted cM', 'Longest Segment cM', 'Avg Segment cM', 'Shared Segments', 'Shared Percentage',
  'Estimated Relationship', 'Match Side', 'Family Tree', 'Tree Size', 'Common Ancestor', 'Notes', 'Groups', 'Connected To Tree',
  'URL', 'GUID', 'Match Date', 'Possible Relationships', 'Meiosis', 'Managed By', 'Gender', 'Starred', 'Hidden',
] as const

export const SHARED_MATCH_COLUMNS = [
  'Match Name', 'Shared cM', 'Unweighted cM', 'Longest Segment cM', 'Avg Segment cM', 'Shared Segments', 'Estimated Relationship',
  'Match Side', 'Tree Status', 'Tree Size', 'Common Ancestor', 'Notes', 'Groups', 'Connected To Tree', 'URL', 'GUID', 'Also Matches',
  'GUID of Match', 'Shared cM with Match', 'Unweighted cM with Match', 'Longest Segment cM with Match', 'Avg Segment cM with Match',
  'Shared Segments with Match', 'Estimated Relationship to Match', 'Match Date', 'Possible Relationships',
  'Possible Relationships to Match', 'Meiosis', 'Managed By', 'Gender', 'Starred', 'Hidden',
] as const

export const MATCH_TREE_COLUMNS = [
  'Match Name', 'Match GUID', 'Match URL', 'Tree Name', 'Tree ID', 'Ahnentafel', 'Given Name', 'Surname', 'Gender', 'Living',
  'Birth Date', 'Birth Place', 'Death Date', 'Death Place', 'Person ID', 'Father Person ID', 'Mother Person ID', 'Generation',
] as const

/** Services report matches at 8 cM total and up, from segments of about 7 cM and up. */
export const MIN_MATCH_CM = 8
/** Shared-match lists include only people who share 20 cM or more with both. */
export const SHARED_MATCH_MIN_CM = 20

type Pair = { cm: number; segments: number; longest: number }

function csv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

export function estimatedRelationship(cm: number): string {
  if (cm >= 3300) return 'Parent/Child'
  if (cm >= 2200) return 'Close Family'
  if (cm >= 1300) return 'Close Family or 1st cousin'
  if (cm >= 650) return '1st cousin'
  if (cm >= 200) return '2nd cousin'
  if (cm >= 90) return '3rd cousin'
  if (cm >= 20) return '4th cousin'
  return '5th-8th cousin'
}
export function estimatedMeiosis(cm: number): number {
  return cm >= 3300 ? 1 : Math.max(2, Math.round(2 + Math.log2(3466 / cm)))
}
const round1 = (x: number) => Math.round(x * 10) / 10

export type KitExport = {
  /** File name → CSV text, laid out as Genealogy Assistant writes them. */
  files: Record<string, string>
  /** Per match GUID: the truth about how it was produced, for tests. */
  matches: { guid: string; person: string; cm: number; noise: boolean }[]
}

export function exportKit(family: Family, kitId: string, seed = family.seed): KitExport {
  const rng = new Rng(seed * 7919 + kitId.length)
  const byId = new Map(family.persons.map((p) => [p.id, p]))
  const kit = byId.get(kitId)
  if (!kit?.guid) throw new Error(`${kitId} is not a tested family kit`)
  const g = (id: string) => family.genomes.get(id) as Genome
  const kitG = g(kit.id)

  const pairCache = new Map<string, Pair>()
  const pair = (a: string, b: string): Pair => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    let v = pairCache.get(key)
    if (!v) {
      const s = shared(g(a), g(b))
      v = { cm: Math.round(s.totalCm), segments: s.segments.length, longest: Math.round(s.longestCm) }
      const noise = family.noise.find((x) => (x.kit === a && x.person === b) || (x.kit === b && x.person === a))
      if (noise) v = { cm: v.cm + Math.round(noise.cm), segments: v.segments + 1, longest: Math.max(v.longest, Math.round(noise.cm)) }
      pairCache.set(key, v)
    }
    return v
  }

  const side = (p: Person, cm: number): string => {
    if (p.noise) return rng.pick(['Paternal side', 'Maternal side', 'Unassigned'])
    const pat = shared([kitG[0], kitG[0]], g(p.id)).totalCm
    const mat = shared([kitG[1], kitG[1]], g(p.id)).totalCm
    if (cm < 20 && rng.chance(0.2)) return 'Unassigned'
    if (pat > 0 && mat > 0) return 'Both sides'
    return pat >= mat ? 'Paternal side' : 'Maternal side'
  }

  const url = (guid: string) => `https://www.ancestry.com/dna/matches/${kit.guid}/compare/${guid}`
  const matches: KitExport['matches'] = []
  const listRows: (string | number)[][] = [[...MATCH_LIST_COLUMNS]]
  const info = new Map<string, { p: Person; pr: Pair; side: string; treeSize: number }>()

  const testers = family.persons.filter((p) => p.tested && p.id !== kit.id)
  for (const p of testers) {
    const pr = pair(kit.id, p.id)
    if (pr.cm < MIN_MATCH_CM) continue
    const s = side(p, pr.cm)
    const treeSize = p.tree === 'No trees' ? 0 : rng.int(8, 900)
    info.set(p.guid as string, { p, pr, side: s, treeSize })
    matches.push({ guid: p.guid as string, person: p.id, cm: pr.cm, noise: p.noise })
  }
  const ordered = [...info.values()].sort((a, b) => b.pr.cm - a.pr.cm)
  for (const { p, pr, side: s, treeSize } of ordered) {
    listRows.push([
      p.displayName, pr.cm, pr.cm, pr.longest, round1(pr.cm / Math.max(1, pr.segments)), pr.segments, round1(pr.cm / 68.86),
      estimatedRelationship(pr.cm), s, p.tree, treeSize, '', '', '', '', url(p.guid as string), p.guid as string, p.matchDate,
      estimatedRelationship(pr.cm), estimatedMeiosis(pr.cm), '', p.sex === 'M' ? 'Male' : 'Female', '', '',
    ])
  }
  const files: Record<string, string> = {}
  files[`${kit.displayName} - DNA Matches - Test ${kit.guid}.csv`] = csv(listRows)

  // Shared matches: for each match of 20 cM or more, everyone else who shares 20 cM or more with both.
  const big = ordered.filter((x) => x.pr.cm >= SHARED_MATCH_MIN_CM)
  for (const m of big) {
    const rows: (string | number)[][] = [[...SHARED_MATCH_COLUMNS]]
    for (const s of big) {
      if (s === m) continue
      const ms = pair(m.p.id, s.p.id)
      if (ms.cm < SHARED_MATCH_MIN_CM) continue
      rows.push([
        s.p.displayName, s.pr.cm, s.pr.cm, s.pr.longest, round1(s.pr.cm / Math.max(1, s.pr.segments)), s.pr.segments,
        estimatedRelationship(s.pr.cm), s.side, s.p.tree, s.treeSize, '', '', '', '', url(s.p.guid as string), s.p.guid as string, '',
        m.p.guid as string, ms.cm, ms.cm, ms.longest, round1(ms.cm / Math.max(1, ms.segments)), ms.segments, estimatedRelationship(ms.cm),
        s.p.matchDate, estimatedRelationship(s.pr.cm), estimatedRelationship(ms.cm), estimatedMeiosis(s.pr.cm), '',
        s.p.sex === 'M' ? 'Male' : 'Female', '', '',
      ])
    }
    files[`Shared Matches/Shared Matches - ${kit.displayName} and ${m.p.displayName} - Test ${kit.guid} - Match ${m.p.guid}.csv`] = csv(rows)
  }

  // Match trees: the recorded (not biological) ancestry of each match with a tree, up to five generations.
  const treeRows: (string | number)[][] = [[...MATCH_TREE_COLUMNS]]
  let pid = 1000000
  let treeId = 50000000
  for (const { p } of ordered) {
    if (p.tree !== 'Public linked tree' && p.tree !== 'Unlinked tree') continue
    if (p.noise) continue
    treeId++
    const ids = new Map<string, number>()
    const walk = (personId: string | null, ahn: number) => {
      if (!personId || ahn >= 64) return
      const q = byId.get(personId)
      if (!q) return
      ids.set(personId, ++pid)
      walk(q.father, ahn * 2)
      walk(q.mother, ahn * 2 + 1)
      const living = q.deathYear === null && q.birthYear > 1925
      treeRows.push([
        '', p.guid as string, url(p.guid as string), `${p.surname} Family Tree`, treeId, ahn,
        living ? 'Living' : q.given, living ? '' : q.surname, q.sex, living ? 'Yes' : 'No',
        living ? '' : String(q.birthYear), living ? '' : q.place, q.deathYear ? String(q.deathYear) : '', '',
        ids.get(personId) as number, q.father ? (ids.get(q.father) ?? '') : '', q.mother ? (ids.get(q.mother) ?? '') : '',
        Math.floor(Math.log2(ahn)),
      ])
    }
    walk(p.id, 1)
  }
  files[`${kit.displayName} - Match Trees.csv`] = csv(treeRows)
  return { files, matches }
}
