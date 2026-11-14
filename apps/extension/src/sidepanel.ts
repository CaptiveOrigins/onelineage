/**
 * The side panel: the only place match details are shown. They never go into the website's page, where other
 * extensions could read them. It holds only what the service worker last sent, in memory.
 */
import type { PanelState } from './core'
import type { StopReason } from './wire'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const port = chrome.runtime.connect({ name: 'panel' })

const REASONS: Record<StopReason, string> = {
  finished: 'Finished.',
  'stopped-in-app': 'Stopped in OneFamily.',
  challenge: 'Stopped: the site showed a challenge.',
  'sign-in': 'Stopped: the site asked to sign in.',
  error: 'Stopped: something went wrong.',
  'daily-cap': 'Stopped: today’s page cap was reached.',
  'grant-ended': 'Stopped: the run’s time was up.',
  disconnected: 'Stopped: OneFamily closed the connection.',
}

function render(s: PanelState) {
  $('connection').textContent = s.connected ? 'Connected to OneFamily.' : (s.connection ?? 'Not connected.')
  $<HTMLButtonElement>('connect').hidden = s.connected
  $('privacy').hidden = !s.privacy
  for (const id of ['summarise', 'hand-over', 'new-matches']) $<HTMLButtonElement>(id).disabled = !s.connected || s.waiting

  const run = $('run')
  if (!s.run) run.textContent = 'No run yet. Runs are started in the app.'
  else run.textContent = s.run.state === 'running'
    ? `${s.run.kind === 'labels' ? 'Labelling' : 'Collecting'}: ${s.run.pages} pages so far, one at a time, with a pause of 30 to 60 seconds between pages.`
    : `${s.run.reason ? REASONS[s.run.reason] : 'Stopped.'} ${s.run.pages} pages. ${s.run.detail ?? ''}`

  const box = $('summary')
  box.hidden = !s.summary
  if (s.summary) {
    $('s-match').textContent = s.summary.match
    $('s-line').textContent = s.summary.line
    $('s-confidence').textContent = s.summary.confidence
    $('s-theories').textContent = s.summary.theories.length ? s.summary.theories.join(', ') : 'None yet'
    $('s-expires').textContent = new Date(s.summary.expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  $('notice').textContent = s.notice ?? ''
}

port.onMessage.addListener((m) => {
  const msg = m as { type?: string; state?: PanelState }
  if (msg.type === 'state' && msg.state) render(msg.state)
})
$('connect').addEventListener('click', () => port.postMessage({ action: 'connect' }))
$('summarise').addEventListener('click', () => port.postMessage({ action: 'summarise' }))
$('hand-over').addEventListener('click', () => port.postMessage({ action: 'handOver' }))
$('new-matches').addEventListener('click', () => port.postMessage({ action: 'newMatches' }))
