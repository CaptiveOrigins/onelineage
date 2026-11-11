import { afterEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { createCore, type PanelState } from '../src/core'
import { snapshotFromHtml } from '../src/page'
import { startMockSite, type MockSite } from '../mock-site/server'
import { createExtensionBridge, MOCK_SITE, type ExtensionBridge } from '../../desktop/host/extension/bridge'
import { extensionRegister } from '../../desktop/host/extension/terms'
import type { AppMessage, ExtensionMessage, PageSnapshot } from '../src/wire'

const DEV = 'abcdefghijklmnopabcdefghijklmnop'
const TEST_PACE = { minMs: 2, maxMs: 6 }
let site: MockSite | null = null
afterEach(async () => {
  await site?.close()
  site = null
})

function extension(o: { now?: () => number; activePage?: () => Promise<PageSnapshot | null> } = {}) {
  const sent: ExtensionMessage[] = []
  const panels: PanelState[] = []
  const badges: boolean[] = []
  let n = 0
  const core = createCore({
    sendNative: (m) => sent.push(m),
    browser: {
      visit: async (url) => snapshotFromHtml(url, await (await fetch(url)).text()),
      postLabel: async (url, label) => (await fetch(url, { method: 'POST', body: JSON.stringify({ label }) })).ok,
      activePage: o.activePage ?? (async () => null),
    },
    onPanel: (s) => panels.push(s),
    setBadge: (on) => badges.push(on),
    now: o.now ?? Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    random: Math.random,
    newId: () => `e${n++}`,
    pace: TEST_PACE,
  })
  return { core, sent, panels, badges, panel: () => panels[panels.length - 1]! }
}

describe('the extension, on its own', () => {
  it('ignores anything from the app that isn’t on the command list', async () => {
    const { core, sent, panels } = extension()
    for (const m of [{ type: 'command', command: 'readLibrary' }, { type: 'command', command: 'eval', code: '1' }, { type: 'run' }, null, 'x'])
      await core.onNative(m)
    expect(sent).toEqual([])
    expect(panels).toEqual([])
  })

  it('sets the badge from setPrivacy, and the toolbar button only asks the app', async () => {
    const { core, sent, badges, panel } = extension()
    core.privacyButton()
    expect(sent).toEqual([{ type: 'privacyButton' }])
    expect(badges).toEqual([])
    await core.onNative({ type: 'command', command: 'setPrivacy', on: true })
    expect(badges).toEqual([true])
    expect(panel().privacy).toBe(true)
  })

  it('refuses a run on anything but 127.0.0.1, even if the app asked', async () => {
    const { core, sent } = extension()
    await core.onNative({ type: 'welcome', version: 1, privacy: false })
    await core.onNative({ type: 'command', command: 'startRun', runId: 'r', kit: 'K', site: 'ancestry', origin: 'https://www.ancestry.com', startPath: '/', maxPages: 5, grant: { id: 'g', kind: 'run', kit: 'K', expiresAt: '2099-01-01T00:00:00Z' } })
    expect(sent).toEqual([{ type: 'runReport', runId: 'r', state: 'stopped', reason: 'error', pages: 0, detail: expect.stringMatching(/only the local mock site/) }])
  })

  it('drops a match summary from the side panel when its grant expires', async () => {
    let t = Date.parse('2026-11-10T12:00:00Z')
    const page = { url: 'http://127.0.0.1:8787/kits/K/matches/M', kind: 'match', exportText: '{}' }
    const { core, sent, panel } = extension({ now: () => t, activePage: async () => page })
    await core.onNative({ type: 'welcome', version: 1, privacy: false })
    const done = core.summariseActiveMatch()
    await new Promise((r) => setTimeout(r, 0))
    expect(sent).toEqual([{ type: 'request', id: 'e0', request: 'matchSummary', kit: 'K', match: 'M' }])
    expect(panel().notice).toMatch(/Waiting for your answer/)
    await core.onNative({ type: 'response', id: 'e0', ok: true, grant: { id: 'g1', kind: 'once', kit: 'K', expiresAt: new Date(t + 600_000).toISOString() }, data: { match: 'M', line: 'Mother’s side', confidence: 'low', theories: [] } })
    await done
    expect(panel().summary).toMatchObject({ match: 'M', line: 'Mother’s side' })
    t += 599_999
    core.sweep()
    expect(panel().summary).not.toBeNull()
    t += 1
    core.sweep()
    expect(panel().summary).toBeNull()
  })

  it('drops everything when the app goes away', async () => {
    const { core, panel } = extension()
    await core.onNative({ type: 'welcome', version: 1, privacy: true })
    core.disconnected('gone')
    expect(panel()).toMatchObject({ connected: false, connection: 'gone', summary: null })
  })
})

describe('the extension and the app together, against the mock site', () => {
  function wire(bridge: ExtensionBridge, ext: ReturnType<typeof extension>) {
    const toApp: unknown[] = []
    const conn = bridge.connect(`chrome-extension://${DEV}/`, (m: AppMessage) => void ext.core.onNative(m))
    // Deliver the extension's messages to the app as the native host would.
    const pump = setInterval(() => {
      for (const m of ext.sent.splice(0)) {
        toApp.push(m)
        void conn.receive(m)
      }
    }, 1)
    return { toApp, conn, stop: () => clearInterval(pump) }
  }

  it('runs a collection started in the app, at test pace, and fetches only the new matches', async () => {
    const s = (site = await startMockSite({ newMatches: 3 }))
    const fetched = new Set<string>()
    const listed = new Set<string>()
    const pages = new Map<string, number>()
    const terms = Object.fromEntries(readdirSync(new URL('../../../terms/', import.meta.url)).filter((n) => n.endsWith('.md')).map((n) => [n, readFileSync(new URL(`../../../terms/${n}`, import.meta.url), 'utf8')]))
    const inLibrary = new Set(s.matches.filter((m) => !s.newIds.includes(m.id)).map((m) => m.id))
    const bridge = createExtensionBridge({
      now: () => new Date(),
      terms: extensionRegister(terms),
      developerIds: () => [DEV],
      data: {
        matchSummary: async () => null,
        acceptPage: async (_kit, _site, p) => {
          if (p.kind === 'match-list') for (const m of p.data['matches'] as { id: string }[]) listed.add(m.id)
          else fetched.add((p.data['match'] as { id: string }).id)
        },
        newMatches: async (_kit, limit) => [...listed].filter((id) => !inLibrary.has(id) && !fetched.has(id)).slice(0, limit),
      },
      log: () => {},
      pagesOn: (d) => pages.get(d) ?? 0,
      addPages: (d, k) => pages.set(d, (pages.get(d) ?? 0) + k),
    })
    const ext = extension()
    const w = wire(bridge, ext)
    ext.core.connected()
    await new Promise((r) => setTimeout(r, 10))
    expect(bridge.status().connected).toBe(true)

    expect(() => bridge.startRun({ kit: s.kit, site: 'ancestry', origin: s.origin })).toThrow(/refused for ancestry/)
    bridge.startRun({ kit: site.kit, site: MOCK_SITE, origin: site.origin })
    for (let i = 0; i < 500 && bridge.status().run?.state === 'running'; i++) await new Promise((r) => setTimeout(r, 10))
    w.stop()

    const run = bridge.status().run!
    const listPages = Math.ceil(site.matches.length / 20)
    expect(run).toMatchObject({ state: 'stopped', reason: 'finished', pages: listPages + 3 })
    expect([...fetched].sort()).toEqual([...site.newIds].sort())
    expect([...pages.values()]).toEqual([listPages + 3])
    expect(site.hits.every((h) => h.concurrent === 1)).toBe(true)
    expect(bridge.status().grants).toEqual([])
    expect(ext.panel().run).toMatchObject({ state: 'stopped', reason: 'finished' })
  })
})
