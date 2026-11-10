import { CircleAlert, CircleCheck, HardDrive, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { BackupRun, BackupState } from '../../host/protocol'
import { call } from '../api'
import { nextStepDown, requirementText } from '../flow'
import { ErrorBox, FolderField, formatDate, Icon } from '../ui'

export function Verdict({ backups }: { backups: BackupState }) {
  const { ok, message } = backups.verdict
  return (
    <p className={`ol-verdict ${ok ? 'ol-ok' : 'ol-bad'}`} role="status">
      <Icon of={ok ? CircleCheck : CircleAlert} />
      <span>
        {ok ? 'Backups are current. ' : 'Backups need attention. '}
        {message}
      </span>
    </p>
  )
}

/** Destinations, adding and removing them, and the requirement with its deliberate step-down. Used in setup and on the Backups screen. */
export function BackupSetup({ backups, onBackups, setup = false }: { backups: BackupState; onBackups: (b: BackupState) => void; setup?: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const down = nextStepDown(backups.bypass)
  const run = async (f: () => Promise<BackupState>) => {
    setBusy(true)
    setError(null)
    try {
      onBackups(await f())
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const missing = Math.max(0, backups.required - backups.destinations.length)
  return (
    <>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      <h2>Destinations</h2>
      {backups.destinations.length === 0 ? (
        <p className="ol-hint">No backup destinations yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {backups.destinations.map((d) => (
            <li key={d.path} className="ol-card">
              <div className="ol-row">
                <Icon of={HardDrive} />
                <code>{d.path}</code>
                <span className="ol-spacer" />
                <button type="button" disabled={busy} onClick={() => run(() => call('removeDestination', { path: d.path }))} aria-label={`Remove ${d.path} as a backup destination`}>
                  Remove
                </button>
              </div>
              <p className="ol-hint" style={{ margin: '6px 0 0' }}>
                Last checked copy: {formatDate(d.lastCheckedBackup)}
              </p>
              {d.problems.map((p) => (
                <p key={p} className="ol-bad" style={{ margin: '6px 0 0' }}>
                  <Icon of={CircleAlert} size={14} /> {p}
                </p>
              ))}
              {d.warnings.map((w) => (
                <p key={w} className="ol-warn" style={{ margin: '6px 0 0' }}>
                  <Icon of={TriangleAlert} size={14} /> {w}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {setup && missing > 0 && (
        <p>
          {missing === 1 ? 'Choose one more destination.' : `Choose ${missing} destinations.`} The best place is a disk that isn’t the one this Mac runs from.
        </p>
      )}
      <FolderField label="Backup folder" action={backups.destinations.length ? 'Add another destination…' : 'Add a destination…'} busy={busy} onChoose={(path) => run(() => call('addDestination', { path }))} />

      <h2>How many backups</h2>
      <p>{requirementText(backups.bypass)}</p>
      {down && !confirming && (
        <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
          {down.button}
        </button>
      )}
      {down && confirming && (
        <div className="ol-confirm" role="group" aria-label="Confirm fewer backups">
          <p>{down.loses}</p>
          <p className="ol-hint">This is recorded in your library’s decisions log. You can go back up at any time.</p>
          <div className="ol-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false)
                void run(() => call('lowerBackupRequirement', { confirm: true }))
              }}
            >
              {down.confirm}
            </button>
            <button type="button" className="ol-primary" autoFocus onClick={() => setConfirming(false)}>
              Keep {backups.bypass === 0 ? 'two backups' : 'one backup'}
            </button>
          </div>
        </div>
      )}
      {backups.bypass > 0 && (
        <p>
          <button type="button" disabled={busy} onClick={() => run(() => call('raiseBackupRequirement'))}>
            {backups.bypass === 2 ? 'Require one backup again' : 'Require two backups again'}
          </button>
        </p>
      )}
    </>
  )
}

export function BackupsScreen({ backups, onBackups }: { backups: BackupState; onBackups: (b: BackupState) => void }) {
  const [running, setRunning] = useState(false)
  const [last, setLast] = useState<BackupRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Verdict backups={backups} />
      <div className="ol-row">
        <button
          type="button"
          className="ol-primary"
          disabled={running || backups.destinations.length === 0}
          onClick={async () => {
            setRunning(true)
            setError(null)
            try {
              const r = await call('backUpEverywhere')
              setLast(r)
              onBackups(r.state)
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setRunning(false)
            }
          }}
        >
          <Icon of={HardDrive} /> Back up everywhere
        </button>
        <span className="ol-hint" aria-live="polite">
          {running ? 'Backing up and checking each copy…' : ''}
        </span>
      </div>
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {last && (
        <div aria-live="polite">
          <h2>Last run</h2>
          <ul>
            {last.results.length === 0 && <li>There are no destinations to back up to.</li>}
            {last.results.map((r) => (
              <li key={r.destination} className={r.ok ? 'ol-ok' : 'ol-bad'}>
                <Icon of={r.ok ? CircleCheck : CircleAlert} size={14} /> <code>{r.destination}</code>:{' '}
                {r.ok ? `${r.files} files copied and checked${r.encrypted ? ', encrypted' : ''}.` : (r.problems[0] ?? 'Failed.')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <BackupSetup backups={backups} onBackups={onBackups} />
    </>
  )
}
