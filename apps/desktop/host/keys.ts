/**
 * Where encryption keys live. ADR 0005 puts them in the macOS Keychain; that isn't built in v0. This is the
 * seam it plugs into. The stub has no keys, so anything that needs one (a backup to a cloud-synced folder)
 * is refused with a plain reason rather than written unencrypted or with a key that would be lost.
 */
export interface KeyStore {
  /** Shown in Settings, so the person knows what's in place. */
  readonly description: string
  /** The 32-byte key for this library's encrypted backups, or null if there's none. */
  backupKey(library: string): Promise<Uint8Array | null>
}

export const noKeyStore: KeyStore = {
  description: 'Not built yet. Keys will live in the macOS Keychain; until then, backups to cloud-synced folders are refused.',
  async backupKey() {
    return null
  },
}
