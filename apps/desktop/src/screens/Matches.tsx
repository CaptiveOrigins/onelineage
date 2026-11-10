import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { KitSummary, MatchRow } from '../../host/protocol'
import { call } from '../api'
import { cmInput, DEFAULT_SORT, filterMatches, nextSort, NO_FILTER, SIDE_WORDS, sortMatches, type MatchFilter, type Sort, type SortKey, type TreeFilter } from '../matches'
import { ErrorBox, Icon, useNames } from '../ui'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'cm', label: 'Shared cM', numeric: true },
  { key: 'segments', label: 'Segments', numeric: true },
  { key: 'side', label: 'Side' },
  { key: 'treeStatus', label: 'Tree status' },
  { key: 'date', label: 'Match date' },
]

export function MatchesScreen({ kits }: { kits: KitSummary[] }) {
  const { show } = useNames()
  const [kit, setKit] = useState(kits[0]?.kit ?? '')
  const [rows, setRows] = useState<MatchRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MatchFilter>(NO_FILTER)
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const ids = { kit: useId(), text: useId(), side: useId(), tree: useId(), min: useId(), max: useId() }

  useEffect(() => {
    if (!kit) return
    setRows(null)
    call('matches', { kit }).then(setRows, (e: Error) => setError(e.message))
  }, [kit])

  const shown = useMemo(() => (rows ? sortMatches(filterMatches(rows, filter, show), sort, show) : []), [rows, filter, sort, show])
  const filtered = rows !== null && shown.length !== rows.length

  return (
    <>
      <form className="ol-field-row" role="search" aria-label="Filter matches" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={ids.kit}>
          Kit
          <select id={ids.kit} value={kit} onChange={(e) => setKit(e.target.value)}>
            {kits.map((k) => (
              <option key={k.kit} value={k.kit}>
                {show(k.name)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.text}>
          Name contains
          <input id={ids.text} type="search" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} autoComplete="off" spellCheck={false} />
        </label>
        <label htmlFor={ids.side}>
          Side
          <select id={ids.side} value={filter.side} onChange={(e) => setFilter({ ...filter, side: e.target.value as MatchFilter['side'] })}>
            <option value="all">Any side</option>
            {Object.entries(SIDE_WORDS).map(([v, w]) => (
              <option key={v} value={v}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.tree}>
          Tree
          <select id={ids.tree} value={filter.tree} onChange={(e) => setFilter({ ...filter, tree: e.target.value as TreeFilter })}>
            <option value="all">Any</option>
            <option value="public">Public tree</option>
            <option value="any-tree">Has a tree</option>
            <option value="no-tree">No tree</option>
          </select>
        </label>
        <label htmlFor={ids.min}>
          From cM
          <input id={ids.min} inputMode="decimal" className="ol-narrow" value={minText} onChange={(e) => (setMinText(e.target.value), setFilter({ ...filter, minCm: cmInput(e.target.value) }))} />
        </label>
        <label htmlFor={ids.max}>
          To cM
          <input id={ids.max} inputMode="decimal" className="ol-narrow" value={maxText} onChange={(e) => (setMaxText(e.target.value), setFilter({ ...filter, maxCm: cmInput(e.target.value) }))} />
        </label>
        {filtered && (
          <button type="button" onClick={() => (setFilter(NO_FILTER), setMinText(''), setMaxText(''))}>
            Clear filters
          </button>
        )}
      </form>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {rows === null && !error && <p aria-live="polite">Reading matches…</p>}
      {rows !== null && (
        <>
          <p className="ol-hint" aria-live="polite">
            Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()} matches.
          </p>
          {/* Focusable so the table can be scrolled with the keyboard. */}
          <div className="ol-table-wrap" tabIndex={0} role="region" aria-label="Matches table, scrollable">
            <table>
              <caption>Matches of {show(kits.find((k) => k.kit === kit)?.name ?? '')}. Select a column heading to sort.</caption>
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key
                    return (
                      <th key={c.key} scope="col" className={c.numeric ? 'ol-num' : undefined} aria-sort={active ? sort.dir : 'none'}>
                        <button type="button" onClick={() => setSort(nextSort(sort, c.key))}>
                          {c.label}
                          <Icon of={active ? (sort.dir === 'ascending' ? ArrowUp : ArrowDown) : ArrowUpDown} size={14} />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.match}>
                    <th scope="row" style={{ fontWeight: 400, position: 'static', background: 'none' }}>
                      {show(r.name)}
                    </th>
                    <td className="ol-num">{r.cm.toLocaleString()}</td>
                    <td className="ol-num">{r.segments}</td>
                    <td>{SIDE_WORDS[r.side]}</td>
                    <td>{r.treeStatus || 'not given'}</td>
                    <td>{r.date ?? 'not given'}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length}>No matches fit these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
