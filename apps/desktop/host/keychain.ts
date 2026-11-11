/**
 * Backup keys in the macOS Keychain (ADR 0005), through Apple's `security` tool. Each library gets its own
 * random 32-byte key, created the first time it's needed. The key never touches a file, a log or the
 * library, and the window only ever sees a recovery copy, when the person asks for one.
 *
 * Stated limit: the Keychain item is created by the `security` tool, so the access list trusts that tool
 * rather than OneLineage's own signature. Another program running as the same user could ask the tool
 * for it. Moving the item to an access list tied to the signed app comes with app signing, before any
 * release (task K338 and the signing decision).
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { KeyStore } from './keys'

export const KEYCHAIN_SERVICE = 'OneLineage backup key'

/** Runs `security` with arguments and no shell. Injected so tests never touch the real Keychain. */
export type SecurityRunner = (args: string[]) => Promise<{ code: number; stdout: string }>

export const realSecurity: SecurityRunner = (args) =>
  new Promise((resolve) => {
    execFile('/usr/bin/security', args, { timeout: 15000 }, (err, stdout) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? ((err as unknown as { code: number }).code) : 1) : 0
      resolve({ code, stdout: String(stdout) })
    })
  })

/** The Keychain account for a library: a hash of its path, so no folder names end up in the Keychain. */
export const accountFor = (library: string) => createHash('sha256').update(library).digest('hex').slice(0, 32)

const ITEM_NOT_FOUND = 44

export function keychainStore(run: SecurityRunner = realSecurity): KeyStore & { recoveryCopy(library: string): Promise<string> } {
  const read = async (library: string): Promise<Uint8Array | null> => {
    const r = await run(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', accountFor(library), '-w'])
    if (r.code === ITEM_NOT_FOUND) return null
    if (r.code !== 0) throw new Error(`the Keychain refused to read the backup key (security exit ${r.code})`)
    const key = Uint8Array.from(Buffer.from(r.stdout.trim(), 'base64'))
    if (key.length !== 32) throw new Error('the backup key in the Keychain is damaged')
    return key
  }
  return {
    description: 'macOS Keychain: one key per library, created when first needed. Ask for a recovery copy and keep it somewhere safe.',
    available: true,
    async backupKey(library) {
      const existing = await read(library)
      if (existing) return existing
      const key = globalThis.crypto.getRandomValues(new Uint8Array(32))
      const r = await run(['add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', accountFor(library), '-l', 'OneLineage backup key', '-j', 'Encrypts this OneLineage library’s backups to cloud-synced folders. Losing it makes those backups unreadable.', '-w', Buffer.from(key).toString('base64')])
      if (r.code !== 0) throw new Error(`the Keychain refused to store a new backup key (security exit ${r.code})`)
      // Read it back, so a key that didn't stick is never used to encrypt anything.
      const check = await read(library)
      if (!check || Buffer.compare(Buffer.from(check), Buffer.from(key)) !== 0) throw new Error('the new backup key couldn’t be read back from the Keychain, so it wasn’t used')
      return key
    },
    /** A copy to print or write down: the key in groups of four, plus a short checksum to catch typing mistakes. */
    async recoveryCopy(library) {
      const key = await read(library)
      if (!key) throw new Error('this library has no backup key yet')
      const hex = Buffer.from(key).toString('hex').toUpperCase()
      const sum = createHash('sha256').update(key).digest('hex').slice(0, 6).toUpperCase()
      return `${hex.match(/.{4}/g)!.join(' ')}  (check ${sum})`
    },
  }
}
