import { describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { CapabilityRefused } from '@captiveorigins/onelineage-core'
import { decisionsPath, readDecisions } from '@captiveorigins/onelineage-library'
import { createExtensionBridge, ExtensionRefused, MOCK_SITE, type ExtensionData, type HandoverEntry } from '../host/extension/bridge'
import { encodeFrame, FrameReader, FramingError, MAX_TO_CHROME } from '../host/extension/framing'
import { installPlan, manifestTemplate, nativeHostManifest } from '../host/extension/manifest'
import { callerOrigin, runRelay } from '../host/extension/relay'
import { listenForExtension } from '../host/extension/socket'
import { extensionRegister, MOCK_SITE_TERMS } from '../host/extension/terms'
import { APP_COMMANDS, EXTENSION_REQUESTS, SESSION_GRANT_MS, type AppMessage } from '../host/extension/wire'
import { createHost } from '../host/handlers'

const root = new URL('../../../', import.meta.url)
const realTerms = () => {
  const dir = new URL('terms/', root)
  return Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => [n, readFileSync(new URL(n, dir), 'utf8')]))
}
const DEV = 'abcdefghijklmnopabcdefghijklmnop'
const OTHER = 'ponmlkjihgfedcbaponmlkjihgfedcba'
const T0 = Date.parse('2026-11-10T12:00:00Z')
const MOCK = 'http://127.0.0.1:8787'

function setup(o: { ids?: string[]; data?: Partial<ExtensionData> } = {}) {
  let t = T0
  const sent: AppMessage[] = []
  const log: HandoverEntry[] = []
  const pages = new Map<string, number>()
  const calls: string[] = []
  let n = 0
  const bridge = createExtensionBridge({
    now: () => new Date(t),
    terms: extensionRegister(realTerms()),
    developerIds: () => o.ids ?? [DEV],
    data: {
      matchSummary: async (kit, match) => (calls.push(`summary ${kit} ${match}`), { match, line: 'Mother’s side', confidence: 'low', theories: ['Theory A'], extra: 'never sent' } as never),
      acceptPage: async (kit, _site, page) => void calls.push(`page ${kit} ${page.kind}`),
      newMatches: async (kit, limit) => (calls.push(`new ${kit}`), ['m1', 'm2', 'm3'].slice(0, limit)),
      runEnded: async (kit, site) => void calls.push(`ended ${kit} ${site}`),
      ...o.data,
    },
    log: (e) => log.push(e),
    pagesOn: (d) => pages.get(d) ?? 0,
    addPages: (d, k) => pages.set(d, (pages.get(d) ?? 0) + k),
    newId: () => `id${n++}`,
  })
  const conn = () => bridge.connect(`chrome-extension://${DEV}/`, (m) => sent.push(m))
  return { bridge, sent, log, pages, calls, conn, advance: (ms: number) => (t += ms), last: () => sent[sent.length - 1] }
}

describe('native message framing', () => {
  it('writes a little-endian 32-bit length, then UTF-8 JSON', () => {
    const f = encodeFrame({ a: 'é' })
    expect([...f.slice(0, 4)]).toEqual([10, 0, 0, 0])
    expect(new TextDecoder().decode(f.slice(4))).toBe('{"a":"é"}')
  })

  it('reads frames however the bytes are split', () => {
    const bytes = new Uint8Array([...encodeFrame({ n: 1 }), ...encodeFrame({ n: 2, s: 'x'.repeat(300) }), ...encodeFrame([3])])
    for (let size = 1; size <= 7; size++) {
      const r = new FrameReader()
      const got: unknown[] = []
      for (let i = 0; i < bytes.length; i += size) got.push(...r.push(bytes.slice(i, i + size)))
      expect(got).toEqual([{ n: 1 }, { n: 2, s: 'x'.repeat(300) }, [3]])
      expect(r.pending).toBe(0)
    }
  })

  it('refuses an oversized length, bad JSON, and messages to Chrome over 1 MB', () => {
    const huge = new Uint8Array(4)
    new DataView(huge.buffer).setUint32(0, 0xffffffff, true)
    expect(() => new FrameReader().push(huge)).toThrow(FramingError)
    const bad = new Uint8Array([3, 0, 0, 0, 0x7b, 0x7b, 0x7b])
    expect(() => new FrameReader().push(bad)).toThrow(/valid UTF-8 JSON/)
    expect(() => encodeFrame({ s: 'x'.repeat(MAX_TO_CHROME) })).toThrow(/at most 1 MB/)
  })
})

