import { afterEach, describe, expect, it } from 'vitest'
import { runCollection, runLabels, type RunDeps } from '../src/run-loop'
import { snapshotFromHtml } from '../src/page'
import { pauseMs, HUMAN_PACE } from '../src/pacing'
import { startMockSite, type MockSite } from '../mock-site/server'
import type { AppMessage, ExtensionRequestBody } from '../src/wire'

type Response = Extract<AppMessage, { type: 'response' }>
const TEST_PACE = { minMs: 5, maxMs: 15 }
let site: MockSite | null = null
afterEach(async () => {
  await site?.close()
  site = null
})

const visit = async (url: string) => snapshotFromHtml(url, await (await fetch(url)).text())
const grant = { id: 'g', kind: 'run' as const, kit: 'K', expiresAt: '2099-01-01T00:00:00Z' }

/** An app that takes every page and asks for the site's new matches, as the real app would after the list. */
function fakeApp(newIds: () => string[]) {
  const asked: ExtensionRequestBody[] = []
  const ask = async (m: ExtensionRequestBody): Promise<Response> => {
    asked.push(m)
    if (m.request === 'newMatchesToFetch') return { type: 'response', id: 'x', ok: true, grant, data: { matches: newIds() } }
    return { type: 'response', id: 'x', ok: true, grant, data: { accepted: true } }
  }
  return { ask, asked }
}

function deps(over: Partial<RunDeps> = {}): RunDeps & { pauses: number[] } {
  const pauses: number[] = []
  return {
    visit,
    ask: async () => ({ type: 'response', id: 'x', ok: true, grant, data: { accepted: true } }),
    sleep: async (ms) => {
      pauses.push(ms)
      await new Promise((r) => setTimeout(r, ms))
    },
    random: Math.random,
    shouldStop: () => false,
    pace: TEST_PACE,
    ...over,
    pauses,
  }
}

describe('pacing', () => {
  it('pauses 30 to 60 seconds at human pace, whatever the random source says', () => {
    for (const r of [0, 0.25, 0.5, 0.999, 1, -3, 7]) {
      const ms = pauseMs(() => r)
      expect(ms).toBeGreaterThanOrEqual(30_000)
      expect(ms).toBeLessThanOrEqual(60_000)
    }
    expect(HUMAN_PACE).toEqual({ minMs: 30_000, maxMs: 60_000 })
  })

  it('without a test pace, a run waits 30–60 s between every pair of pages', async () => {
    site = await startMockSite({ newMatches: 3 })
    const app = fakeApp(() => site!.newIds)
    const pauses: number[] = []
    const r = await runCollection(
      { runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 },
      { visit, ask: app.ask, sleep: async (ms) => void pauses.push(ms), random: Math.random, shouldStop: () => false },
    )
    expect(r.reason).toBe('finished')
    expect(pauses).toHaveLength(r.pages - 1)
    for (const ms of pauses) expect(ms >= 30_000 && ms <= 60_000).toBe(true)
  })
})

