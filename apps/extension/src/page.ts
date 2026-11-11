/**
 * Reading a page, and deciding whether a run may go on. The extension reads only a page's own export block
 * and its declared kind, never the page's text, and it never writes into a page.
 */
import { isLoopbackOrigin, type PageSnapshot, type StopReason } from './wire'

export const EXPORT_ELEMENT_ID = 'onelineage-export'

/**
 * Runs inside the page through chrome.scripting.executeScript. It must stay self-contained (Chrome sends
 * only its source), and it only reads.
 */
export function readPageInPage(): PageSnapshot {
  return {
    url: location.href,
    kind: document.body?.dataset['pageKind'] ?? null,
    exportText: document.getElementById('onelineage-export')?.textContent ?? null,
  }
}

/** The same reading, from HTML text. Used by tests against the mock site, where there's no browser. */
export function snapshotFromHtml(url: string, html: string): PageSnapshot {
  const kind = /<body[^>]*\sdata-page-kind="([a-z-]+)"/.exec(html)?.[1] ?? null
  const exportText = new RegExp(`<script type="application/json" id="${EXPORT_ELEMENT_ID}">([\\s\\S]*?)</script>`).exec(html)?.[1] ?? null
  return { url, kind, exportText }
}

export type Verdict = { go: true; kind: 'match-list' | 'match'; data: Record<string, unknown> } | { go: false; reason: StopReason; detail: string }

/** Stop at anything that looks like a challenge, a sign-in page or an error. Only a known page with a readable export goes on. */
export function judgePage(snap: PageSnapshot, runOrigin: string): Verdict {
  let origin: string
  let path = ''
  try {
    const u = new URL(snap.url)
    origin = u.origin
    path = u.pathname
  } catch {
    return { go: false, reason: 'error', detail: 'The page address couldn’t be read.' }
  }
  if (origin !== runOrigin || !isLoopbackOrigin(origin)) return { go: false, reason: 'error', detail: 'The page left the site the run was started for.' }
  if (snap.kind === 'challenge' || /captcha|challenge|verify/i.test(path)) return { go: false, reason: 'challenge', detail: 'The site asked to check this is a person. Stopped there.' }
  if (snap.kind === 'sign-in' || /sign-?in|log-?in/i.test(path)) return { go: false, reason: 'sign-in', detail: 'The site asked to sign in. Stopped there.' }
  if (snap.kind !== 'match-list' && snap.kind !== 'match') return { go: false, reason: 'error', detail: `The page wasn’t a match page (${snap.kind ?? 'unmarked'}). Stopped there.` }
  if (!snap.exportText) return { go: false, reason: 'error', detail: 'The page had no export. Stopped there.' }
  try {
    const data = JSON.parse(snap.exportText) as Record<string, unknown>
    if (!data || typeof data !== 'object') throw new Error()
    return { go: true, kind: snap.kind, data }
  } catch {
    return { go: false, reason: 'error', detail: 'The page’s export couldn’t be read. Stopped there.' }
  }
}