describe('only our extension can connect', () => {
  it('refuses any other extension ID, a malformed origin, or anything when no ID is trusted', () => {
    const { bridge } = setup()
    expect(() => bridge.connect(`chrome-extension://${OTHER}/`, () => {})).toThrow(ExtensionRefused)
    expect(() => bridge.connect('https://example.com/', () => {})).toThrow(ExtensionRefused)
    expect(() => bridge.connect(`chrome-extension://${DEV}`, () => {})).toThrow(ExtensionRefused)
    expect(() => bridge.connect(`chrome-extension://${DEV.toUpperCase()}/`, () => {})).toThrow(ExtensionRefused)
    expect(() => setup({ ids: [] }).bridge.connect(`chrome-extension://${DEV}/`, () => {})).toThrow(ExtensionRefused)
    expect(() => bridge.connect(`chrome-extension://${DEV}/`, () => {})).not.toThrow()
    expect(bridge.status().extensionId).toBe(DEV)
  })

  it('the native host reads the origin Chrome passes, and the manifest lists only our IDs', () => {
    expect(callerOrigin([`chrome-extension://${DEV}/`])).toBe(`chrome-extension://${DEV}/`)
    expect(callerOrigin(['--parent-window=0', `chrome-extension://${DEV}/`])).toBe(`chrome-extension://${DEV}/`)
    expect(callerOrigin(['chrome-extension://not-an-id/'])).toBeNull()
    expect(callerOrigin([])).toBeNull()
    const m = nativeHostManifest({ path: '/x/host', extensionIds: [DEV, DEV] })
    expect(m.allowed_origins).toEqual([`chrome-extension://${DEV}/`])
    expect(m.type).toBe('stdio')
    expect(() => nativeHostManifest({ path: '/x/host', extensionIds: [] })).toThrow(/at least one/)
    expect(() => nativeHostManifest({ path: '/x/host', extensionIds: ['*'] })).toThrow(/isn’t a Chrome extension ID/)
    expect(() => nativeHostManifest({ path: 'relative', extensionIds: [DEV] })).toThrow(/absolute/)
  })

  it('keeps the committed manifest template in step, and plans the install without writing anything', () => {
    expect(readFileSync(new URL('../native-host/org.captiveorigins.onelineage.json.template', import.meta.url), 'utf8')).toBe(manifestTemplate())
    const plan = installPlan({ home: '/Users/someone', node: '/opt/homebrew/bin/node', hostScript: '/Apps/OneLineage/native-host.mjs', developerIds: [DEV] })
    expect(plan.map((f) => f.path)).toEqual([
      '/Users/someone/Library/Application Support/OneLineage/native-host/onelineage-native-host',
      '/Users/someone/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.captiveorigins.onelineage.json',
    ])
    expect(JSON.parse(plan[1]!.content).allowed_origins).toEqual([`chrome-extension://${DEV}/`])
    expect(JSON.parse(plan[1]!.content).path).toBe(plan[0]!.path)
  })
})

