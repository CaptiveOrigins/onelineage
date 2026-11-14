import { Puzzle } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ExtensionView, KitSummary } from '../../host/protocol'
import { call } from '../api'
import { ErrorBox, formatDate, Icon } from '../ui'

const MOCK_SITE = 'mocksite'
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const shortKit = (kit: string) => (kit.length > 12 ? `${kit.slice(0, 8)}…` : kit)

/**
 * A request started in the extension, waiting for the owner's answer. Modal, so it can't be missed, with the
 * three answers the owner chose: allow once, allow for this session, or deny.
 */
export function ExtensionRequestDialog({ view, onView }: { view: ExtensionView | null; onView: (v: ExtensionView) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const req = view?.pending[0] ?? null
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (req && !d.open) d.showModal()
    if (!req && d.open) d.close()
  }, [req])
  const answer = async (a: 'once' | 'session' | 'deny') => {
    if (!req) return
    try {
      onView(await call('extensionDecide', { request: req.id, answer: a }))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <dialog ref={ref} aria-labelledby="ext-req-h" onCancel={(e) => (e.preventDefault(), void answer('deny'))}>
      {req && (
        <div>
          <h1 id="ext-req-h">
            <Icon of={Puzzle} /> The Chrome extension is asking
          </h1>
          <p>{req.detail}</p>
          <p className="ol-hint">
            Kit {shortKit(req.kit)}. If nobody answers by {time(req.expiresAt)}, the answer is no.
            {view && view.pending.length > 1 && ` ${view.pending.length - 1} more waiting after this.`}
          </p>
          <ErrorBox error={error} />
          <div className="ol-row">
            <button type="button" className="ol-primary" onClick={() => void answer('once')}>
              Allow once
            </button>
            <button type="button" onClick={() => void answer('session')}>
              Allow for this session
            </button>
            <button type="button" onClick={() => void answer('deny')}>
              Deny
            </button>
          </div>
          <p className="ol-hint">A session covers this kit only, and ends when Chrome closes or after an hour, whichever is first.</p>
        </div>
      )}
    </dialog>
  )
}

/** Shown on every screen while a session or run grant is active, with "End now". */
export function ExtensionGrantBanner({ view, onView }: { view: ExtensionView | null; onView: (v: ExtensionView) => void }) {
  if (!view || view.grants.length === 0) return null
  return (
    <div className="ol-banner" role="status">
      {view.grants.map((g) => (
        <div key={g.id} className="ol-row">
          <Icon of={Puzzle} />
          <span>
            {g.kind === 'run' ? 'A run in Chrome is allowed' : 'The Chrome extension is allowed to ask'} for kit {shortKit(g.kit)} until {time(g.expiresAt)}.
          </span>
          <button type="button" onClick={async () => onView(await call('extensionEndGrant', { grant: g.id }))}>
            End now
          </button>
        </div>
      ))}
    </div>
  )
}

