/**
 * The app's side of the Chrome extension (ADR 0009). Everything the extension can ask for, and everything the
 * app can tell it to do, passes through here:
 *
 * - The caller must be our extension: its origin is checked against the published ID and a developer ID the
 *   owner trusted in the app's settings. Anything else is refused before a single message is read.
 * - The command lists in wire.ts are the only ones. Anything else is refused.
 * - A request started in the extension waits for the owner's answer in the app (allow once, allow for this
 *   session, or deny) unless a grant already covers it. Grants carry an expiry, and end when Chrome closes.
 * - Every capability goes through the terms register first, and in this version every page visit or label
 *   must also be on 127.0.0.1, the local mock site. No real site is ever visited.
 * - What's handed over is the minimum, and each hand-over is logged.
 */
import { CapabilityRefused, type Capability, type TermsRegister } from '@captiveorigins/onelineage-core'
import {
  DAILY_PAGE_CAP, EXTENSION_REQUESTS, PUBLISHED_EXTENSION_ID, REQUEST_TIMEOUT_MS, SESSION_GRANT_MS, STOP_REASONS, WIRE_VERSION,
  extensionIdFromOrigin, isLoopbackOrigin,
  type AppMessage, type ExtensionMessage, type Grant, type GrantKind, type LabelInstruction, type MatchSummary, type PageSnapshot, type StopReason,
} from './wire'

/** The register slug for each real service's web address. Used only so a refusal names the right register entry. */
const REAL_SITE_HOSTS: [RegExp, string][] = [
  [/(^|\.)ancestry\.[a-z.]+$/, 'ancestry'],
  [/(^|\.)myheritage\.[a-z.]+$/, 'myheritage'],
  [/(^|\.)23andme\.com$/, '23andme'],
  [/(^|\.)gedmatch\.com$/, 'gedmatch'],
  [/(^|\.)familytreedna\.com$/, 'ftdna'],
  [/(^|\.)livingdna\.com$/, 'livingdna'],
  [/(^|\.)familysearch\.org$/, 'familysearch'],
  [/(^|\.)wikitree\.com$/, 'wikitree'],
  [/(^|\.)yfull\.com$/, 'yfull'],
]
/** The register slug of the local mock site's synthetic terms entry. */
export const MOCK_SITE = 'mocksite'

export class ExtensionRefused extends Error {}

export type PendingRequest = { id: string; request: string; kit: string; detail: string; at: string; expiresAt: string }
export type HandoverEntry = {
  at: string
  direction: 'to-extension' | 'from-extension'
  what: string
  kit: string
  grant: GrantKind | null
  /** How many records went across. */
  items: number
  /** Which fields, never their values. */
  fields: string[]
}
export type RunState = {
  runId: string
  kind: 'collect' | 'labels'
  kit: string
  site: string
  origin: string
  startedAt: string
  pages: number
  maxPages: number
  state: 'running' | 'stopped'
  reason: StopReason | null
  detail: string | null
}
export type ExtensionStatus = {
  connected: boolean
  /** The connected extension's ID, when one is connected. */
  extensionId: string | null
  privacy: boolean
  pending: PendingRequest[]
  grants: Grant[]
  run: RunState | null
  pagesToday: number
  dailyCap: number
  log: HandoverEntry[]
}

/** What the app does with the data. The bridge decides whether; this decides what. */
export type ExtensionData = {
  matchSummary(kit: string, match: string, privacy: boolean): Promise<MatchSummary | null>
  acceptPage(kit: string, site: string, page: { kind: 'match-list' | 'match'; data: Record<string, unknown> }): Promise<void>
  newMatches(kit: string, limit: number): Promise<string[]>
  /** Called once when a collecting run ends, for any reason. */
  runEnded?(kit: string, site: string): Promise<void>
}

export type BridgeOptions = {
  now: () => Date
  terms: TermsRegister
  /** Developer build IDs the owner trusted in the app's settings. The published ID, once there is one, is always allowed. */
  developerIds: () => string[]
  data: ExtensionData
  log: (e: HandoverEntry) => void
  pagesOn: (day: string) => number
  addPages: (day: string, n: number) => void
  dailyCap?: number
  newId?: () => string
  onChange?: () => void
}