describe('the fixed command list', () => {
  it('is short, and has no way to read the library or run anything', () => {
    expect([...APP_COMMANDS]).toEqual(['startRun', 'stopRun', 'applyLabels', 'setPrivacy'])
    expect([...EXTENSION_REQUESTS]).toEqual(['matchSummary', 'newMatchesToFetch', 'pageExport'])
  })

  it('refuses anything outside the list, without touching the data', async () => {
    const { conn, sent, calls, bridge } = setup()
    const c = conn()
    for (const request of ['readLibrary', 'run', 'exec', '__proto__', 'constructor'])
      await c.receive({ type: 'request', id: `r-${request}`, request, kit: 'K' })
    await c.receive({ type: 'command', id: 'c1', command: 'startRun' })
    await c.receive({ type: 'eval', id: 'e1', code: '1' })
    await c.receive({ type: 'request', request: 'matchSummary', kit: 'K', match: 'M' }) // no id
    const errors = sent.filter((m) => m.type === 'response' && !m.ok).map((m) => (m as { id: string }).id)
    expect(errors).toEqual(['r-readLibrary', 'r-run', 'r-exec', 'r-__proto__', 'r-constructor', 'c1', 'e1'])
    expect(calls).toEqual([])
    expect(bridge.status().pending).toEqual([])
  })
})

describe('requests started in the extension need an OK in the app', () => {
  it('waits without a grant, and deny answers no', async () => {
    const { conn, sent, calls, bridge } = setup()
    const c = conn()
    await c.receive({ type: 'request', id: 'q1', request: 'matchSummary', kit: 'K', match: 'M' })
    expect(sent).toEqual([])
    expect(calls).toEqual([])
    expect(bridge.status().pending.map((p) => p.id)).toEqual(['q1'])
    await bridge.decide('q1', 'deny')
    expect(sent).toEqual([{ type: 'response', id: 'q1', ok: false, error: 'Denied in OneLineage.' }])
    expect(calls).toEqual([])
    await expect(bridge.decide('q1', 'once')).rejects.toThrow(/already been answered/)
  })

  it('refuses a request nobody answers in time', async () => {
    const { conn, sent, advance, bridge } = setup()
    await conn().receive({ type: 'request', id: 'q1', request: 'newMatchesToFetch', kit: 'K' })
    advance(2 * 60 * 1000 + 1)
    bridge.expire()
    expect(sent).toEqual([{ type: 'response', id: 'q1', ok: false, error: 'Nobody answered in OneLineage in time, so the answer is no.' }])
  })

  it('allow once serves that request only, with the minimum, and logs it', async () => {
    const { conn, sent, calls, bridge, log } = setup()
    const c = conn()
    await c.receive({ type: 'request', id: 'q1', request: 'matchSummary', kit: 'K', match: 'M' })
    await bridge.decide('q1', 'once')
    const r = sent[0] as Extract<AppMessage, { type: 'response'; ok: true }>
    expect(r.ok).toBe(true)
    expect(r.data).toEqual({ match: 'M', line: 'Mother’s side', confidence: 'low', theories: ['Theory A'] })
    expect(r.grant.kind).toBe('once')
    expect(bridge.status().grants).toEqual([])
    expect(log).toEqual([expect.objectContaining({ direction: 'to-extension', what: 'match summary', kit: 'K', items: 1, fields: ['line', 'confidence', 'theory names'] })])
    await c.receive({ type: 'request', id: 'q2', request: 'matchSummary', kit: 'K', match: 'M' })
    expect(bridge.status().pending.map((p) => p.id)).toEqual(['q2'])
    expect(calls).toEqual(['summary K M'])
  })

  it('a session grant covers one kit, and ends after an hour', async () => {
    const { conn, sent, bridge, advance } = setup()
    const c = conn()
    await c.receive({ type: 'request', id: 'q1', request: 'matchSummary', kit: 'K', match: 'M' })
    await bridge.decide('q1', 'session')
    const grant = bridge.status().grants[0]!
    expect(grant).toMatchObject({ kind: 'session', kit: 'K', expiresAt: new Date(T0 + SESSION_GRANT_MS).toISOString() })
    await c.receive({ type: 'request', id: 'q2', request: 'matchSummary', kit: 'K', match: 'M2' })
    expect(sent.at(-1)).toMatchObject({ id: 'q2', ok: true })
    await c.receive({ type: 'request', id: 'q3', request: 'matchSummary', kit: 'OTHER', match: 'M' })
    expect(bridge.status().pending.map((p) => p.id)).toEqual(['q3'])

    advance(SESSION_GRANT_MS)
    expect(bridge.status().grants).toEqual([])
    expect(sent).toContainEqual({ type: 'grantEnded', grantId: grant.id })
    await c.receive({ type: 'request', id: 'q4', request: 'matchSummary', kit: 'K', match: 'M' })
    expect(bridge.status().pending.map((p) => p.id)).toContain('q4')
  })

  it('a session grant ends when Chrome closes, and "End now" ends it at once', async () => {
    const { conn, bridge } = setup()
    let c = conn()
    await c.receive({ type: 'request', id: 'q1', request: 'matchSummary', kit: 'K', match: 'M' })
    await bridge.decide('q1', 'session')
    expect(bridge.status().grants).toHaveLength(1)
    c.close()
    expect(bridge.status()).toMatchObject({ connected: false, grants: [] })
    c = conn()
    await c.receive({ type: 'request', id: 'q2', request: 'matchSummary', kit: 'K', match: 'M' })
    await bridge.decide('q2', 'session')
    bridge.endGrant(bridge.status().grants[0]!.id)
    expect(bridge.status().grants).toEqual([])
  })
})