export function ExtensionScreen({ view, onView, kits }: { view: ExtensionView | null; onView: (v: ExtensionView) => void; kits: KitSummary[] }) {
  const [error, setError] = useState<string | null>(null)
  const [devId, setDevId] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [origin, setOrigin] = useState('http://127.0.0.1:8787')
  const [picked, setKit] = useState('')
  // Kits arrive after the screen opens; until one is picked, the first is chosen.
  const kit = picked || kits[0]?.kit || ''
  const ids = { dev: useId(), confirm: useId(), origin: useId(), kit: useId() }
  const run = async (f: () => Promise<ExtensionView>) => {
    try {
      onView(await f())
      setError(null)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }
  if (!view) return <p>Reading…</p>
  const running = view.run?.state === 'running'

  return (
    <>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      <section className="ol-card">
        <h2 style={{ marginTop: 0 }}>Connection</h2>
        <p role="status">
          {view.connected ? `Connected to the extension (${view.extensionId}).` : 'The extension isn’t connected. Open Chrome with the OneFamily extension turned on.'}
        </p>
        <p className="ol-hint">
          The extension stores nothing and reaches this app only through Chrome’s native messaging. It shows match details in its side panel, never in the website.
          Each request it starts waits for your OK here.
        </p>
      </section>

      <section className="ol-card">
        <h2 style={{ marginTop: 0 }}>Trusted extension builds</h2>
        <p className="ol-hint">
          {view.publishedId ? `The published extension (${view.publishedId}) is always trusted.` : 'The extension isn’t published yet, so only a developer build you trust here can connect.'}
        </p>
        {view.developerIds.length > 0 && (
          <ul>
            {view.developerIds.map((id) => (
              <li key={id} className="ol-row">
                <code>{id}</code>
                <button type="button" onClick={() => void run(() => call('untrustDeveloperExtension', { id }))} aria-label={`Stop trusting ${id}`}>
                  Stop trusting
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => call('trustDeveloperExtension', { id: devId.trim(), confirm }))) {
              setDevId('')
              setConfirm(false)
            }
          }}
        >
          <label htmlFor={ids.dev}>
            Developer build ID (from chrome://extensions)
            <input id={ids.dev} value={devId} onChange={(e) => setDevId(e.target.value)} spellCheck={false} autoComplete="off" pattern="[a-p]{32}" />
          </label>
          <label htmlFor={ids.confirm} className="ol-row">
            <input id={ids.confirm} type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            I built this extension myself, or trust whoever did. This is recorded in the library’s decisions log.
          </label>
          <button type="submit" disabled={!devId.trim() || !confirm}>
            Trust this build
          </button>
        </form>
        <p className="ol-hint">
          Chrome also needs the native host installed for this build. In Terminal, from the OneFamily folder, run{' '}
          <code>node apps/desktop/host-dist/install-native-host.mjs --extension-id {view.developerIds[0] ?? '<id>'}</code>, then restart Chrome. Add{' '}
          <code>--dry-run</code> to see what it would write first.
        </p>
      </section>

      <section className="ol-card">
        <h2 style={{ marginTop: 0 }}>Collect from the mock site</h2>
        <p className="ol-hint">
          This version works only with the made-up mock site on 127.0.0.1. Every real DNA service’s terms say no to automated page visits, so they’re refused.
          Runs go one page at a time, with a 30 to 60 second pause between pages, at most {view.dailyCap} pages a day ({view.pagesToday} so far today), and stop at
          any challenge, sign-in page or error.
        </p>
        <div className="ol-row">
          <label htmlFor={ids.origin}>
            Mock site address
            <input id={ids.origin} value={origin} onChange={(e) => setOrigin(e.target.value)} spellCheck={false} />
          </label>
          <label htmlFor={ids.kit}>
            Kit
            <select id={ids.kit} value={kit} onChange={(e) => setKit(e.target.value)}>
              {kits.map((k) => (
                <option key={k.kit} value={k.kit}>
                  {shortKit(k.kit)}
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <button type="button" onClick={() => void run(() => call('extensionStopRun'))}>
              Stop run
            </button>
          ) : (
            <button type="button" className="ol-primary" disabled={!view.connected || !kit} onClick={() => void run(() => call('extensionStartRun', { kit, site: MOCK_SITE, origin: origin.trim() }))}>
              Start run
            </button>
          )}
        </div>
        <LabelBatch kit={kit} origin={origin.trim()} connected={view.connected} running={running} onView={onView} onError={setError} />
        {view.run && (
          <p role="status">
            {running ? `Running: ${view.run.pages} of at most ${view.run.maxPages} pages.` : `Last run: ${view.run.reason ?? 'stopped'}, ${view.run.pages} pages. ${view.run.detail ?? ''}`}
          </p>
        )}
      </section>

      <section className="ol-card">
        <h2 style={{ marginTop: 0 }}>Handed over</h2>
        {view.log.length === 0 ? (
          <p className="ol-hint">Nothing yet. Every hand-over is listed here and kept in extension-handovers.jsonl in the app’s folder: what, how many, and which fields, never the values.</p>
        ) : (
          <div className="ol-table-wrap">
            <table>
              <caption className="ol-hint" style={{ textAlign: 'left' }}>
                Newest last. Which fields went across, never their values.
              </caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Direction</th>
                  <th scope="col">What</th>
                  <th scope="col">Kit</th>
                  <th scope="col">Records</th>
                  <th scope="col">Fields</th>
                  <th scope="col">Allowed by</th>
                </tr>
              </thead>
              <tbody>
                {view.log.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td>{formatDate(e.at)}</td>
                    <td>{e.direction === 'to-extension' ? 'To the extension' : 'From the extension'}</td>
                    <td>{e.what}</td>
                    <td>{shortKit(e.kit)}</td>
                    <td>{e.items}</td>
                    <td>{e.fields.join(', ')}</td>
                    <td>{e.grant ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

/**
 * A label batch for the mock site: proposed from the kit's DNA groups, reviewed here, and applied only after
 * the person ticks that they've reviewed it. Real services are refused by the terms register.
 */
function LabelBatch(props: { kit: string; origin: string; connected: boolean; running: boolean; onView: (v: ExtensionView) => void; onError: (m: string | null) => void }) {
  const [batch, setBatch] = useState<{ kit: string; labels: { match: string; label: string }[] } | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const id = useId()
  const counts = new Map<string, number>()
  for (const l of batch?.labels ?? []) counts.set(l.label, (counts.get(l.label) ?? 0) + 1)
  return (
    <section aria-labelledby={`${id}-h`} style={{ marginTop: 16 }}>
      <h3 id={`${id}-h`}>Label batch (mock site only)</h3>
      <p>Labels come from the kit’s DNA groups and start with “OL”, so they’re clearly the app’s. Nothing is written until you review the batch and apply it.</p>
      <div className="ol-row">
        <button type="button" disabled={!props.kit} onClick={() => { setReviewed(false); props.onError(null); call('proposeLabels', { kit: props.kit }).then(setBatch, (e: Error) => props.onError(e.message)) }}>
          Propose a batch
        </button>
      </div>
      {batch && (
        <>
          <p role="status">{batch.labels.length} matches, {counts.size} labels: {[...counts].map(([l, n]) => `${l} (${n})`).join(', ')}.</p>
          <label htmlFor={`${id}-ok`}>
            <input id={`${id}-ok`} type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I’ve reviewed this batch
          </label>
          <div className="ol-row">
            <button
              type="button"
              className="ol-primary"
              disabled={!reviewed || !props.connected || props.running || batch.labels.length === 0}
              onClick={() => call('extensionApplyLabels', { kit: batch.kit, site: MOCK_SITE, origin: props.origin, labels: batch.labels, approved: true }).then((v) => { props.onView(v); setBatch(null); setReviewed(false) }, (e: Error) => props.onError(e.message))}
            >
              Apply to the mock site
            </button>
          </div>
        </>
      )}
    </section>
  )
}
