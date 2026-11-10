/**
 * Talking to the Node host. In the Mac app, through the `host_call` command (the native side starts the
 * host and passes messages). In a plain browser during `pnpm dev`, through the dev server.
 */
import type { HostApi, HostMethod } from '../host/protocol'

export const inMacApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function call<M extends HostMethod>(method: M, ...args: HostApi[M]['params'] extends Record<string, never> ? [] : [HostApi[M]['params']]): Promise<HostApi[M]['result']> {
  const params = args[0] ?? {}
  if (inMacApp) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return (await invoke('host_call', { method, params })) as HostApi[M]['result']
    } catch (e) {
      // The native side rejects with the host's message as a plain string.
      throw e instanceof Error ? e : new Error(String(e))
    }
  }
  const res = await fetch('/__host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }) })
  if (!res.ok) throw new Error(`The app’s file helper didn’t answer (HTTP ${res.status}).`)
  const body = (await res.json()) as { result?: unknown; error?: string }
  if (body.error) throw new Error(body.error)
  return body.result as HostApi[M]['result']
}

/** The system folder picker in the Mac app. Null in a browser, where the screens offer a path field instead. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inMacApp) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, multiple: false, title, canCreateDirectories: true })
  return typeof picked === 'string' ? picked : null
}
