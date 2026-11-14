/**
 * The library: a folder the user chooses, holding everything that matters as plain files (ADR 0005).
 *
 *   library.json          format version and creation date
 *   exports/<YYYY-MM-DD> <service> <label>/   frozen exports, read-only, with MANIFEST.sha256
 *   decisions.jsonl       the decisions log
 *
 * The database is a cache kept outside the library, and can always be rebuilt from it.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { sha256Hex } from '@extantape/onefamily-core'

export const LIBRARY_FORMAT = 1
export type LibraryInfo = { format: number; created: string }

export function initLibrary(dir: string, now = new Date()): LibraryInfo {
  const info: LibraryInfo = { format: LIBRARY_FORMAT, created: now.toISOString() }
  mkdirSync(join(dir, 'exports'), { recursive: true })
  const path = join(dir, 'library.json')
  if (existsSync(path)) return openLibrary(dir)
  writeFileSync(path, JSON.stringify(info, null, 2) + '\n')
  return info
}

export function openLibrary(dir: string): LibraryInfo {
  const path = join(dir, 'library.json')
  if (!existsSync(path)) throw new Error(`${dir} isn't a OneFamily library (no library.json)`)
  const info = JSON.parse(readFileSync(path, 'utf8')) as LibraryInfo
  if (info.format !== LIBRARY_FORMAT) throw new Error(`library format ${info.format} isn't one this version reads (${LIBRARY_FORMAT})`)
  return info
}

export const decisionsPath = (dir: string) => join(dir, 'decisions.jsonl')

const SAFE = /^[A-Za-z0-9 ._()-]+$/

/**
 * Store an export, frozen: files are written once, a SHA-256 manifest is added, and everything is made
 * read-only. A folder that already exists is never overwritten.
 */
export async function storeExport(dir: string, opts: { date: string; service: string; label: string; files: Readonly<Record<string, Uint8Array>> }): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error('export date must be YYYY-MM-DD')
  const name = `${opts.date} ${opts.service} ${opts.label}`
  if (!SAFE.test(name)) throw new Error(`"${name}" has characters that aren't safe in a folder name`)
  const folder = join(dir, 'exports', name)
  if (existsSync(folder)) throw new Error(`exports/${name} already exists; stored exports are never replaced`)
  const lines: string[] = []
  for (const [rel, bytes] of Object.entries(opts.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (rel.split('/').some((p) => p === '..' || p === '')) throw new Error(`unsafe file path "${rel}"`)
    const path = join(folder, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
    chmodSync(path, 0o444)
    lines.push(`${await sha256Hex(bytes)}  ${rel}`)
  }
  const manifest = join(folder, 'MANIFEST.sha256')
  writeFileSync(manifest, lines.join('\n') + '\n')
  chmodSync(manifest, 0o444)
  return folder
}

/** Every file under a folder, as relative paths, sorted. */
export function listFiles(root: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(root, p))
    }
  }
  if (existsSync(root)) walk(root)
  return out.sort()
}

/** Check every stored export against its manifest. Returns the problems found; empty means intact. */
export async function verifyExports(dir: string): Promise<string[]> {
  const problems: string[] = []
  const root = join(dir, 'exports')
  if (!existsSync(root)) return problems
  for (const name of readdirSync(root).sort()) {
    const folder = join(root, name)
    const mpath = join(folder, 'MANIFEST.sha256')
    if (!existsSync(mpath)) { problems.push(`${name}: no manifest`); continue }
    const listed = new Map(readFileSync(mpath, 'utf8').trim().split('\n').map((l) => [l.slice(66), l.slice(0, 64)] as const))
    for (const rel of listFiles(folder).filter((f) => f !== 'MANIFEST.sha256')) {
      const want = listed.get(rel)
      if (!want) problems.push(`${name}/${rel}: not in the manifest`)
      else if ((await sha256Hex(readFileSync(join(folder, rel)))) !== want) problems.push(`${name}/${rel}: changed since it was stored`)
      listed.delete(rel)
    }
    for (const rel of listed.keys()) problems.push(`${name}/${rel}: missing`)
  }
  return problems
}
