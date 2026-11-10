import { Eye, EyeOff } from 'lucide-react'
import type { KitsResult } from '../../host/protocol'
import { Facts, Icon, useNames } from '../ui'

const RAW_NAMES: Record<string, string> = { ancestry: 'AncestryDNA layout', '23andme': '23andMe layout', myheritage: 'MyHeritage layout', ftdna: 'FamilyTreeDNA layout', livingdna: 'Living DNA layout' }

export function KitsScreen({ data }: { data: KitsResult }) {
  const { show } = useNames()
  const nameOf = (kit: string) => show(data.kits.find((k) => k.kit === kit)?.name ?? kit)
  return (
    <>
      <p>
        The family kits in this library: tests taken by the family, with their match lists and raw DNA. {data.kits.length === 1 ? 'There is 1 kit.' : `There are ${data.kits.length} kits.`}
      </p>
      <div className="ol-cards">
        {data.kits.map((k) => (
          <section key={k.kit} className="ol-card" aria-labelledby={`kit-${k.kit}`}>
            <h2 id={`kit-${k.kit}`} style={{ marginTop: 0 }}>
              {show(k.name)}
            </h2>
            <Facts
              items={[
                ['Source', k.service],
                ['Test ID', <code key="id">{k.kit}</code>],
                ['Exported', k.exportDate],
                ['Matches', k.matches.toLocaleString()],
                ['Shared-match files', k.sharedMatchFiles.toLocaleString()],
                [
                  'Family tree',
                  k.blind ? (
                    <span key="b">
                      <Icon of={EyeOff} size={14} /> Blind: {k.sealedFiles} tree file{k.sealedFiles === 1 ? '' : 's'} sealed, unread
                    </span>
                  ) : (
                    <span key="u">
                      <Icon of={Eye} size={14} /> Unblinded (recorded in the decisions log)
                    </span>
                  ),
                ],
              ]}
            />
            <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Raw DNA</h3>
            {k.raw ? (
              <Facts
                items={[
                  ['Layout', RAW_NAMES[k.raw.service] ?? k.raw.service],
                  ['Chip', k.raw.chip ?? 'not stated in the file'],
                  ['Genome build', k.raw.build ?? 'not stated in the file'],
                  ['File made', k.raw.generated ?? 'not stated in the file'],
                  ['Markers', `${k.raw.markers.toLocaleString()} (${k.raw.noCalls.toLocaleString()} no-calls)`],
                ]}
              />
            ) : (
              <p className="ol-hint">No raw DNA file for this kit.</p>
            )}
          </section>
        ))}
      </div>
      {data.comparisons.length > 0 && (
        <section className="ol-card">
          <h2 style={{ marginTop: 0 }}>Compared on this Mac</h2>
          <ul style={{ margin: 0 }}>
            {data.comparisons.map((c) => (
              <li key={`${c.a}-${c.b}`}>
                {nameOf(c.a)} and {nameOf(c.b)} share {c.totalCm.toLocaleString()} cM in {c.segments} segments (longest {c.longestCm} cM).
              </li>
            ))}
          </ul>
          <p className="ol-hint" style={{ marginTop: 8 }}>
            From their raw DNA, using an approximate map of 1 cM per million base pairs ({data.comparisons[0]!.map}). That’s good enough to see close
            relatives, not to measure small segments exactly.
          </p>
        </section>
      )}
    </>
  )
}
