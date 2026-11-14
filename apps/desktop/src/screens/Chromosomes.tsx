import { useEffect, useMemo, useState } from 'react'
import type { KitsResult, SegmentsResult } from '../../host/protocol'
import { call } from '../api'
import { useNames } from '../ui'

/**
 * The chromosome browser: two family kits compared on this Mac, drawn chromosome by chromosome.
 * The drawing has a text equivalent (the table below it), so nothing is only visual.
 */
export function ChromosomesScreen({ kits }: { kits: KitsResult['kits'] }) {
  const { show } = useNames()
  const withRaw = kits.filter((k) => k.raw)
  const [a, setA] = useState(withRaw[0]?.kit ?? '')
  const [b, setB] = useState(withRaw[1]?.kit ?? '')
  const [data, setData] = useState<SegmentsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setData(null)
    setError(null)
    if (a && b && a !== b) call('segments', { a, b }).then(setData, (e: Error) => setError(e.message))
  }, [a, b])
  const name = (kit: string) => show(kits.find((k) => k.kit === kit)?.name ?? kit)
  const longest = useMemo(() => Math.max(1, ...(data?.chromosomes.map((c) => c.endCm) ?? [1])), [data])

  if (withRaw.length < 2) return <p>The chromosome browser compares two kits’ raw DNA. This library has {withRaw.length === 1 ? 'one kit' : 'no kits'} with raw DNA.</p>

  const W = 640
  const rowH = 18
  return (
    <>
      <p>Two family kits compared on this Mac from their raw DNA. No website is involved. Shared stretches are shown in orange.</p>
      <div className="ol-row" style={{ gap: 16, flexWrap: 'wrap' }}>
        {[['First kit', a, setA], ['Second kit', b, setB]].map(([label, value, set]) => (
          <label key={label as string}>
            {label as string}{' '}
            <select value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>
              {withRaw.map((k) => (
                <option key={k.kit} value={k.kit}>
                  {show(k.name)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {a === b && <p role="status">Choose two different kits.</p>}
      {error && <p role="alert">{error}</p>}
      {!data && !error && a !== b && <p role="status">Comparing…</p>}
      {data && (
        <>
          <p role="status">
            {name(data.a)} and {name(data.b)} share <strong>{Math.round(data.totalCm).toLocaleString()} cM</strong> in{' '}
            {data.chromosomes.reduce((t, c) => t + c.segments.length, 0)} segments; longest {Math.round(data.longestCm)} cM. Map: {data.map}.
          </p>
          <svg
            viewBox={`0 0 ${W + 40} ${data.chromosomes.length * rowH + 10}`}
            width="100%"
            role="img"
            aria-label={`Chromosomes 1 to 22, with ${data.chromosomes.reduce((t, c) => t + c.segments.length, 0)} shared segments marked. The table below lists them.`}
          >
            {data.chromosomes.map((c, i) => {
              const y = i * rowH + 5
              const x = (cm: number) => 34 + (cm / longest) * W
              return (
                <g key={c.chromosome}>
                  <text x={0} y={y + 11} fontSize={11} fill="var(--of-muted)">
                    {c.chromosome}
                  </text>
                  <rect x={x(c.startCm)} y={y + 2} width={Math.max(1, x(c.endCm) - x(c.startCm))} height={10} rx={5} fill="var(--of-border)" />
                  {c.segments.map((s, j) => (
                    <rect key={j} x={x(s.startCm)} y={y + 2} width={Math.max(2, x(s.endCm) - x(s.startCm))} height={10} rx={3} fill="var(--of-accent)">
                      <title>{`Chromosome ${c.chromosome}: ${s.startCm.toFixed(1)}–${s.endCm.toFixed(1)} cM (${s.cm.toFixed(1)} cM, ${s.markers.toLocaleString()} markers)`}</title>
                    </rect>
                  ))}
                </g>
              )
            })}
          </svg>
          <table className="ol-table">
            <caption>Shared segments</caption>
            <thead>
              <tr>
                <th scope="col">Chromosome</th>
                <th scope="col">From (cM)</th>
                <th scope="col">To (cM)</th>
                <th scope="col">Length (cM)</th>
                <th scope="col">Markers</th>
              </tr>
            </thead>
            <tbody>
              {data.chromosomes.flatMap((c) =>
                c.segments.map((s, j) => (
                  <tr key={`${c.chromosome}-${j}`}>
                    <td>{c.chromosome}</td>
                    <td>{s.startCm.toFixed(1)}</td>
                    <td>{s.endCm.toFixed(1)}</td>
                    <td>{s.cm.toFixed(1)}</td>
                    <td>{s.markers.toLocaleString()}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
