import { Dna, Eye, EyeOff, GitBranch, HardDrive, Network, Settings, Table2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BackupState, KitsResult, Status, TheoryResult } from '../host/protocol'
import { call } from './api'
import { firstLaunchStep, flowInputs } from './flow'
import { BackupsScreen, Verdict } from './screens/Backups'
import { FirstLaunch } from './screens/FirstLaunch'
import { KitsScreen } from './screens/Kits'
import { MatchesScreen } from './screens/Matches'
import { TheoryScreen } from './screens/Theory'
import { createStandIns, sessionSalt } from './standins'
import { ErrorBox, Icon, NamesContext } from './ui'

type Screen = 'kits' | 'matches' | 'theory' | 'network' | 'backups'
const SCREENS: { id: Screen; label: string; icon: typeof Users }[] = [
  { id: 'kits', label: 'Kits', icon: Users },
  { id: 'matches', label: 'Matches', icon: Table2 },
  { id: 'theory', label: 'Theory', icon: GitBranch },
  { id: 'network', label: 'DNA network', icon: Network },
  { id: 'backups', label: 'Backups', icon: HardDrive },
]
type Appearance = 'auto' | 'light' | 'dark'

function useAppearance(): [Appearance, (a: Appearance) => void, boolean] {
  const [appearance, setAppearance] = useState<Appearance>(() => (localStorage.getItem('ol-appearance') as Appearance | null) ?? 'auto')
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
  const [system, setSystem] = useState(query.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setSystem(e.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance
    localStorage.setItem('ol-appearance', appearance)
  }, [appearance])
  return [appearance, setAppearance, appearance === 'dark' || (appearance === 'auto' && system)]
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [backups, setBackups] = useState<BackupState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('kits')
  const [privacy, setPrivacy] = useState(false)
  const [appearance, setAppearance, dark] = useAppearance()
  const settings = useRef<HTMLDialogElement>(null)

  // One salt per session: stand-ins stay the same while the app is open, and differ next time.
  const standIns = useMemo(() => createStandIns(sessionSalt()), [])
  const names = useMemo(() => ({ privacy, show: privacy ? standIns.name : (n: string) => n }), [privacy, standIns])

  const refresh = useCallback(async (s?: Status) => {
    try {
      const next = s ?? (await call('status'))
      setStatus(next)
      setBackups(next.current ? await call('backupState') : null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => void refresh(), [refresh])

  if (!status) return <p style={{ padding: 20 }}>{error ? `OneLineage couldn’t start its file helper: ${error}` : 'Opening…'}</p>

  const demo = Boolean(status.current?.demo)
  const step = demo ? 'ready' : firstLaunchStep(flowInputs(status, backups))
  if (step !== 'ready')
    return (
      <NamesContext.Provider value={names}>
        <FirstLaunch step={step} status={status} backups={backups} onStatus={(s) => void refresh(s)} onBackups={setBackups} />
      </NamesContext.Provider>
    )

  const openDemo = async () => {
    setMessage('Making up a demo family. This takes a few seconds the first time…')
    try {
      await refresh(await call('openDemo', { seed: 1 }))
      setScreen('kits')
      setMessage('Opened the made-up demo family.')
    } catch (e) {
      setError((e as Error).message)
      setMessage(null)
    }
  }
  const openHome = async () => {
    await refresh(await call('openHome'))
    setScreen('kits')
    setMessage('Back in your library.')
  }

  return (
    <NamesContext.Provider value={names}>
      <div className="ol-app">
        <header className="ol-toolbar">
          <span className="ol-title">
            <Icon of={Dna} size={18} /> OneLineage
          </span>
          {demo && <span className="ol-badge ol-badge-demo">Made-up demo family</span>}
          <nav className="ol-nav" aria-label="Screens">
            {SCREENS.map((s) => (
              <button key={s.id} type="button" aria-current={screen === s.id ? 'page' : undefined} onClick={() => setScreen(s.id)}>
                <Icon of={s.icon} /> {s.label}
              </button>
            ))}
          </nav>
          <span className="ol-spacer" />
          {privacy && (
            <span className="ol-badge ol-badge-privacy" role="status">
              <Icon of={EyeOff} size={14} /> Privacy on
            </span>
          )}
          <button type="button" aria-pressed={privacy} onClick={() => setPrivacy(!privacy)} title="Show stand-in names instead of real ones, in every view">
            <Icon of={privacy ? EyeOff : Eye} /> Privacy
          </button>
          <button type="button" onClick={() => settings.current?.showModal()}>
            <Icon of={Settings} /> Settings
          </button>
        </header>
        <div className="ol-status" aria-live="polite">
          {message ?? (status.current ? `Library: ${status.current.path}` : '')}
        </div>
        <Main key={`${status.current?.path}-${screen}`} screen={screen} status={status} backups={backups} onBackups={setBackups} dark={dark} openDemo={openDemo} openHome={openHome}>
          <ErrorBox error={error} onDismiss={() => setError(null)} />
        </Main>
      </div>
      <dialog ref={settings} aria-labelledby="settings-h">
        <form method="dialog">
          <h1 id="settings-h">Settings</h1>
          <label style={{ marginBottom: 12 }}>
            Appearance
            <select value={appearance} onChange={(e) => setAppearance(e.target.value as Appearance)}>
              <option value="auto">Auto (follow the Mac)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p>
            <strong>Your library:</strong> <code>{status.home?.path ?? 'not chosen'}</code>
          </p>
          <p>
            <strong>Encryption keys:</strong> {status.keyStore}
          </p>
          <p className="ol-hint">Updates: this version doesn’t check for updates.</p>
          <button type="submit" className="ol-primary">
            Done
          </button>
        </form>
      </dialog>
    </NamesContext.Provider>
  )
}

function Main(props: {
  screen: Screen
  status: Status
  backups: BackupState | null
  onBackups: (b: BackupState) => void
  dark: boolean
  openDemo: () => Promise<void>
  openHome: () => Promise<void>
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [kits, setKits] = useState<KitsResult | null>(null)
  const [theory, setTheory] = useState<TheoryResult | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { screen, status } = props
  const hasKits = (status.current?.kits ?? 0) > 0

  useEffect(() => heading.current?.focus(), [])
  useEffect(() => {
    if (hasKits && (screen === 'kits' || screen === 'matches')) call('kits').then(setKits, (e: Error) => setError(e.message))
    if (hasKits && screen === 'theory') call('theory').then(setTheory, (e: Error) => setError(e.message))
  }, [screen, hasKits])

  const title = SCREENS.find((s) => s.id === screen)!.label
  const needsKits = screen !== 'backups' && screen !== 'network'

  return (
    <main className="ol-main">
      {status.current?.demo && (
        <div className="ol-banner ol-row">
          <span>Every person, name and DNA file here is made up. Your own library isn’t touched.</span>
          <button type="button" onClick={() => void props.openHome()}>
            Back to my library
          </button>
        </div>
      )}
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {props.children}
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {screen === 'backups' && props.backups && <BackupsScreen backups={props.backups} onBackups={props.onBackups} />}
      {screen === 'network' && (
        <p>
          The DNA network graph is coming in a later version. It will draw your matches as a network, grouped from the DNA alone, with a table alongside for
          keyboard and screen-reader use.
        </p>
      )}
      {needsKits && !hasKits && (
        <section className="ol-card">
          <h2 style={{ marginTop: 0 }}>This library is empty</h2>
          <p>Importing your own match files comes in a later version. To look around now, open a made-up demo family. It goes in its own folder, apart from your library.</p>
          {props.backups && !status.current?.demo && <Verdict backups={props.backups} />}
          <div className="ol-row">
            <button type="button" className="ol-primary" onClick={() => void props.openDemo()}>
              Open a made-up demo family
            </button>
          </div>
        </section>
      )}
      {needsKits && hasKits && screen === 'kits' && (kits ? <KitsScreen data={kits} /> : !error && <p>Reading kits…</p>)}
      {needsKits && hasKits && screen === 'matches' && (kits ? <MatchesScreen kits={kits.kits} /> : !error && <p>Reading kits…</p>)}
      {needsKits && hasKits && screen === 'theory' && (theory === undefined ? !error && <p>Reading…</p> : <TheoryScreen theory={theory} onTheory={setTheory} dark={props.dark} />)}    </main>
  )
}
