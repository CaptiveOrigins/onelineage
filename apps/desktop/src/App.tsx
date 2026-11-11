import { AlignLeft, Upload, Dna, Eye, EyeOff, GitBranch, HardDrive, Network, Puzzle, Settings, Table2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BackupState, ExtensionView, KitsResult, Status, TheoryResult } from '../host/protocol'
import { call, inMacApp } from './api'
import { firstLaunchStep, flowInputs } from './flow'
import { BackupsScreen, Verdict } from './screens/Backups'
import { FirstLaunch } from './screens/FirstLaunch'
import { KitsScreen } from './screens/Kits'
import { MatchesScreen } from './screens/Matches'
import { TheoryScreen } from './screens/Theory'
import { ChromosomesScreen } from './screens/Chromosomes'
import { GedmatchScreen } from './screens/Gedmatch'
import { ExtensionGrantBanner, ExtensionRequestDialog, ExtensionScreen } from './screens/Extension'
import { createStandIns } from './standins'
import { ErrorBox, Icon, NamesContext, useNames } from './ui'

type Screen = 'kits' | 'matches' | 'chromosomes' | 'gedmatch' | 'theory' | 'network' | 'backups' | 'extension'
const SCREENS: { id: Screen; label: string; icon: typeof Users }[] = [
  { id: 'kits', label: 'Kits', icon: Users },
  { id: 'matches', label: 'Matches', icon: Table2 },
  { id: 'chromosomes', label: 'Chromosomes', icon: AlignLeft },
  { id: 'gedmatch', label: 'GEDmatch', icon: Upload },
  { id: 'theory', label: 'Theory', icon: GitBranch },
  { id: 'network', label: 'DNA network', icon: Network },
  { id: 'backups', label: 'Backups', icon: HardDrive },
  { id: 'extension', label: 'Extension', icon: Puzzle },
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
  const privacyRef = useRef(privacy)
  privacyRef.current = privacy
  // The Chrome extension's state, read every two seconds: requests waiting for an answer, grants, the run. The
  // privacy switch lives in the host so the extension's toolbar button and this window share it.
  const [ext, setExt] = useState<ExtensionView | null>(null)
  const onExt = useCallback((v: ExtensionView) => {
    setExt(v)
    setPrivacy(v.privacy)
  }, [])
  useEffect(() => {
    let live = true
    const tick = () => call('extensionStatus').then((v) => live && onExt(v), () => {})
    tick()
    const t = setInterval(tick, 2000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [onExt])
  const [appearance, setAppearance, dark] = useAppearance()
  const settings = useRef<HTMLDialogElement>(null)

  // Stand-ins come from the library's saved map, so every recording shows the same made-up names.
  // New pairings are saved back in small batches. Until the map loads, privacy shows nothing rather than a real name.
  const [standIns, setStandIns] = useState<ReturnType<typeof createStandIns> | null>(null)
  const libraryPath = status?.current?.path
  useEffect(() => {
    setStandIns(null)
    if (!libraryPath) return
    let pending: Record<string, string> = {}
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      const pairs = pending
      pending = {}
      timer = null
      if (Object.keys(pairs).length) call('addPrivacyNames', { pairs }).catch((e: Error) => setError(e.message))
    }
    call('privacyNames').then(
      (p) => setStandIns(createStandIns(p.salt, { known: p.known, reserved: p.reserved, onNew: (w, st) => { pending[w] = st; timer ??= setTimeout(flush, 500) } })),
      (e: Error) => setError(e.message),
    )
    return () => { if (timer) { clearTimeout(timer); flush() } }
  }, [libraryPath])
  const names = useMemo(() => ({ privacy, show: privacy ? (n: string) => (standIns ? standIns.name(n) : '…') : (n: string) => n }), [privacy, standIns])

  // Cmd+Shift+P (Ctrl+Shift+P elsewhere) flips privacy from anywhere, without hunting for the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        // Through the host, like the button, so the extension's toolbar stays in step.
        const next = !privacyRef.current
        call('setPrivacy', { on: next }).then(onExt, () => setPrivacy(next))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExt])

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
          <button type="button" aria-pressed={privacy} onClick={() => call('setPrivacy', { on: !privacy }).then(onExt, () => setPrivacy(!privacy))} title="Show stand-in names instead of real ones, in every view (⌘⇧P)">
            <Icon of={privacy ? EyeOff : Eye} /> Privacy
          </button>
          <button type="button" onClick={() => settings.current?.showModal()}>
            <Icon of={Settings} /> Settings
          </button>
        </header>
        <div className="ol-status" aria-live="polite">
          {message ?? (status.current ? `Library: ${status.current.path}` : '')}
        </div>
        <Main key={`${status.current?.path}-${screen}`} screen={screen} status={status} backups={backups} onBackups={setBackups} dark={dark} openDemo={openDemo} openHome={openHome} ext={ext} onExt={onExt}>
          <ErrorBox error={error} onDismiss={() => setError(null)} />
        </Main>
      </div>
      <ExtensionRequestDialog view={ext} onView={onExt} />
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
  ext: ExtensionView | null
  onExt: (v: ExtensionView) => void
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
    if (hasKits && (screen === 'kits' || screen === 'matches' || screen === 'chromosomes' || screen === 'extension')) call('kits').then(setKits, (e: Error) => setError(e.message))
    if (hasKits && screen === 'theory') call('theory').then(setTheory, (e: Error) => setError(e.message))
  }, [screen, hasKits])

  const title = SCREENS.find((s) => s.id === screen)!.label
  const needsKits = screen !== 'backups' && screen !== 'network' && screen !== 'extension'

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
      <ExtensionGrantBanner view={props.ext} onView={props.onExt} />
      <DueBanner hasKits={(status.current?.kits ?? 0) > 0} path={status.current?.path} />
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {props.children}
      <ErrorBox error={error} onDismiss={() => setError(null)} />
      {screen === 'extension' && <ExtensionScreen view={props.ext} onView={props.onExt} kits={kits?.kits ?? []} />}
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
      {needsKits && hasKits && screen === 'chromosomes' && (kits ? <ChromosomesScreen kits={kits.kits} /> : !error && <p>Reading kits…</p>)}
      {needsKits && hasKits && screen === 'gedmatch' && <GedmatchScreen />}
      {needsKits && hasKits && screen === 'theory' && (theory === undefined ? !error && <p>Reading…</p> : <TheoryScreen theory={theory} onTheory={setTheory} dark={props.dark} />)}    </main>
  )
}