describe('privacy', () => {
  it('the toolbar button flips the app’s switch, and the app tells the extension', async () => {
    const { conn, sent, bridge } = setup()
    const c = conn()
    await c.receive({ type: 'hello', version: 1 })
    expect(sent.at(-1)).toEqual({ type: 'welcome', version: 1, privacy: false })
    await c.receive({ type: 'privacyButton' })
    expect(bridge.status().privacy).toBe(true)
    expect(sent.at(-1)).toEqual({ type: 'command', command: 'setPrivacy', on: true })
    bridge.setPrivacy(false)
    expect(sent.at(-1)).toEqual({ type: 'command', command: 'setPrivacy', on: false })
  })
})

describe('the terms gate', () => {
  it('refuses runs, page hand-overs and labels on every real service', async () => {
    const { bridge, conn, sent } = setup()
    const c = conn()
    const real = Object.keys(realTerms()).filter((n) => n !== 'README.md').map((n) => n.replace(/\.md$/, ''))
    expect(real.length).toBeGreaterThanOrEqual(9)
    for (const site of real) {
      expect(() => bridge.startRun({ kit: 'K', site, origin: MOCK })).toThrow(CapabilityRefused)
      expect(() => bridge.applyLabels({ kit: 'K', site, origin: MOCK, labels: [{ match: 'M', label: 'x' }], approved: true })).toThrow(CapabilityRefused)
    }
    await c.receive({ type: 'request', id: 'q1', request: 'pageExport', kit: 'K', page: { url: 'https://www.ancestry.com/discoveryui-matches/list/K', kind: 'match-list', exportText: '{"kit":"K"}' } })
    await bridge.decide('q1', 'once')
    expect(sent.at(-1)).toMatchObject({ id: 'q1', ok: false, error: expect.stringMatching(/refused for ancestry/) })
    expect(bridge.status().run).toBeNull()
  })

  it('refuses the mock site anywhere but 127.0.0.1, and a site with no entry', () => {
    const { bridge, conn } = setup()
    conn()
    expect(() => bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: 'https://mock.example.com' })).toThrow(/only with the local mock site/)
    expect(() => bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: 'http://localhost:8787' })).toThrow(/only with the local mock site/)
    expect(() => bridge.startRun({ kit: 'K', site: 'nosuchsite', origin: MOCK })).toThrow(CapabilityRefused)
    expect(bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: MOCK }).state).toBe('running')
  })

  it('keeps the synthetic entry in step with mock-site/mocksite.md, and reserves its name', () => {
    const md = readFileSync(new URL('apps/extension/mock-site/mocksite.md', root), 'utf8')
    expect(md.slice(0, md.indexOf('---', 4) + 4)).toBe(MOCK_SITE_TERMS)
    expect(() => extensionRegister({ 'mocksite.md': MOCK_SITE_TERMS })).toThrow(/reserved/)
  })

  it('needs an approved batch for labels', () => {
    const { bridge, conn } = setup()
    conn()
    expect(() => bridge.applyLabels({ kit: 'K', site: MOCK_SITE, origin: MOCK, labels: [{ match: 'M', label: 'x' }], approved: false })).toThrow(/approved/)
  })
})

