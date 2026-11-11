/**
 * The service worker: plugs Chrome into core.ts. It opens one native messaging port to the app and keeps it
 * open, which also keeps this worker alive while the app is linked. It registers no external message
 * handlers, and the manifest's externally_connectable lets no other extension or web page reach it.
 */
import { createCore, type PanelState } from './core'
import { readPageInPage } from './page'
import { NATIVE_HOST_NAME, isLoopbackOrigin, type ExtensionMessage, type PageSnapshot } from './wire'

const panels = new Set<chrome.runtime.Port>()
let native: chrome.runtime.Port | null = null
let runTab: number | null = null
let last: PanelState | null = null

const core = createCore({
  sendNative: (m: ExtensionMessage) => native?.postMessage(m),
  browser: { visit, postLabel, activePage },
  onPanel: (s) => {
    last = s
    for (const p of panels) p.postMessage({ type: 'state', state: s })
  },
  setBadge: (on) => {
    void chrome.action.setBadgeText({ text: on ? 'P' : '' })
    void chrome.action.setBadgeBackgroundColor({ color: '#5b4a3f' })
    void chrome.action.setTitle({ title: on ? 'OneLineage: privacy is on. Click to turn it off in the app.' : 'OneLineage: privacy is off. Click to turn it on in the app.' })
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
  newId: () => crypto.randomUUID(),
})

function connect() {
  if (native) return
  native = chrome.runtime.connectNative(NATIVE_HOST_NAME)
  native.onMessage.addListener((m) => void core.onNative(m))
  native.onDisconnect.addListener(() => {
    const why = chrome.runtime.lastError?.message ?? null
    native = null
    core.disconnected(why && /not found/i.test(why) ? 'The OneLineage native host isn’t installed. See the app’s Extension screen.' : 'Not connected to OneLineage. Open the app, then press Connect.')
  })
  core.connected()
}

/** Loads a page in the run's own tab, one at a time, and reads it. Refuses anything not on 127.0.0.1. */
async function visit(url: string): Promise<PageSnapshot> {
  if (!isLoopbackOrigin(new URL(url).origin)) throw new Error('Only the local mock site can be visited.')
  if (runTab !== null) {
    try {
      await chrome.tabs.get(runTab)
    } catch {
      runTab = null
    }
  }
  const tab = runTab === null ? await chrome.tabs.create({ url, active: false }) : await chrome.tabs.update(runTab, { url })
  runTab = tab.id ?? null
  if (runTab === null) throw new Error('Chrome didn’t open a tab.')
  await loaded(runTab)
  return read(runTab)
}

function loaded(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(on)
      reject(new Error('The page took over 30 seconds to load.'))
    }, 30_000)
    const on = (id: number, change: { status?: string }) => {
      if (id !== tabId || change.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(on)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(on)
  })
}

async function read(tabId: number): Promise<PageSnapshot> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: readPageInPage })
  if (!r?.result) throw new Error('The page couldn’t be read.')
  return r.result
}

async function postLabel(url: string, label: string): Promise<boolean> {
  if (!isLoopbackOrigin(new URL(url).origin)) return false
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }), credentials: 'include' })
  return res.ok
}

async function activePage(): Promise<PageSnapshot | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id || !tab.url || !isLoopbackOrigin(new URL(tab.url).origin)) return null
  return read(tab.id)
}

// The toolbar button toggles privacy in the app. The side panel opens from Chrome's side panel menu or the shortcut.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
chrome.action.onClicked.addListener(() => {
  connect()
  core.privacyButton()
})
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel' && tab) void chrome.sidePanel.open({ windowId: tab.windowId })
})
chrome.tabs.onRemoved.addListener((id) => {
  if (id === runTab) runTab = null
})

// Only our own side panel page may connect. Content scripts and other extensions can't (there are none, and
// externally_connectable is empty), and this check refuses anything else that tries.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel' || port.sender?.id !== chrome.runtime.id || !port.sender.url?.startsWith(chrome.runtime.getURL('')) || port.sender.tab) {
    port.disconnect()
    return
  }
  panels.add(port)
  port.onDisconnect.addListener(() => panels.delete(port))
  port.onMessage.addListener((m) => {
    const action = (m as { action?: string }).action
    if (action === 'connect') connect()
    else if (action === 'summarise') void core.summariseActiveMatch()
    else if (action === 'handOver') void core.handOverActivePage()
    else if (action === 'newMatches') void core.askNewMatches()
  })
  port.postMessage({ type: 'state', state: last ?? core.panelState() })
})

setInterval(() => core.sweep(), 1000)
connect()