/** What's due (a check every 13 weeks, a full rerun yearly), as a quiet line. It never blocks work. */
function DueBanner({ hasKits, path }: { hasKits: boolean; path: string | undefined }) {
  const [due, setDue] = useState<{ items: { kit: string; label: string; kind: string; dueOn: string; reason: string }[] } | null>(null)
  const { show } = useNames()
  useEffect(() => {
    setDue(null)
    if (!hasKits) return
    call('due').then(setDue, () => setDue(null))
    // In the Mac app, a native notification at most once a day. Its text is counts only: no names or DNA details.
    if (inMacApp) void notifyDue()
  }, [hasKits, path])
  if (!due || due.items.length === 0) return null
  return (
    <div className="ol-banner" role="status">
      <strong>Due:</strong>{' '}
      {due.items.map((i) => `${show(i.label)}: ${i.kind === 'check' ? 'match-list check' : 'yearly rerun'} since ${i.dueOn}`).join('; ')}.
    </div>
  )
}

async function notifyDue() {
  const claim = await call('claimDueNotice').catch(() => null)
  if (!claim?.notify || !claim.message) return
  const n = await import('@tauri-apps/plugin-notification')
  let ok = await n.isPermissionGranted()
  if (!ok) ok = (await n.requestPermission()) === 'granted'
  if (ok) n.sendNotification({ title: 'OneLineage', body: claim.message })
}
