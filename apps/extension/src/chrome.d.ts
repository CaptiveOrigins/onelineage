/**
 * The few Chrome extension APIs this extension uses, typed by hand so there's no extra dependency. Storage APIs
 * are left out on purpose: the extension stores nothing, and a test checks the source and the build for them.
 */
declare namespace chrome {
  type Event<F extends (...args: never[]) => unknown> = { addListener(f: F): void; removeListener(f: F): void }
  namespace runtime {
    type MessageSender = { id?: string; url?: string; tab?: unknown }
    interface Port {
      name: string
      sender?: MessageSender
      postMessage(message: unknown): void
      disconnect(): void
      onMessage: Event<(message: unknown, port: Port) => void>
      onDisconnect: Event<(port: Port) => void>
    }
    const id: string
    const lastError: { message?: string } | undefined
    function getURL(path: string): string
    function connectNative(application: string): Port
    function connect(info?: { name?: string }): Port
    const onConnect: Event<(port: Port) => void>
  }
  namespace action {
    const onClicked: Event<(tab: tabs.Tab) => void>
    function setBadgeText(details: { text: string }): Promise<void>
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>
    function setTitle(details: { title: string }): Promise<void>
  }
  namespace sidePanel {
    function setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>
    function open(options: { windowId: number }): Promise<void>
  }
  namespace tabs {
    type Tab = { id?: number; url?: string; windowId: number; status?: string; active: boolean }
    function create(props: { url: string; active?: boolean }): Promise<Tab>
    function update(tabId: number, props: { url: string }): Promise<Tab>
    function get(tabId: number): Promise<Tab>
    function query(q: { active?: boolean; lastFocusedWindow?: boolean }): Promise<Tab[]>
    function remove(tabId: number): Promise<void>
    const onUpdated: Event<(tabId: number, change: { status?: string; url?: string }, tab: Tab) => void>
    const onRemoved: Event<(tabId: number) => void>
  }
  namespace scripting {
    function executeScript<R>(injection: { target: { tabId: number }; func: (...args: never[]) => R; args?: unknown[] }): Promise<{ result?: R }[]>
  }
  namespace commands {
    const onCommand: Event<(command: string, tab?: tabs.Tab) => void>
  }
}
