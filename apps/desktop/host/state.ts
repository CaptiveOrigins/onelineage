/**
 * The app's own small state file, kept beside the cache (ADR 0005), never in the library: which folder is
 * the user's library, where the demo is, and the backup destinations chosen for each library on this Mac.
 * Written atomically, so a crash leaves the old file or the new one.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type AppState = {
  version: 1
  home: string | null
  demo: string | null
  /** The library on screen. */
  current: string | null
  destinations: Record<string, string[]>
}

const EMPTY: AppState = { version: 1, home: null, demo: null, current: null, destinations: {} }

export const defaultStateDir = () => join(homedir(), 'Library', 'Application Support', 'OneLineage')

export function readState(dir: string): AppState {
  const path = join(dir, 'app-state.json')
  if (!existsSync(path)) return { ...EMPTY, destinations: {} }
  const s = JSON.parse(readFileSync(path, 'utf8')) as AppState
  if (s.version !== 1) throw new Error(`app-state.json is version ${String(s.version)}, which this version doesn't read`)
  return s
}

export function writeState(dir: string, s: AppState): void {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'app-state.json')
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n')
  renameSync(tmp, path)
}
