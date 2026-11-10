/** Filtering and sorting for the matches table. Pure, so the table's behaviour is tested apart from the screen. */
import type { MatchSide } from '@captiveorigins/onelineage-core'
import type { MatchRow } from '../host/protocol'

export type TreeFilter = 'all' | 'public' | 'any-tree' | 'no-tree'
export type MatchFilter = {
  /** Matched against the name as shown (the stand-in while privacy is on), ignoring case. */
  text: string
  side: MatchSide | 'all'
  tree: TreeFilter
  minCm: number | null
  maxCm: number | null
}
export const NO_FILTER: MatchFilter = { text: '', side: 'all', tree: 'all', minCm: null, maxCm: null }

export type SortKey = 'name' | 'cm' | 'segments' | 'side' | 'treeStatus' | 'date'
export type SortDir = 'ascending' | 'descending'
export type Sort = { key: SortKey; dir: SortDir }
export const DEFAULT_SORT: Sort = { key: 'cm', dir: 'descending' }

export const SIDE_WORDS: Record<MatchSide, string> = { paternal: 'Paternal', maternal: 'Maternal', both: 'Both sides', unassigned: 'Unassigned' }

const hasTree = (s: string) => /tree/i.test(s) && !/^no trees?$/i.test(s.trim())

export function filterMatches(rows: readonly MatchRow[], f: MatchFilter, shownName: (name: string) => string = (n) => n): MatchRow[] {
  const text = f.text.trim().toLowerCase()
  return rows.filter((r) => {
    if (text && !shownName(r.name).toLowerCase().includes(text)) return false
    if (f.side !== 'all' && r.side !== f.side) return false
    if (f.minCm !== null && r.cm < f.minCm) return false
    if (f.maxCm !== null && r.cm > f.maxCm) return false
    if (f.tree === 'public' && !/^public/i.test(r.treeStatus)) return false
    if (f.tree === 'any-tree' && !hasTree(r.treeStatus)) return false
    if (f.tree === 'no-tree' && hasTree(r.treeStatus)) return false
    return true
  })
}

/** Sorted copy. Missing dates go last in either direction; ties keep the larger match first, then the ID. */
export function sortMatches(rows: readonly MatchRow[], sort: Sort, shownName: (name: string) => string = (n) => n): MatchRow[] {
  const sign = sort.dir === 'ascending' ? 1 : -1
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  return [...rows].sort((a, b) => {
    let c = 0
    switch (sort.key) {
      case 'name': c = text(shownName(a.name), shownName(b.name)); break
      case 'cm': c = a.cm - b.cm; break
      case 'segments': c = a.segments - b.segments; break
      case 'side': c = text(SIDE_WORDS[a.side], SIDE_WORDS[b.side]); break
      case 'treeStatus': c = text(a.treeStatus, b.treeStatus); break
      case 'date':
        if (a.date === null || b.date === null) {
          if (a.date !== b.date) return a.date === null ? 1 : -1
        } else c = a.date.localeCompare(b.date)
        break
    }
    return c * sign || b.cm - a.cm || a.match.localeCompare(b.match)
  })
}

/** Clicking a header: the same column flips direction; a new one starts where people expect (big numbers, A–Z, newest first). */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === 'ascending' ? 'descending' : 'ascending' }
  return { key, dir: key === 'name' || key === 'side' || key === 'treeStatus' ? 'ascending' : 'descending' }
}

/** A number from a filter box, or null when it's empty or not a number. */
export function cmInput(value: string): number | null {
  const t = value.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}