type Waiting = PendingRequest & { message: Extract<ExtensionMessage, { type: 'request' }> }

const MAX_EXPORT_TEXT = 256 * 1024
const ONCE_GRANT_MS = 10 * 60 * 1000

export function createExtensionBridge(opts: BridgeOptions) {
  const cap = opts.dailyCap ?? DAILY_PAGE_CAP
  let counter = 0
  const newId = opts.newId ?? (() => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const iso = (ms: number) => new Date(ms).toISOString()
  const nowMs = () => opts.now().getTime()
  const day = () => opts.now().toISOString().slice(0, 10)
  const changed = () => opts.onChange?.()

  let conn: { send: (m: AppMessage) => void; extensionId: string } | null = null
  let privacy = false
  let grants: Grant[] = []
  let waiting: Waiting[] = []
  let run: RunState | null = null
  const recent: HandoverEntry[] = []

  const allowedIds = () => [...(PUBLISHED_EXTENSION_ID ? [PUBLISHED_EXTENSION_ID] : []), ...opts.developerIds()]

  const record = (e: Omit<HandoverEntry, 'at'>) => {
    const entry = { at: iso(nowMs()), ...e }
    recent.push(entry)
    if (recent.length > 100) recent.shift()
    opts.log(entry)
  }
  const send = (m: AppMessage) => conn?.send(m)

  /** Drop expired grants and refuse requests nobody answered in time. */
  function expire() {
    const t = nowMs()
    const ended = grants.filter((g) => Date.parse(g.expiresAt) <= t)
    if (ended.length) {
      grants = grants.filter((g) => !ended.includes(g))
      for (const g of ended) {
        send({ type: 'grantEnded', grantId: g.id })
        if (run && run.state === 'running' && g.kind === 'run') stopRunWith('grant-ended', 'The run’s hour was up.')
      }
    }
    const late = waiting.filter((w) => Date.parse(w.expiresAt) <= t)
    if (late.length) {
      waiting = waiting.filter((w) => !late.includes(w))
      for (const w of late) send({ type: 'response', id: w.id, ok: false, error: 'Nobody answered in OneLineage in time, so the answer is no.' })
    }
    if (ended.length || late.length) changed()
  }

  /** The terms register first, then this version's own rule: page visits, reads and labels happen only on 127.0.0.1. */
  function gate(site: string, capability: Capability, origin: string) {
    opts.terms.require(site, capability)
    if (!isLoopbackOrigin(origin)) throw new ExtensionRefused('This version works only with the local mock site on 127.0.0.1. No real site is visited.')
  }

  function siteOf(url: string): { site: string; origin: string } {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      throw new ExtensionRefused('That page address isn’t a valid web address.')
    }
    if (isLoopbackOrigin(u.origin)) return { site: MOCK_SITE, origin: u.origin }
    const host = u.hostname.toLowerCase()
    const real = REAL_SITE_HOSTS.find(([re]) => re.test(host))
    // Unknown sites have no register entry, so the register refuses them.
    return { site: real ? real[1] : `unknown:${host}`, origin: u.origin }
  }

  function grantFor(kit: string, request: string, runId: string | undefined): Grant | null {
    return (
      grants.find((g) => {
        if (g.kit !== kit) return false
        if (g.kind === 'session') return true
        // A run covers fetching for that run only; the side panel's summaries still need an OK.
        return g.kind === 'run' && run?.state === 'running' && runId === run.runId && request !== 'matchSummary'
      }) ?? null
    )
  }

  function addGrant(kind: GrantKind, kit: string, ms: number): Grant {
    const g: Grant = { id: newId(), kind, kit, expiresAt: iso(nowMs() + ms) }
    if (kind !== 'once') grants.push(g)
    changed()
    return g
  }

  async function serve(m: Extract<ExtensionMessage, { type: 'request' }>, grant: Grant): Promise<void> {
    try {
      if (m.request === 'matchSummary') {
        const s = await opts.data.matchSummary(m.kit, m.match, privacy)
        if (!s) throw new ExtensionRefused('That match isn’t in this library.')
        // Only these four fields, whatever the data source returned.
        const data: MatchSummary = { match: s.match, line: s.line, confidence: s.confidence, theories: [...s.theories] }
        record({ direction: 'to-extension', what: 'match summary', kit: m.kit, grant: grant.kind, items: 1, fields: ['line', 'confidence', 'theory names'] })
        send({ type: 'response', id: m.id, ok: true, grant, data })
      } else if (m.request === 'newMatchesToFetch') {
        const left = run?.state === 'running' && run.runId === m.runId ? Math.min(run.maxPages - run.pages, cap - opts.pagesOn(day())) : cap - opts.pagesOn(day())
        const matches = left > 0 ? (await opts.data.newMatches(m.kit, left)).slice(0, left) : []
        record({ direction: 'to-extension', what: 'matches to fetch', kit: m.kit, grant: grant.kind, items: matches.length, fields: ['match id'] })
        send({ type: 'response', id: m.id, ok: true, grant, data: { matches } })
      } else {
        await acceptPage(m, grant)
        send({ type: 'response', id: m.id, ok: true, grant, data: { accepted: true } })
      }
    } catch (e) {
      send({ type: 'response', id: m.id, ok: false, error: (e as Error).message })
    }
  }

  async function acceptPage(m: Extract<ExtensionMessage, { request: 'pageExport' }>, grant: Grant) {
    const page = m.page as PageSnapshot
    if (!page || typeof page.url !== 'string') throw new ExtensionRefused('The page hand-over was empty.')
    const { site, origin } = siteOf(page.url)
    gate(site, 'read_own_matches', origin)
    const inRun = run && run.state === 'running' && m.runId === run.runId
    if (m.runId && !inRun) throw new ExtensionRefused('That run has ended.')
    if (inRun && origin !== run!.origin) throw new ExtensionRefused('That page isn’t on the site this run was started for.')
    if (page.kind !== 'match-list' && page.kind !== 'match') throw new ExtensionRefused(`A ${page.kind ?? 'unmarked'} page has nothing to hand over.`)
    if (typeof page.exportText !== 'string' || page.exportText.length > MAX_EXPORT_TEXT) throw new ExtensionRefused('The page’s export was missing or too large.')
    let data: Record<string, unknown>
    try {
      data = JSON.parse(page.exportText) as Record<string, unknown>
    } catch {
      throw new ExtensionRefused('The page’s export wasn’t readable.')
    }
    if (data['kit'] !== m.kit) throw new ExtensionRefused('That page belongs to a different kit.')
    if (inRun) {
      if (opts.pagesOn(day()) >= cap) {
        stopRunWith('daily-cap', `The daily cap of ${cap} pages was reached.`)
        throw new ExtensionRefused(`The daily cap of ${cap} pages was reached. Collecting can go on tomorrow.`)
      }
      opts.addPages(day(), 1)
      run!.pages++
    }
    await opts.data.acceptPage(m.kit, site, { kind: page.kind, data })
    record({ direction: 'from-extension', what: `page export (${page.kind})`, kit: m.kit, grant: grant.kind, items: 1, fields: Object.keys(data).sort() })
    changed()
  }

  function stopRunWith(reason: StopReason, detail: string | null) {
    if (!run || run.state !== 'running') return
    if (run.kind === 'collect') void opts.data.runEnded?.(run.kit, run.site).catch((e: Error) => console.error(`Collected pages were not stored: ${e.message}`))
    run.state = 'stopped'
    run.reason = reason
    run.detail = detail
    const ended = grants.filter((g) => g.kind === 'run')
    grants = grants.filter((g) => g.kind !== 'run')
    for (const g of ended) send({ type: 'grantEnded', grantId: g.id })
    changed()
  }

  async function receive(raw: unknown): Promise<void> {
    expire()
    const m = raw as Partial<ExtensionMessage> & Record<string, unknown>
    const id = typeof m?.['id'] === 'string' ? (m['id'] as string) : null
    const refuse = (error: string) => id && send({ type: 'response', id, ok: false, error })

    if (!m || typeof m !== 'object') return
    if (m.type === 'hello') {
      if (m['version'] !== WIRE_VERSION) {
        send({ type: 'response', id: 'hello', ok: false, error: `This extension speaks version ${String(m['version'])}; the app speaks ${WIRE_VERSION}. Update both.` })
        close()
        return
      }
      send({ type: 'welcome', version: WIRE_VERSION, privacy })
      return
    }
    if (m.type === 'privacyButton') {
      setPrivacy(!privacy)
      return
    }
    if (m.type === 'runReport') {
      if (run && m['runId'] === run.runId && typeof m['reason'] === 'string' && (STOP_REASONS as readonly string[]).includes(m['reason'] as string)) {
        stopRunWith(m['reason'] as StopReason, typeof m['detail'] === 'string' ? (m['detail'] as string).slice(0, 300) : null)
      }
      return
    }
    if (m.type !== 'request' || !id) {
      refuse('That isn’t something the extension can ask for.')
      return
    }
    const name = m['request']
    if (typeof name !== 'string' || !(EXTENSION_REQUESTS as readonly string[]).includes(name)) {
      refuse(`"${String(name)}" isn’t on the list of things the extension can ask for.`)
      return
    }
    if (typeof m['kit'] !== 'string' || !m['kit']) {
      refuse('Say which kit.')
      return
    }
    if (name === 'matchSummary' && typeof m['match'] !== 'string') {
      refuse('Say which match.')
      return
    }
    const msg = m as Extract<ExtensionMessage, { type: 'request' }>
    const grant = grantFor(msg.kit, name, (msg as { runId?: string }).runId)
    if (grant) return serve(msg, grant)
    if ((msg as { runId?: string }).runId) {
      refuse('That run has ended.')
      return
    }
    waiting.push({
      id: msg.id,
      request: name,
      kit: msg.kit,
      detail: describe(msg),
      at: iso(nowMs()),
      expiresAt: iso(nowMs() + REQUEST_TIMEOUT_MS),
      message: msg,
    })
    changed()
  }

  function close() {
    if (!conn) return
    conn = null
    // Chrome closed (or the extension went away): session grants end with it, and so does any run.
    grants = []
    waiting = []
    if (run && run.state === 'running') {
      run.state = 'stopped'
      run.reason = 'disconnected'
      run.detail = 'Chrome closed the connection.'
    }
    changed()
  }

  function setPrivacy(on: boolean) {
    privacy = on
    send({ type: 'command', command: 'setPrivacy', on })
    changed()
  }

  function requireConnected() {
    if (!conn) throw new ExtensionRefused('The OneLineage extension isn’t connected. Open Chrome with the extension turned on.')
  }

  return {
    /**
     * Chrome passes the caller's origin to the native host. Only our extension's origin is accepted.
     * Returns the connection's handlers; throws ExtensionRefused for anything else.
     */
    connect(origin: string, sendFn: (m: AppMessage) => void) {
      const id = extensionIdFromOrigin(origin)
      if (!id || !allowedIds().includes(id)) throw new ExtensionRefused('That caller isn’t the OneLineage extension this app trusts, so it was refused.')
      if (conn) close()
      conn = { send: sendFn, extensionId: id }
      changed()
      return { receive, close }
    },

    status(): ExtensionStatus {
      expire()
      return {
        connected: conn !== null,
        extensionId: conn?.extensionId ?? null,
        privacy,
        pending: waiting.map(({ message: _m, ...p }) => p),
        grants: [...grants],
        run: run ? { ...run } : null,
        pagesToday: opts.pagesOn(day()),
        dailyCap: cap,
        log: recent.slice(-50),
      }
    },

    /** The owner's answer to a request started in the extension. */
    async decide(requestId: string, answer: 'once' | 'session' | 'deny') {
      expire()
      const w = waiting.find((x) => x.id === requestId)
      if (!w) throw new ExtensionRefused('That request has already been answered or has expired.')
      waiting = waiting.filter((x) => x !== w)
      changed()
      if (answer === 'deny') {
        send({ type: 'response', id: w.id, ok: false, error: 'Denied in OneLineage.' })
        return
      }
      if (answer !== 'once' && answer !== 'session') throw new ExtensionRefused('Answer allow once, allow for this session, or deny.')
      const grant = addGrant(answer, w.kit, answer === 'session' ? SESSION_GRANT_MS : ONCE_GRANT_MS)
      await serve(w.message, grant)
    },

    endGrant(grantId: string) {
      const g = grants.find((x) => x.id === grantId)
      if (!g) return
      grants = grants.filter((x) => x !== g)
      send({ type: 'grantEnded', grantId })
      if (g.kind === 'run') stopRunWith('stopped-in-app', 'Ended in OneLineage.')
      changed()
    },

    /** Started in the app. Refused unless the register allows automated page visits on that site, and it's on 127.0.0.1. */
    startRun(p: { kit: string; site: string; origin: string; startPath?: string; maxPages?: number }): RunState {
      expire()
      gate(p.site, 'automate_page_visits', p.origin)
      gate(p.site, 'read_own_matches', p.origin)
      requireConnected()
      if (run?.state === 'running') throw new ExtensionRefused('A run is already going. Stop it first.')
      const left = cap - opts.pagesOn(day())
      if (left <= 0) throw new ExtensionRefused(`Today’s cap of ${cap} pages has been reached. Collecting can go on tomorrow.`)
      const maxPages = Math.max(1, Math.min(p.maxPages ?? left, left))
      const grant = addGrant('run', p.kit, SESSION_GRANT_MS)
      run = { runId: newId(), kind: 'collect', kit: p.kit, site: p.site, origin: p.origin, startedAt: iso(nowMs()), pages: 0, maxPages, state: 'running', reason: null, detail: null }
      const startPath = p.startPath ?? `/kits/${encodeURIComponent(p.kit)}/matches`
      send({ type: 'command', command: 'startRun', runId: run.runId, kit: p.kit, site: p.site, origin: p.origin, startPath, maxPages, grant })
      changed()
      return { ...run }
    },

    stopRun() {
      if (!run || run.state !== 'running') return
      send({ type: 'command', command: 'stopRun', runId: run.runId })
      stopRunWith('stopped-in-app', 'Stopped in OneLineage.')
    },

    /** Started in the app, for a batch the owner approved. One label per page, at human pace. */
    applyLabels(p: { kit: string; site: string; origin: string; labels: LabelInstruction[]; approved: boolean }): RunState {
      expire()
      if (p.approved !== true) throw new ExtensionRefused('Only an approved label batch can be applied.')
      gate(p.site, 'automate_page_visits', p.origin)
      gate(p.site, 'write_labels', p.origin)
      requireConnected()
      if (run?.state === 'running') throw new ExtensionRefused('A run is already going. Stop it first.')
      const labels = p.labels.filter((l) => typeof l.match === 'string' && typeof l.label === 'string').map((l) => ({ match: l.match, label: l.label.slice(0, 100) }))
      if (labels.length === 0) throw new ExtensionRefused('The batch has no labels in it.')
      const left = cap - opts.pagesOn(day())
      if (labels.length > left) throw new ExtensionRefused(`That’s ${labels.length} pages, and ${Math.max(0, left)} are left in today’s cap.`)
      const grant = addGrant('run', p.kit, SESSION_GRANT_MS)
      run = { runId: newId(), kind: 'labels', kit: p.kit, site: p.site, origin: p.origin, startedAt: iso(nowMs()), pages: 0, maxPages: labels.length, state: 'running', reason: null, detail: null }
      opts.addPages(day(), labels.length)
      record({ direction: 'to-extension', what: 'label batch', kit: p.kit, grant: 'run', items: labels.length, fields: ['match id', 'label'] })
      send({ type: 'command', command: 'applyLabels', runId: run.runId, batchId: newId(), kit: p.kit, site: p.site, origin: p.origin, labels, grant })
      changed()
      return { ...run }
    },

    setPrivacy,
    get privacy() {
      return privacy
    },
    /** Called on a timer by the app, and before every operation. */
    expire,
  }
}
export type ExtensionBridge = ReturnType<typeof createExtensionBridge>

function describe(m: Extract<ExtensionMessage, { type: 'request' }>): string {
  if (m.request === 'matchSummary') return `A summary of one match (its line, confidence and theory names) for the side panel.`
  if (m.request === 'newMatchesToFetch') return 'The list of new matches to fetch for this kit.'
  return 'To hand over the export of the page open in Chrome.'
}

export { CapabilityRefused }