describe('runs started in the app', () => {
  it('covers fetching for that run only, counts pages towards the daily cap, and stops at it', async () => {
    const { bridge, conn, sent, pages, calls } = setup()
    const c = conn()
    expect(() => bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: MOCK, maxPages: 2 })).not.toThrow()
    const start = sent.at(-1) as Extract<AppMessage, { command: 'startRun' }>
    expect(start).toMatchObject({ command: 'startRun', kit: 'K', origin: MOCK, maxPages: 2, grant: { kind: 'run', kit: 'K' } })
    const page = (id: string) => ({ type: 'request', id, request: 'pageExport', kit: 'K', runId: start.runId, page: { url: `${MOCK}/kits/K/matches`, kind: 'match-list', exportText: '{"kit":"K","matches":[]}' } })
    await c.receive(page('p1'))
    expect(sent.at(-1)).toMatchObject({ id: 'p1', ok: true })
    expect(bridge.status().run?.pages).toBe(1)
    expect([...pages.values()]).toEqual([1])
    await c.receive({ type: 'request', id: 'n1', request: 'newMatchesToFetch', kit: 'K', runId: start.runId })
    expect(sent.at(-1)).toMatchObject({ id: 'n1', ok: true, data: { matches: ['m1'] } }) // one page left in the run
    // A summary isn't covered by a run.
    await c.receive({ type: 'request', id: 's1', request: 'matchSummary', kit: 'K', match: 'M' })
    expect(bridge.status().pending.map((p) => p.id)).toEqual(['s1'])
    // A page from another origin isn't part of the run.
    await c.receive({ ...page('p2'), page: { url: 'http://127.0.0.1:9999/kits/K/matches', kind: 'match-list', exportText: '{"kit":"K"}' } })
    expect(sent.at(-1)).toMatchObject({ id: 'p2', ok: false })
    await c.receive({ type: 'runReport', runId: start.runId, state: 'stopped', reason: 'challenge', pages: 1, detail: 'challenge seen' })
    expect(bridge.status().run).toMatchObject({ state: 'stopped', reason: 'challenge' })
    // The app is told once, so the run's pages can be stored in the library.
    expect(calls.filter((x) => x.startsWith('ended '))).toEqual([`ended K ${MOCK_SITE}`])
    expect(bridge.status().grants).toEqual([])
    await c.receive(page('p3'))
    expect(sent.at(-1)).toMatchObject({ id: 'p3', ok: false, error: 'That run has ended.' })
  })

  it('refuses to start once today’s cap is used', () => {
    const { bridge, conn, pages } = setup()
    conn()
    pages.set('2026-11-10', 100)
    expect(() => bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: MOCK })).toThrow(/cap of 100 pages/)
  })

  it('needs the extension connected', () => {
    const { bridge } = setup()
    expect(() => bridge.startRun({ kit: 'K', site: MOCK_SITE, origin: MOCK })).toThrow(/isn’t connected/)
  })
})