describe('a run against the mock site, in test mode', () => {
  it('reads every list page, then fetches only the new matches, one page at a time', async () => {
    site = await startMockSite({ newMatches: 4 })
    const app = fakeApp(() => site!.newIds)
    const d = deps({ ask: app.ask })
    const r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 }, d)
    const listPages = Math.ceil(site.matches.length / 20)
    expect(r).toMatchObject({ reason: 'finished', pages: listPages + 4 })
    expect(site.hits.map((h) => h.path)).toEqual([
      `/kits/${site.kit}/matches`,
      ...Array.from({ length: listPages - 1 }, (_, i) => `/kits/${site!.kit}/matches?page=${i + 2}`),
      ...site.newIds.map((id) => `/kits/${site!.kit}/matches/${id}`),
    ])
    // One at a time: never two requests in flight, and each starts after the last ended plus a pause.
    expect(site.hits.every((h) => h.concurrent === 1)).toBe(true)
    for (let i = 1; i < site.hits.length; i++) expect(site.hits[i]!.start - site.hits[i - 1]!.end).toBeGreaterThanOrEqual(TEST_PACE.minMs - 2)
    expect(d.pauses).toHaveLength(r.pages - 1)
    expect(app.asked.filter((a) => a.request === 'pageExport')).toHaveLength(r.pages)
    expect(app.asked.filter((a) => a.request === 'newMatchesToFetch')).toHaveLength(1)
  })

  it('stops at the run’s page budget (the daily cap)', async () => {
    site = await startMockSite({ newMatches: 4 })
    const app = fakeApp(() => site!.newIds)
    const r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 3 }, deps({ ask: app.ask }))
    expect(r).toMatchObject({ reason: 'daily-cap', pages: 3 })
    expect(site.hits).toHaveLength(3)
  })

  it('stops at a challenge, and visits nothing after it', async () => {
    site = await startMockSite({ challengeAfter: 2 })
    const app = fakeApp(() => site!.newIds)
    const r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 }, deps({ ask: app.ask }))
    expect(r).toMatchObject({ reason: 'challenge', pages: 3 })
    expect(site.hits).toHaveLength(3)
    // The challenge page itself isn't handed over.
    expect(app.asked.filter((a) => a.request === 'pageExport')).toHaveLength(2)
  })

  it('stops at a sign-in page, and at an error page', async () => {
    site = await startMockSite({ signInAfter: 1 })
    let r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 }, deps())
    expect(r).toMatchObject({ reason: 'sign-in', pages: 2 })
    await site.close()
    site = await startMockSite()
    r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: '/kits/NOT-A-KIT/matches', maxPages: 100 }, deps())
    expect(r).toMatchObject({ reason: 'error', pages: 1 })
  })

  it('stops when the app says stop, and when the app refuses a page', async () => {
    site = await startMockSite()
    let stop = false
    let r = await runCollection(
      { runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 },
      deps({ onProgress: (n) => (stop = n >= 2), shouldStop: () => stop }),
    )
    expect(r).toMatchObject({ reason: 'stopped-in-app', pages: 2 })
    r = await runCollection(
      { runId: 'r', kit: site.kit, origin: site.origin, startPath: `/kits/${site.kit}/matches`, maxPages: 100 },
      deps({ ask: async () => ({ type: 'response', id: 'x', ok: false, error: 'no' }) }),
    )
    expect(r).toMatchObject({ reason: 'error', pages: 1 })
  })

  it('refuses any origin but 127.0.0.1 before visiting anything', async () => {
    let visits = 0
    for (const origin of ['https://www.ancestry.com', 'http://localhost:8787', 'https://127.0.0.1:8787', 'http://127.0.0.1.example.com:80']) {
      const r = await runCollection({ runId: 'r', kit: 'K', origin, startPath: '/', maxPages: 100 }, deps({ visit: async () => (visits++, { url: '', kind: null, exportText: null }) }))
      expect(r.reason).toBe('error')
    }
    expect(visits).toBe(0)
  })

  it('stops if a link leads off the site', async () => {
    site = await startMockSite()
    const r = await runCollection({ runId: 'r', kit: site.kit, origin: site.origin, startPath: 'https://www.ancestry.com/', maxPages: 100 }, deps())
    expect(r.reason).toBe('error')
    expect(site.hits).toHaveLength(0)
  })

  it('applies an approved label batch one match at a time, and stops at a challenge', async () => {
    site = await startMockSite({ challengeAfter: 2 })
    const post = async (url: string, label: string) => (await fetch(url, { method: 'POST', body: JSON.stringify({ label }) })).ok
    const [a, b, c] = site.matches
    const r = await runLabels({ kit: site.kit, origin: site.origin, labels: [a, b, c].map((m, i) => ({ match: m!.id, label: `Group ${i + 1}` })) }, { ...deps(), postLabel: post })
    expect(r).toMatchObject({ reason: 'challenge', applied: 2, pages: 3 })
    expect([...site.labels]).toEqual([[a!.id, 'Group 1'], [b!.id, 'Group 2']])
  })
})
