import { describe, expect, it } from 'vitest'
import { accountFor, KEYCHAIN_SERVICE, keychainStore, type SecurityRunner } from '../host/keychain'

/** A pretend Keychain: never the real one. */
function fakeKeychain() {
  const items = new Map<string, string>()
  const calls: string[][] = []
  const run: SecurityRunner = async (args) => {
    calls.push(args)
    const at = (flag: string) => args[args.indexOf(flag) + 1]!
    const key = `${at('-s')}|${at('-a')}`
    if (args[0] === 'find-generic-password') return items.has(key) ? { code: 0, stdout: items.get(key)! + '\n' } : { code: 44, stdout: '' }
    if (args[0] === 'add-generic-password') { items.set(key, at('-w')); return { code: 0, stdout: '' } }
    return { code: 1, stdout: '' }
  }
  return { run, items, calls }
}

describe('backup keys in the Keychain', () => {
  it('creates one random 32-byte key per library, stores it, and returns the same key afterwards', async () => {
    const k = fakeKeychain()
    const store = keychainStore(k.run)
    const a1 = await store.backupKey('/libs/one')
    const a2 = await store.backupKey('/libs/one')
    const b = await store.backupKey('/libs/two')
    expect(a1).toHaveLength(32)
    expect(Buffer.compare(Buffer.from(a1!), Buffer.from(a2!))).toBe(0)
    expect(Buffer.compare(Buffer.from(a1!), Buffer.from(b!))).not.toBe(0)
    expect(k.items.size).toBe(2)
  })
  it('keeps folder names out of the Keychain, and never passes a shell', async () => {
    const k = fakeKeychain()
    await keychainStore(k.run).backupKey('/Volumes/Test/someone/Ancestor Notes')
    expect(JSON.stringify([...k.items.keys()])).not.toContain('Ancestor')
    expect(k.calls[0]).toContain(KEYCHAIN_SERVICE)
    expect(k.calls[0]).toContain(accountFor('/Volumes/Test/someone/Ancestor Notes'))
  })
  it('refuses to use a key it can’t read back', async () => {
    const run: SecurityRunner = async (args) => (args[0] === 'find-generic-password' ? { code: 44, stdout: '' } : { code: 0, stdout: '' })
    await expect(keychainStore(run).backupKey('/x')).rejects.toThrow(/couldn’t be read back/)
  })
  it('reports a Keychain refusal plainly, and a damaged key', async () => {
    await expect(keychainStore(async () => ({ code: 51, stdout: '' })).backupKey('/x')).rejects.toThrow(/refused to read/)
    await expect(keychainStore(async () => ({ code: 0, stdout: 'c2hvcnQ=' })).backupKey('/x')).rejects.toThrow(/damaged/)
  })
  it('gives a recovery copy in groups of four with a checksum', async () => {
    const k = fakeKeychain()
    const store = keychainStore(k.run)
    await store.backupKey('/libs/one')
    expect(await store.recoveryCopy('/libs/one')).toMatch(/^([0-9A-F]{4} ){15}[0-9A-F]{4} {2}\(check [0-9A-F]{6}\)$/)
    await expect(store.recoveryCopy('/libs/none')).rejects.toThrow(/no backup key/)
  })
})
