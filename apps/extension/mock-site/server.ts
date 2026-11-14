/**
 * A tiny made-up genealogy site, served on 127.0.0.1 only, for building and testing the extension. Every person
 * on it comes from a planted family in @extantape/onefamily-simulate. It is not a copy of any real site.
 *
 * Pages declare their kind on <body data-page-kind="…"> and carry a machine-readable export block, which is
 * all the extension reads. There's a challenge page and a sign-in page, and options to show them after a
 * number of pages, so stopping can be tested.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { exportKit, Rng, standardFamily } from '@extantape/onefamily-simulate'

export const MOCK_PAGE_SIZE = 20

export type MockMatch = { id: string; name: string; sharedCm: number; segments: number; longestCm: number }
export type MockOptions = {
  seed?: number
  port?: number
  /** After this many pages, every page is the challenge page. */
  challengeAfter?: number
  /** After this many pages, every page is the sign-in page. */
  signInAfter?: number
  /** Matches on the site that aren't in the planted export, as if they were new since it. */
  newMatches?: number
}
export type Hit = { method: string; path: string; start: number; end: number; concurrent: number }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** JSON safe inside a <script> element. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')

function page(kind: string, title: string, body: string, data?: unknown): string {
  const block = data === undefined ? '' : `\n<script type="application/json" id="onefamily-export">${scriptJson(data)}</script>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · Made-up genealogy site</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{padding:4px 10px;border-bottom:1px solid #ccc;text-align:left}.mock{background:#fff3cd;padding:6px 10px}</style>
</head><body data-page-kind="${kind}">
<p class="mock">A made-up site for testing OneFamily. Every person here is invented.</p>
<h1>${esc(title)}</h1>
${body}${block}
</body></html>
`
}

/** The kit and its matches: the planted family's tester, its exported matches, and a few made-up new ones. */
export function mockData(seed = 1, newMatches = 5): { kit: string; matches: MockMatch[]; newIds: string[] } {
  const family = standardFamily({ seed })
  const byId = new Map(family.persons.map((p) => [p.id, p]))
  const tester = byId.get(family.kits[0] as string)!
  const exported = exportKit(family, tester.id).matches
  const matches: MockMatch[] = exported.map((m) => {
    const p = byId.get(m.person)
    return { id: m.guid, name: p?.displayName ?? 'Unknown', sharedCm: Math.round(m.cm * 10) / 10, segments: Math.max(1, Math.round(m.cm / 25)), longestCm: Math.round(Math.min(m.cm, 7 + m.cm / 3) * 10) / 10 }
  })
  const rng = new Rng(seed * 104729 + 7)
  const spare = family.persons.filter((p) => !p.tested && !p.noise)
  const newIds: string[] = []
  for (let i = 0; i < newMatches && i < spare.length; i++) {
    const p = spare[Math.floor(rng.next() * spare.length)]!
    const cm = 8 + Math.round(rng.next() * 600) / 10
    const id = rng.guid()
    newIds.push(id)
    matches.push({ id, name: p.displayName, sharedCm: cm, segments: 1 + Math.floor(cm / 30), longestCm: Math.min(cm, 7 + Math.round(rng.next() * 100) / 10) })
  }
  return { kit: tester.guid!, matches, newIds }
}

export async function startMockSite(opts: MockOptions = {}) {
  const data = mockData(opts.seed ?? 1, opts.newMatches ?? 5)
  const byId = new Map(data.matches.map((m) => [m.id, m]))
  const labels = new Map<string, string>()
  const hits: Hit[] = []
  let inFlight = 0
  let pagesServed = 0

  const send = (res: ServerResponse, status: number, html: string) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    if (req.method === 'GET') {
      pagesServed++
      if (path === '/challenge' || (opts.challengeAfter !== undefined && pagesServed > opts.challengeAfter))
        return send(res, 200, page('challenge', 'Check you’re a person', '<p>Please confirm you’re a person to continue. (A made-up challenge.)</p>'))
      if (path === '/sign-in' || (opts.signInAfter !== undefined && pagesServed > opts.signInAfter))
        return send(res, 200, page('sign-in', 'Sign in', '<form><label>Username <input name="u"></label></form>'))
      if (path === '/') return send(res, 200, page('home', 'Your DNA', `<p><a href="/kits/${data.kit}/matches">Your matches</a></p>`))
    }
    const list = /^\/kits\/([^/]+)\/matches$/.exec(path)
    if (req.method === 'GET' && list && list[1] === data.kit) {
      const n = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
      const slice = data.matches.slice((n - 1) * MOCK_PAGE_SIZE, n * MOCK_PAGE_SIZE)
      const pages = Math.ceil(data.matches.length / MOCK_PAGE_SIZE)
      const next = n < pages ? `/kits/${data.kit}/matches?page=${n + 1}` : null
      const rows = slice.map((m) => `<tr><td><a href="/kits/${data.kit}/matches/${m.id}">${esc(m.name)}</a></td><td>${m.sharedCm} cM</td></tr>`).join('')
      return send(res, 200, page('match-list', `Your matches, page ${n} of ${pages}`, `<table><tr><th>Match</th><th>Shared</th></tr>${rows}</table>${next ? `<p><a href="${next}">Next page</a></p>` : ''}`, {
        kind: 'match-list', kit: data.kit, page: n, next, matches: slice.map((m) => ({ id: m.id, path: `/kits/${data.kit}/matches/${m.id}` })),
      }))
    }
    const one = /^\/kits\/([^/]+)\/matches\/([^/]+)(\/label)?$/.exec(path)
    const m = one && one[1] === data.kit ? byId.get(one[2]!) : undefined
    if (req.method === 'GET' && one && !one[3] && m) {
      return send(res, 200, page('match', m.name, `<p>${m.sharedCm} cM across ${m.segments} segments; longest ${m.longestCm} cM.</p><p>Label: ${esc(labels.get(m.id) ?? 'none')}</p>`, {
        kind: 'match', kit: data.kit, match: m,
      }))
    }
    if (req.method === 'POST' && one?.[3] && m) {
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString('utf8')))
      req.on('end', () => {
        try {
          const label = String((JSON.parse(body) as { label?: unknown }).label ?? '').slice(0, 100)
          labels.set(m.id, label)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"ok":true}')
        } catch {
          res.writeHead(400).end()
        }
      })
      return
    }
    return send(res, 404, page('error', 'Not found', '<p>There’s no page here.</p>'))
  }

  const server = createServer((req, res) => {
    const hit: Hit = { method: req.method ?? 'GET', path: req.url ?? '/', start: Date.now(), end: 0, concurrent: ++inFlight }
    hits.push(hit)
    res.on('finish', () => {
      inFlight--
      hit.end = Date.now()
    })
    handle(req, res)
  })
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    kit: data.kit,
    matches: data.matches,
    newIds: data.newIds,
    hits,
    labels,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
export type MockSite = Awaited<ReturnType<typeof startMockSite>>
