import { useEffect, useId, useState } from 'react'
import type { GedmatchStatus } from '../../host/protocol'
import { call } from '../api'
import { useNames } from '../ui'

const SETTINGS = [
  ['opt-out', 'Opt-out: genealogy matching, but not law-enforcement searches'],
  ['research', 'Research: you see your matches; others can’t see this kit'],
  ['private', 'Private: no one matches this kit'],
  ['opt-in', 'Opt-in: law-enforcement searches can match this kit'],
] as const

/**
 * The GEDmatch checklist. OneLineage never uploads anything. You upload on GEDmatch’s own page, then
 * record the kit number and its privacy setting here.
 */
export function GedmatchScreen() {
  const { show } = useNames()
  const [status, setStatus] = useState<GedmatchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ kit: '', gedmatchId: '', setting: 'opt-out' as (typeof SETTINGS)[number][0], minor: false, confirmMinor: false })
  const id = useId()
  useEffect(() => void call('gedmatchStatus').then(setStatus, (e: Error) => setError(e.message)), [])
  if (!status) return error ? <p role="alert">{error}</p> : <p>Reading…</p>
  const save = () => {
    setError(null)
    call('recordGedmatchKit', form).then((s) => { setStatus(s); setForm({ ...form, gedmatchId: '', confirmMinor: false }) }, (e: Error) => setError(e.message))
  }
  return (
    <>
      <p>GEDmatch takes raw DNA from every testing company, so it can find relatives who tested elsewhere. OneLineage never uploads: you do it on GEDmatch’s own site, and record the result here.</p>
      <h2>Your family kits</h2>
      <table className="ol-table">
        <thead><tr><th scope="col">Kit</th><th scope="col">On GEDmatch</th><th scope="col">Setting</th><th scope="col">Notes</th></tr></thead>
        <tbody>
          {status.kits.map((k) => (
            <tr key={k.kit}>
              <td>{show(k.name)}</td>
              <td>{k.gedmatchId ?? (k.recommended ? 'Not yet (recommended: it has raw DNA)' : k.hasRaw ? 'Not yet' : 'No raw DNA in the library')}</td>
              <td>{k.setting ?? '—'}{k.minor ? ' (minor)' : ''}</td>
              <td>{k.warnings.join(' ') || (k.recordedAt ? `Recorded ${k.recordedAt.slice(0, 10)}` : '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>How to add a kit</h2>
      <ol>
        <li>Download the raw DNA from the testing company’s own site (its “download your data” page).</li>
        <li>Sign in to GEDmatch yourself, choose its upload page, and pick the file. Upload only your own DNA, or DNA you’re authorised to upload.</li>
        <li>Choose the privacy setting on GEDmatch. For a child’s kit, a parent or guardian decides; Private is recommended.</li>
        <li>Come back here and record the kit number and the setting.</li>
      </ol>
      <h2>Record a GEDmatch kit</h2>
      {error && <p role="alert">{error}</p>}
      <div className="ol-row" style={{ gap: 12 }}>
        <label htmlFor={`${id}-k`}>Family kit{' '}
          <select id={`${id}-k`} value={form.kit} onChange={(e) => setForm({ ...form, kit: e.target.value })}>
            <option value="">Choose…</option>
            {status.kits.map((k) => <option key={k.kit} value={k.kit}>{show(k.name)}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-g`}>GEDmatch kit number{' '}
          <input id={`${id}-g`} value={form.gedmatchId} onChange={(e) => setForm({ ...form, gedmatchId: e.target.value })} spellCheck={false} />
        </label>
        <label htmlFor={`${id}-s`}>Setting{' '}
          <select id={`${id}-s`} value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value as typeof form.setting })}>
            {SETTINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-m`}><input id={`${id}-m`} type="checkbox" checked={form.minor} onChange={(e) => setForm({ ...form, minor: e.target.checked })} /> This person is under 18</label>
        {form.minor && (
          <label htmlFor={`${id}-c`}><input id={`${id}-c`} type="checkbox" checked={form.confirmMinor} onChange={(e) => setForm({ ...form, confirmMinor: e.target.checked })} /> A parent or guardian chose to upload this kit</label>
        )}
        <button type="button" className="ol-primary" disabled={!form.kit || !form.gedmatchId} onClick={save}>Record</button>
      </div>
    </>
  )
}
