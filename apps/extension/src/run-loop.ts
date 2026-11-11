/**
 * A collecting run, and a label batch, at human pace. One page at a time, a 30–60 s random pause between
 * pages, never more than the app's page budget (the daily cap), and a stop at the first challenge, sign-in
 * page or error. Every page is on the run's own origin, which is 127.0.0.1 in this version.
 */
import { judgePage } from './page'
import { HUMAN_PACE, pauseMs, type Pace } from './pacing'
import { isLoopbackOrigin, type AppMessage, type ExtensionRequestBody, type LabelInstruction, type PageSnapshot, type StopReason } from './wire'

type Response = Extract<AppMessage, { type: 'response' }>
type Ask = (m: ExtensionRequestBody) => Promise<Response>

export type RunDeps = {
  /** Loads one page and reads it. Only ever called again after the previous call finished. */
  visit: (url: string) => Promise<PageSnapshot>
  ask: Ask
  sleep: (ms: number) => Promise<void>
  random: () => number
  shouldStop: () => boolean
  onProgress?: (pages: number) => void
  pace?: Pace
}

export type RunResult = { reason: StopReason; pages: number; detail: string }

export async function runCollection(p: { runId: string; kit: string; origin: string; startPath: string; maxPages: number }, d: RunDeps): Promise<RunResult> {
  if (!isLoopbackOrigin(p.origin)) return { reason: 'error', pages: 0, detail: 'This version visits only the local mock site on 127.0.0.1.' }
  const pace = d.pace ?? HUMAN_PACE
  let pages = 0
  const paths = new Map<string, string>()

  /** One paced visit. Returns null to go on, or why the run stopped. */
  const step = async (path: string): Promise<{ stop: RunResult } | { data: Record<string, unknown>; kind: string }> => {
    if (d.shouldStop()) return { stop: { reason: 'stopped-in-app', pages, detail: 'Stopped in OneLineage.' } }
    if (pages >= p.maxPages) return { stop: { reason: 'daily-cap', pages, detail: `Reached this run’s budget of ${p.maxPages} pages.` } }
    if (pages > 0) await d.sleep(pauseMs(d.random, pace))
    if (d.shouldStop()) return { stop: { reason: 'stopped-in-app', pages, detail: 'Stopped in OneLineage.' } }
    const url = new URL(path, p.origin).href
    if (new URL(url).origin !== p.origin) return { stop: { reason: 'error', pages, detail: 'A link pointed off the site. Stopped there.' } }
    let snap: PageSnapshot
    try {
      snap = await d.visit(url)
    } catch (e) {
      return { stop: { reason: 'error', pages, detail: `The page didn’t load: ${(e as Error).message}` } }
    }
    pages++
    d.onProgress?.(pages)
    const v = judgePage(snap, p.origin)
    if (!v.go) return { stop: { reason: v.reason, pages, detail: v.detail } }
    const r = await d.ask({ type: 'request', request: 'pageExport', kit: p.kit, runId: p.runId, page: snap })
    if (!r.ok) return { stop: { reason: 'error', pages, detail: `OneLineage didn’t take the page: ${r.error}` } }
    return { data: v.data, kind: v.kind }
  }

  // The match list, page by page.
  let next: string | null = p.startPath
  while (next) {
    const s = await step(next)
    if ('stop' in s) return s.stop
    if (s.kind !== 'match-list') return { reason: 'error', pages, detail: 'Expected the match list. Stopped there.' }
    for (const m of (s.data['matches'] as { id?: unknown; path?: unknown }[] | undefined) ?? [])
      if (typeof m?.id === 'string' && typeof m.path === 'string') paths.set(m.id, m.path)
    next = typeof s.data['next'] === 'string' ? (s.data['next'] as string) : null
  }

  // Then the new matches the app asks for, one page each.
  const r = await d.ask({ type: 'request', request: 'newMatchesToFetch', kit: p.kit, runId: p.runId })
  if (!r.ok) return { reason: 'error', pages, detail: `OneLineage didn’t send the matches to fetch: ${r.error}` }
  const ids = ((r.data as { matches?: unknown }).matches as string[] | undefined) ?? []
  for (const id of ids) {
    const path = paths.get(id)
    if (!path) continue
    const s = await step(path)
    if ('stop' in s) return s.stop
  }
  return { reason: 'finished', pages, detail: `Done: ${pages} pages.` }
}

export type LabelDeps = RunDeps & { postLabel: (url: string, label: string) => Promise<boolean> }

/** An approved label batch: open each match's page, check it, then set its label. One match per paced step. */
export async function runLabels(p: { kit: string; origin: string; labels: LabelInstruction[] }, d: LabelDeps): Promise<RunResult & { applied: number }> {
  if (!isLoopbackOrigin(p.origin)) return { reason: 'error', pages: 0, applied: 0, detail: 'This version labels only on the local mock site on 127.0.0.1.' }
  const pace = d.pace ?? HUMAN_PACE
  let pages = 0
  let applied = 0
  for (const l of p.labels) {
    if (d.shouldStop()) return { reason: 'stopped-in-app', pages, applied, detail: 'Stopped in OneLineage.' }
    if (pages > 0) await d.sleep(pauseMs(d.random, pace))
    const url = new URL(`/kits/${encodeURIComponent(p.kit)}/matches/${encodeURIComponent(l.match)}`, p.origin).href
    let snap: PageSnapshot
    try {
      snap = await d.visit(url)
    } catch (e) {
      return { reason: 'error', pages, applied, detail: `The page didn’t load: ${(e as Error).message}` }
    }
    pages++
    const v = judgePage(snap, p.origin)
    if (!v.go) return { reason: v.reason, pages, applied, detail: v.detail }
    if (!(await d.postLabel(`${url}/label`, l.label))) return { reason: 'error', pages, applied, detail: 'The site didn’t take a label. Stopped there.' }
    applied++
    d.onProgress?.(pages)
  }
  return { reason: 'finished', pages, applied, detail: `Done: ${applied} labels.` }
}
