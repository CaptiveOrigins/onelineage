import { useEffect, useRef, useState } from 'react'
import type { BackupState, Status, UseKind } from '../../host/protocol'
import { call } from '../api'
import { FIRST_LAUNCH_STEPS, stepLabel, type FirstLaunchStep } from '../flow'
import { ErrorBox, FolderField } from '../ui'
import { BackupSetup } from './Backups'

const STEP_NAMES: Record<Exclude<FirstLaunchStep, 'ready'>, string> = { library: 'Library folder', use: 'Kind of use', backups: 'Backups' }

/** The use choices, worded from USE-POLICY.md. Law-enforcement use isn't offered. */
const USE_CHOICES: { value: UseKind; title: string; detail: string }[] = [
  { value: 'personal', title: 'My own family research', detail: 'Your own DNA matches and your own family.' },
  { value: 'for-someone-else', title: 'Research for someone else', detail: 'Such as a relative, a friend, a client or an adoptee, with their permission.' },
  { value: 'sanctioned-lab', title: 'Investigative genetic genealogy by an appropriately sanctioned lab', detail: 'Verifiable work by a lab sanctioned to do it.' },
  { value: 'wildlife-agency', title: 'A wildlife agency', detail: 'Work done by or for a wildlife agency.' },
]

export function FirstLaunch(props: { step: Exclude<FirstLaunchStep, 'ready'>; status: Status; backups: BackupState | null; onStatus: (s: Status) => void; onBackups: (b: BackupState) => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [props.step])
  return (
    <main className="ol-welcome">
      <ol className="ol-steps" aria-label="Setting up OneFamily">
        {FIRST_LAUNCH_STEPS.map((s) => (
          <li key={s} aria-current={s === props.step ? 'step' : undefined}>
            {FIRST_LAUNCH_STEPS.indexOf(s) + 1}. {STEP_NAMES[s]}
            {FIRST_LAUNCH_STEPS.indexOf(s) < FIRST_LAUNCH_STEPS.indexOf(props.step) ? ' (done)' : ''}
          </li>
        ))}
      </ol>
      {props.step === 'library' && <LibraryStep heading={heading} onStatus={props.onStatus} />}
      {props.step === 'use' && <UseStep heading={heading} onStatus={props.onStatus} />}
      {props.step === 'backups' && props.backups && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Where should backups go? <span className="ol-hint">{stepLabel('backups')}</span>
          </h1>
          <p>
            Your library holds everything you decide in OneFamily. By default it needs two backups, each in its own place, such as an external disk and a
            second disk. Each copy is checked by restoring it. You can choose fewer, one step at a time, and each step is recorded.
          </p>
          <BackupSetup backups={props.backups} onBackups={props.onBackups} setup />
        </>
      )}
    </main>
  )
}

function LibraryStep({ heading, onStatus }: { heading: React.RefObject<HTMLHeadingElement | null>; onStatus: (s: Status) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Choose a folder for your library <span className="ol-hint">{stepLabel('library')}</span>
      </h1>
      <p>
        OneFamily groups your DNA matches before your family tree can bias them. It runs on this Mac, with no servers and no account. Everything it keeps is
        in one folder you choose, as plain files you can open without the app.
      </p>
      <p className="ol-hint">Choose an empty folder, or one that’s already a OneFamily library. A folder synced by iCloud or Dropbox is fine.</p>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      <FolderField
        label="Library folder"
        action="Choose library folder…"
        busy={busy}
        onChoose={async (path) => {
          setBusy(true)
          setError(null)
          try {
            onStatus(await call('chooseLibrary', { path }))
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

function UseStep({ heading, onStatus }: { heading: React.RefObject<HTMLHeadingElement | null>; onStatus: (s: Status) => void }) {
  const [use, setUse] = useState<UseKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!use) return
        setBusy(true)
        setError(null)
        try {
          onStatus(await call('declareUse', { use }))
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h1 ref={heading} tabIndex={-1}>
        Which kind of use is this? <span className="ol-hint">{stepLabel('use')}</span>
      </h1>
      <p>
        OneFamily is for people researching families. This is asked once, and your answer is kept in your library’s decisions log. The app doesn’t watch how
        it’s used.
      </p>
      <fieldset className="ol-choices">
        <legend className="ol-hint">Choose one</legend>
        {USE_CHOICES.map((c) => (
          <label key={c.value} className="ol-choice">
            <input type="radio" name="use" value={c.value} checked={use === c.value} onChange={() => setUse(c.value)} />
            <span>
              <strong>{c.title}</strong>
              <br />
              <span className="ol-hint">{c.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="ol-hint">
        Law-enforcement use isn’t allowed, except through an appropriately sanctioned lab. The full policy is in USE-POLICY.md, which the license points to.
      </p>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      <button type="submit" className="ol-primary" disabled={!use || busy}>
        Record my answer
      </button>
    </form>
  )
}
