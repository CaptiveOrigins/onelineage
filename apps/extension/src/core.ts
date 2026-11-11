/**
 * The extension's logic, without Chrome: what it does with each message from the app, and with each button in
 * the side panel. background.ts plugs Chrome in. Everything here lives in memory and is gone when the service
 * worker stops. Nothing is stored.
 */
import { GrantBook } from './grants'
import { runCollection, runLabels, type LabelDeps } from './run-loop'
import type { Pace } from './pacing'
import {
  APP_COMMANDS, REQUEST_TIMEOUT_MS, WIRE_VERSION, isLoopbackOrigin,
  type AppMessage, type ExtensionMessage, type ExtensionRequestBody, type MatchSummary, type PageSnapshot, type StopReason,
} from './wire'

type Response = Extract<AppMessage, { type: 'response' }>

export type PanelState = {
  connected: boolean
  /** Plain words about the link to the app, when something's wrong. */
  connection: string | null
  privacy: boolean
  run: { kind: 'collect' | 'labels'; state: 'running' | 'stopped'; pages: number; reason: StopReason | null; detail: string | null } | null
  /** One match's summary, shown until its grant expires. */
  summary: (MatchSummary & { expiresAt: string }) | null
  notice: string | null
  waiting: boolean
}

export type Browser = {
  visit: (url: string) => Promise<PageSnapshot>
  postLabel: (url: string, label: string) => Promise<boolean>
  /** The page open in the active tab, read the same way a run reads it. Null if it isn't on the mock site. */
  activePage: () => Promise<PageSnapshot | null>
}

export type CoreDeps = {
  sendNative: (m: ExtensionMessage) => void
  browser: Browser
  onPanel: (s: PanelState) => void
  setBadge: (privacy: boolean) => void
  now: () => number
  sleep: (ms: number) => Promise<void>
  random: () => number
  newId: () => string
  /** Tests only. The extension's own wiring never passes this, so it always runs at human pace. */
  pace?: Pace
}

const KIT_MATCH_PATH = /^\/kits\/([^/]+)\/matches\/([^/]+)$/
const KIT_PATH = /^\/kits\/([^/]+)\//