describe('the app host', () => {
  it('trusts a developer build only with a confirmation, as a recorded decision', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ol-ext-'))
    const host = createHost({ stateDir: join(dir, 'state'), now: () => new Date(T0) })
    await expect(host.handlers.trustDeveloperExtension({ id: DEV, confirm: true })).rejects.toThrow(/library folder first/)
    await host.handlers.chooseLibrary({ path: join(dir, 'lib') })
    await expect(host.handlers.trustDeveloperExtension({ id: DEV, confirm: false })).rejects.toThrow(/confirmation/)
    await expect(host.handlers.trustDeveloperExtension({ id: 'nope', confirm: true })).rejects.toThrow(/isn’t a Chrome extension ID/)
    const v = await host.handlers.trustDeveloperExtension({ id: DEV, confirm: true })
    expect(v.developerIds).toEqual([DEV])
    expect(() => host.extension.connect(`chrome-extension://${OTHER}/`, () => {})).toThrow(ExtensionRefused)
    expect(() => host.extension.connect(`chrome-extension://${DEV}/`, () => {})).not.toThrow()
    const log = await readDecisions(decisionsPath(join(dir, 'lib')))
    expect(log.map((d) => [d.kind, d.data['id'], d.data['trusted']])).toEqual([['extension-developer-id', DEV, true]])
    expect((await host.handlers.untrustDeveloperExtension({ id: DEV })).developerIds).toEqual([])
    expect(() => host.extension.connect(`chrome-extension://${DEV}/`, () => {})).toThrow(ExtensionRefused)
  })

  it('setPrivacy from the window reaches the extension', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ol-ext-'))
    const host = createHost({ stateDir: join(dir, 'state'), now: () => new Date(T0) })
    await host.handlers.chooseLibrary({ path: join(dir, 'lib') })
    await host.handlers.trustDeveloperExtension({ id: DEV, confirm: true })
    const sent: AppMessage[] = []
    host.extension.connect(`chrome-extension://${DEV}/`, (m) => sent.push(m))
    expect((await host.handlers.setPrivacy({ on: true })).privacy).toBe(true)
    expect(sent).toEqual([{ type: 'command', command: 'setPrivacy', on: true }])
  })

  it('logs hand-overs to a file in the app’s folder, with fields and counts but no values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ol-ext-'))
    const host = createHost({ stateDir: join(dir, 'state'), now: () => new Date(T0) })
    await host.handlers.chooseLibrary({ path: join(dir, 'lib') })
    await host.handlers.trustDeveloperExtension({ id: DEV, confirm: true })
    const c = host.extension.connect(`chrome-extension://${DEV}/`, () => {})
    await c.receive({ type: 'request', id: 'q1', request: 'newMatchesToFetch', kit: 'K' })
    await host.handlers.extensionDecide({ request: 'q1', answer: 'once' })
    const lines = readFileSync(join(dir, 'state', 'extension-handovers.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).toEqual([{ at: new Date(T0).toISOString(), direction: 'to-extension', what: 'matches to fetch', kit: 'K', grant: 'once', items: 0, fields: ['match id'] }])
  })

  it('carries messages from Chrome’s framing through the native host to the app and back, over a Unix socket', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ol-'))
    const { bridge } = setup()
    const path = join(dir, 's.sock')
    const server = await listenForExtension(path, bridge)
    const talk = async (origin: string, messages: unknown[]) => {
      const stdin = new PassThrough()
      const out = new FrameReader()
      const got: unknown[] = []
      const exited = new Promise<number>((resolve) => runRelay({ argv: [origin], stdin, write: (b) => got.push(...out.push(b)), socketPath: path, exit: resolve }))
      for (const m of messages) stdin.write(encodeFrame(m))
      await new Promise((r) => setTimeout(r, 150))
      stdin.end()
      return { got, code: await exited }
    }
    const ok = await talk(`chrome-extension://${DEV}/`, [{ type: 'hello', version: 1 }, { type: 'request', id: 'x', request: 'readLibrary', kit: 'K' }])
    expect(ok.got).toEqual([
      { type: 'welcome', version: 1, privacy: false },
      { type: 'response', id: 'x', ok: false, error: '"readLibrary" isn’t on the list of things the extension can ask for.' },
    ])
    const refused = await talk(`chrome-extension://${OTHER}/`, [{ type: 'hello', version: 1 }])
    expect(refused.got).toEqual([{ type: 'response', id: 'hello', ok: false, error: expect.stringMatching(/isn’t the OneLineage extension/) }])
    expect(refused.code).toBe(1)
    const notChrome = await talk('https://example.com/', [])
    expect(notChrome.got).toEqual([{ type: 'response', id: 'hello', ok: false, error: expect.stringMatching(/Only a Chrome extension/) }])
    server.close()
  })
})
