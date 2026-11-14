/**
 * Backups (ADR 0005): a dated copy of the whole library at each destination, checked by restoring it.
 * Copies into cloud-synced folders are encrypted on this Mac first (AES-256-GCM), so the cloud company only
 * ever holds scrambled bytes. The key is passed in. In the app it lives in the macOS Keychain.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '@extantape/onefamily-core'
import { listFiles } from './layout.js'

const MAGIC = new TextEncoder().encode('OLENC1')

/** Folders that a sync service uploads, which need encryption. Matched on the path, case-insensitively. */
export function isCloudSynced(path: string): boolean {
  return /\/Library\/Mobile Documents\/|\/Library\/CloudStorage\/|\/Dropbox\/|\/Google ?Drive\/|\/OneDrive[^/]*\/|\/iCloud Drive\//i.test(path + '/')
}

async function key(raw: Uint8Array) {
  if (raw.length !== 32) throw new Error('backup key must be 32 bytes')
  return globalThis.crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encrypt(bytes: Uint8Array, raw: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(raw), bytes as Uint8Array<ArrayBuffer>))
  const out = new Uint8Array(MAGIC.length + iv.length + ct.length)
  out.set(MAGIC, 0); out.set(iv, MAGIC.length); out.set(ct, MAGIC.length + iv.length)
  return out
}
export async function decrypt(blob: Uint8Array, raw: Uint8Array): Promise<Uint8Array> {
  if (!MAGIC.every((b, i) => blob[i] === b)) throw new Error('not an encrypted OneFamily backup file')
  const iv = blob.slice(MAGIC.length, MAGIC.length + 12)
  return new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(raw), blob.slice(MAGIC.length + 12) as Uint8Array<ArrayBuffer>))
}

export type BackupResult = { destination: string; folder: string; files: number; encrypted: boolean; checked: boolean; problems: string[] }

/**
 * Back up the library to one destination and test-restore it. `encryptWith` is required when the destination
 * is cloud-synced; a backup there without a key is refused.
 */
export async function backupTo(library: string, destination: string, opts: { now?: Date; encryptWith?: Uint8Array } = {}): Promise<BackupResult> {
  const cloud = isCloudSynced(destination)
  if (cloud && !opts.encryptWith) throw new Error(`${destination} is synced to a cloud service; backups there must be encrypted`)
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, '-')
  const folder = join(destination, `OneFamily backup ${stamp}`)
  if (existsSync(folder)) throw new Error(`${folder} already exists`)
  const lines: string[] = []
  for (const rel of listFiles(library)) {
    const bytes = new Uint8Array(readFileSync(join(library, rel)))
    const out = opts.encryptWith ? await encrypt(bytes, opts.encryptWith) : bytes
    const target = join(folder, opts.encryptWith ? `${rel}.olenc` : rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, out)
    lines.push(`${await sha256Hex(bytes)}  ${rel}`)
  }
  writeFileSync(join(folder, 'BACKUP-MANIFEST.sha256'), lines.join('\n') + '\n')
  const problems = await checkBackup(folder, opts.encryptWith)
  return { destination, folder, files: lines.length, encrypted: Boolean(opts.encryptWith), checked: problems.length === 0, problems }
}

/** Test-restore: read every file back (decrypting if needed) and compare with the manifest. */
export async function checkBackup(folder: string, encryptWith?: Uint8Array): Promise<string[]> {
  const problems: string[] = []
  const manifest = join(folder, 'BACKUP-MANIFEST.sha256')
  if (!existsSync(manifest)) return ['no backup manifest']
  for (const line of readFileSync(manifest, 'utf8').trim().split('\n')) {
    const want = line.slice(0, 64)
    const rel = line.slice(66)
    const path = join(folder, encryptWith ? `${rel}.olenc` : rel)
    if (!existsSync(path)) { problems.push(`${rel}: missing`); continue }
    try {
      const raw = new Uint8Array(readFileSync(path))
      const bytes = encryptWith ? await decrypt(raw, encryptWith) : raw
      if ((await sha256Hex(bytes)) !== want) problems.push(`${rel}: doesn't match`)
    } catch (e) {
      problems.push(`${rel}: ${(e as Error).message}`)
    }
  }
  return problems
}

/** Restore into a new, empty folder. Never over an existing library. */
export async function restoreBackup(folder: string, into: string, encryptWith?: Uint8Array): Promise<void> {
  if (existsSync(into) && readdirSync(into).length) throw new Error(`${into} isn't empty; restores never overwrite`)
  const problems = await checkBackup(folder, encryptWith)
  if (problems.length) throw new Error(`backup failed its check: ${problems[0]}`)
  for (const line of readFileSync(join(folder, 'BACKUP-MANIFEST.sha256'), 'utf8').trim().split('\n')) {
    const rel = line.slice(66)
    const raw = new Uint8Array(readFileSync(join(folder, encryptWith ? `${rel}.olenc` : rel)))
    const target = join(into, rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, encryptWith ? await decrypt(raw, encryptWith) : raw)
  }
}

/** Keep the newest `keep` backups at a destination; older ones are removed only after the newest one has been checked. */
export async function prune(destination: string, keep: number, encryptWith?: Uint8Array): Promise<string[]> {
  const all = readdirSync(destination).filter((n) => n.startsWith('OneFamily backup ')).sort()
  const newest = all[all.length - 1]
  if (!newest || (await checkBackup(join(destination, newest), encryptWith)).length) return []
  const remove = all.slice(0, Math.max(0, all.length - keep))
  for (const n of remove) rmSync(join(destination, n), { recursive: true, force: true })
  return remove
}