export function createCore(d: CoreDeps) {
  const grants = new GrantBook()
  const asks = new Map<string, { resolve: (r: Response) => void; timer: ReturnType<typeof setTimeout> }>()
  let stopFlag = false
  let summaryGrant: string | null = null
  let runGrant: string | null = null
  let runId: string | null = null
  const state: PanelState = { connected: false, connection: 'Connecting to OneLineage…', privacy: false, run: null, summary: null, notice: null, waiting: false }
  const show = () => d.onPanel({ ...state, run: state.run && { ...state.run }, summary: state.summary && { ...state.summary } })

  function ask(body: ExtensionRequestBody): Promise<Response> {
    const id = d.newId()
    return new Promise((resolve) => {
      // The app refuses a request nobody answers; this is a backstop if the link drops.
      const timer = setTimeout(() => {
        asks.delete(id)
        resolve({ type: 'response', id, ok: false, error: 'No answer from OneLineage.' })
      }, REQUEST_TIMEOUT_MS + 15_000)
      asks.set(id, { resolve, timer })
      d.sendNative({ ...body, id } as ExtensionMessage)
    })
  }

  /** Drop anything held under a grant that has expired. */
  function sweep() {
    for (const g of grants.sweep(d.now())) dropGrant(g.id)
  }
  function dropGrant(id: string) {
    grants.remove(id)
    if (summaryGrant === id) {
      state.summary = null
      summaryGrant = null
      show()
    }
    if (runGrant === id) {
      stopFlag = true
      runGrant = null
    }
  }

  async function startRun(m: Extract<AppMessage, { command: 'startRun' }>) {
    if (state.run?.state === 'running') return report(m.runId, 'error', 0, 'A run is already going.')
    if (!isLoopbackOrigin(m.origin)) return report(m.runId, 'error', 0, 'This version visits only the local mock site on 127.0.0.1.')
    if (!grants.add(m.grant, d.now())) return report(m.runId, 'grant-ended', 0, 'The run’s grant had already expired.')
    stopFlag = false
    runGrant = m.grant.id
    runId = m.runId
    state.run = { kind: 'collect', state: 'running', pages: 0, reason: null, detail: null }
    show()
    const r = await runCollection(
      { runId: m.runId, kit: m.kit, origin: m.origin, startPath: m.startPath, maxPages: m.maxPages },
      { ...deps(), ask },
    )
    finish(m.runId, r.reason, r.pages, r.detail)
  }

  async function applyLabels(m: Extract<AppMessage, { command: 'applyLabels' }>) {
    if (state.run?.state === 'running') return report(m.runId, 'error', 0, 'A run is already going.')
    if (!isLoopbackOrigin(m.origin)) return report(m.runId, 'error', 0, 'This version labels only on the local mock site on 127.0.0.1.')
    if (!grants.add(m.grant, d.now())) return report(m.runId, 'grant-ended', 0, 'The batch’s grant had already expired.')
    stopFlag = false
    runGrant = m.grant.id
    runId = m.runId
    state.run = { kind: 'labels', state: 'running', pages: 0, reason: null, detail: null }
    show()
    const r = await runLabels({ kit: m.kit, origin: m.origin, labels: m.labels }, { ...deps(), ask, postLabel: d.browser.postLabel })
    d.sendNative({ type: 'runReport', runId: m.runId, state: 'labelled', batchId: m.batchId, applied: r.applied, reason: r.reason, detail: r.detail })
    finish(m.runId, r.reason, r.pages, r.detail, false)
  }

  const deps = (): Omit<LabelDeps, 'ask' | 'postLabel'> => ({
    visit: d.browser.visit,
    sleep: d.sleep,
    random: d.random,
    shouldStop: () => {
      sweep()
      return stopFlag || !state.connected
    },
    onProgress: (pages) => {
      if (state.run) state.run.pages = pages
      show()
    },
    ...(d.pace ? { pace: d.pace } : {}),
  })

  function report(id: string, reason: StopReason, pages: number, detail: string) {
    d.sendNative({ type: 'runReport', runId: id, state: 'stopped', reason, pages, detail })
  }
  function finish(id: string, reason: StopReason, pages: number, detail: string, send = true) {
    if (stopFlag && reason !== 'stopped-in-app' && reason !== 'finished') reason = 'stopped-in-app'
    if (send) report(id, reason, pages, detail)
    if (runGrant) grants.remove(runGrant)
    runGrant = null
    runId = null
    state.run = { ...(state.run ?? { kind: 'collect' }), state: 'stopped', pages, reason, detail }
    show()
  }

  return {
    /** A message from the app, through the native host. Anything not on the list is ignored. */
    async onNative(raw: unknown) {
      sweep()
      const m = raw as AppMessage
      if (!m || typeof m !== 'object') return
      if (m.type === 'welcome') {
        state.connected = m.version === WIRE_VERSION
        state.connection = state.connected ? null : 'OneLineage and this extension are different versions. Update both.'
        state.privacy = m.privacy === true
        d.setBadge(state.privacy)
        show()
        return
      }
      if (m.type === 'response') {
        if (m.id === 'hello' && !m.ok) {
          state.connected = false
          state.connection = m.error
          show()
          return
        }
        const a = asks.get(m.id)
        if (!a) return
        asks.delete(m.id)
        clearTimeout(a.timer)
        a.resolve(m)
        return
      }
      if (m.type === 'grantEnded') {
        dropGrant(m.grantId)
        return
      }
      if (m.type !== 'command' || !(APP_COMMANDS as readonly string[]).includes(m.command)) return
      if (m.command === 'setPrivacy') {
        state.privacy = m.on === true
        d.setBadge(state.privacy)
        show()
      } else if (m.command === 'stopRun') {
        if (m.runId === runId) stopFlag = true
      } else if (m.command === 'startRun') await startRun(m)
      else if (m.command === 'applyLabels') await applyLabels(m)
    },

    connected() {
      d.sendNative({ type: 'hello', version: WIRE_VERSION })
    },

    disconnected(why: string | null) {
      state.connected = false
      state.connection = why ?? 'OneLineage closed the connection.'
      grants.clear()
      state.summary = null
      summaryGrant = null
      stopFlag = true
      for (const [id, a] of asks) {
        clearTimeout(a.timer)
        a.resolve({ type: 'response', id, ok: false, error: 'OneLineage closed the connection.' })
      }
      asks.clear()
      show()
    },

    /** The toolbar button. Asks the app to flip its privacy switch; the app answers with setPrivacy. */
    privacyButton() {
      d.sendNative({ type: 'privacyButton' })
    },

    /** Side panel: a summary of the match on the active tab. Needs the owner's OK in the app. */
    async summariseActiveMatch() {
      const page = await d.browser.activePage()
      const m = page ? KIT_MATCH_PATH.exec(new URL(page.url).pathname) : null
      if (!m) return notice('Open a match’s page on the mock site first.')
      await withWaiting(async () => {
        const r = await ask({ type: 'request', request: 'matchSummary', kit: decodeURIComponent(m[1]!), match: decodeURIComponent(m[2]!) })
        if (!r.ok) return notice(r.error)
        if (!grants.add(r.grant, d.now())) return notice('That answer had already expired.')
        summaryGrant = r.grant.id
        state.summary = { ...(r.data as MatchSummary), expiresAt: r.grant.expiresAt }
        state.notice = null
        show()
      })
    },

    /** Side panel: hand over the export of the page in the active tab. Needs the owner's OK in the app. */
    async handOverActivePage() {
      const page = await d.browser.activePage()
      const kit = page ? KIT_PATH.exec(new URL(page.url).pathname)?.[1] : null
      if (!page || !kit) return notice('Open the mock site’s match list or a match’s page first.')
      await withWaiting(async () => {
        const r = await ask({ type: 'request', request: 'pageExport', kit: decodeURIComponent(kit), page })
        notice(r.ok ? 'Handed over to OneLineage.' : r.error)
      })
    },

    /** Side panel: how many new matches the app would fetch for the kit on the active tab. Needs the owner's OK. */
    async askNewMatches() {
      const page = await d.browser.activePage()
      const kit = page ? KIT_PATH.exec(new URL(page.url).pathname)?.[1] : null
      if (!kit) return notice('Open the mock site’s match list first.')
      await withWaiting(async () => {
        const r = await ask({ type: 'request', request: 'newMatchesToFetch', kit: decodeURIComponent(kit) })
        notice(r.ok ? `OneLineage has ${((r.data as { matches: string[] }).matches ?? []).length} new matches to fetch. Start the run in the app.` : r.error)
      })
    },

    sweep,
    panelState: (): PanelState => ({ ...state }),
  }

  function notice(text: string) {
    state.notice = text
    show()
  }
  async function withWaiting(f: () => Promise<void>) {
    state.waiting = true
    state.notice = 'Waiting for your answer in OneLineage…'
    show()
    try {
      await f()
    } finally {
      state.waiting = false
      show()
    }
  }
}
export type Core = ReturnType<typeof createCore>
