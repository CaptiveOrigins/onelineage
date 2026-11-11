import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MatchObservation } from '@captiveorigins/onelineage-core'
import {
  appendDecision, backupTo, backupVerdict, buildCache, cacheDigest, canLowerBypass, checkBackup, decisionsPath, DecisionLogBroken, decrypt, encrypt,
  initLibrary, isCloudSynced, listFiles, openLibrary, prune, readDecisions, restoreBackup, storeExport, verifyExports,
} from '../src/index.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'onelineage-'))
const enc = new TextEncoder()
const key = new Uint8Array(32).fill(7)

async function sampleLibrary() {
  const dir = tmp()
  initLibrary(dir, new Date('2026-11-10T00:00:00Z'))
  await storeExport(dir, { date: '2026-11-10', service: 'planted', label: 'kit A', files: { 'list.csv': enc.encode('a,b\n1,2\n'), 'Shared Matches/x.csv': enc.encode('x\n') } })
  await appendDecision(decisionsPath(dir), { by: 'owner', kind: 'unblind', data: { kit: 'A' }, at: '2026-11-10T01:00:00Z' })
  return dir
}

describe('the library folder', () => {
  it('starts with a format version, and refuses a folder that is not a library', () => {
    const dir = tmp()
    expect(initLibrary(dir).format).toBe(1)
    expect(openLibrary(dir).format).toBe(1)
    expect(() => openLibrary(tmp())).toThrow(/isn't a OneLineage library/)
  })

  it('stores exports frozen: read-only, with a manifest, and never replaced', async () => {
    const dir = await sampleLibrary()
    const folder = join(dir, 'exports', '2026-11-10 planted kit A')
    expect(statSync(join(folder, 'list.csv')).mode & 0o222).toBe(0)
    expect(await verifyExports(dir)).toEqual([])
    await expect(storeExport(dir, { date: '2026-11-10', service: 'planted', label: 'kit A', files: {} })).rejects.toThrow(/never replaced/)
    await expect(storeExport(dir, { date: '2026-11-10', service: 'planted', label: 'bad', files: { '../escape': enc.encode('') } })).rejects.toThrow(/unsafe/)
  })

  it('notices a stored file that was changed', async () => {
    const dir = await sampleLibrary()
    const file = join(dir, 'exports', '2026-11-10 planted kit A', 'list.csv')
    chmodSync(file, 0o644)
    writeFileSync(file, 'tampered')
    expect((await verifyExports(dir))[0]).toMatch(/changed since it was stored/)
  })
})

describe('frozen exports, missing and extra files (test audit 2026-11-10)', () => {
  it('reports a stored file that was removed, and one that was added', async () => {
    const dir = await sampleLibrary()
    const folder = join(dir, 'exports', '2026-11-10 planted kit A')
    chmodSync(folder, 0o755)
    const { rmSync } = await import('node:fs')
    chmodSync(join(folder, 'list.csv'), 0o644)
    rmSync(join(folder, 'list.csv'))
    writeFileSync(join(folder, 'extra.csv'), 'x')
    const problems = await verifyExports(dir)
    expect(problems.some((p) => /list\.csv: missing/.test(p))).toBe(true)
    expect(problems.some((p) => /extra\.csv: not in the manifest/.test(p))).toBe(true)
  })
})

describe('the decisions log', () => {
  it('chains entries and reads them back', async () => {
    const path = join(tmp(), 'decisions.jsonl')
    await appendDecision(path, { by: 'owner', kind: 'unblind', data: { kit: 'A' } })
    await appendDecision(path, { by: 'owner', kind: 'backup-bypass', data: { level: 1 } })
    const all = await readDecisions(path)
    expect(all.map((d) => d.seq)).toEqual([1, 2])
    expect(all[1]!.prev).toBe(all[0]!.hash)
  })

  it('refuses to go on after an edit or a deleted line', async () => {
    const path = join(tmp(), 'decisions.jsonl')
    for (let i = 0; i < 3; i++) await appendDecision(path, { by: 'owner', kind: 'identity-link', data: { n: i } })
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    writeFileSync(path, lines[0]!.replace('"n":0', '"n":9') + '\n' + lines.slice(1).join('\n') + '\n')
    await expect(readDecisions(path)).rejects.toBeInstanceOf(DecisionLogBroken)
    writeFileSync(path, [lines[0], lines[2]].join('\n') + '\n')
    await expect(appendDecision(path, { by: 'owner', kind: 'x', data: {} })).rejects.toThrow(/expected entry 2/)
  })
})

describe('backups', () => {
  it('a plain backup is checked by reading it back, and restores into a new folder only', async () => {
    const lib = await sampleLibrary()
    const dest = tmp()
    const r = await backupTo(lib, dest, { now: new Date('2026-11-10T02:00:00Z') })
    expect(r).toMatchObject({ checked: true, encrypted: false, files: listFiles(lib).length })
    const into = join(tmp(), 'restored')
    await restoreBackup(r.folder, into)
    expect(listFiles(into)).toEqual(listFiles(lib))
    await expect(restoreBackup(r.folder, lib)).rejects.toThrow(/never overwrite/)
  })

  it('cloud-synced destinations must be encrypted; the encrypted copy holds no readable text', async () => {
    expect(isCloudSynced('/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Backups')).toBe(true)
    expect(isCloudSynced('/Users/x/Dropbox/Backups')).toBe(true)
    expect(isCloudSynced('/Volumes/External/Backups')).toBe(false)
    const lib = await sampleLibrary()
    const cloud = join(tmp(), 'Dropbox', 'OneLineage')
    mkdirSync(cloud, { recursive: true })
    await expect(backupTo(lib, cloud)).rejects.toThrow(/must be encrypted/)
    const r = await backupTo(lib, cloud, { encryptWith: key })
    expect(r.checked).toBe(true)
    const stored = readFileSync(join(r.folder, 'exports', '2026-11-10 planted kit A', 'list.csv.olenc'))
    expect(stored.includes(Buffer.from('a,b'))).toBe(false)
    expect(await checkBackup(r.folder, new Uint8Array(32).fill(8))).not.toEqual([])
  })

  it('encryption round-trips, and a wrong key fails', async () => {
    const blob = await encrypt(enc.encode('family data'), key)
    expect(new TextDecoder().decode(await decrypt(blob, key))).toBe('family data')
    await expect(decrypt(blob, new Uint8Array(32))).rejects.toThrow()
  })

  it('pruning keeps the newest and only after it checks out', async () => {
    const lib = await sampleLibrary()
    const dest = tmp()
    for (const h of ['01', '02', '03']) await backupTo(lib, dest, { now: new Date(`2026-11-10T${h}:00:00Z`) })
    expect(await prune(dest, 2)).toHaveLength(1)
    expect(existsSync(dest)).toBe(true)
  })
})

describe('the two-backup rule', () => {
  const now = new Date('2026-11-10T00:00:00Z')
  const recent = '2026-11-01T00:00:00Z'
  const old = '2026-09-01T00:00:00Z'
  it('needs two current backups by default', () => {
    expect(backupVerdict([{ destination: 'a', lastCheckedBackup: recent }], 0, now).ok).toBe(false)
    expect(backupVerdict([{ destination: 'a', lastCheckedBackup: recent }, { destination: 'b', lastCheckedBackup: recent }], 0, now).ok).toBe(true)
    expect(backupVerdict([{ destination: 'a', lastCheckedBackup: recent }, { destination: 'b', lastCheckedBackup: old }], 0, now).current).toBe(1)
  })
  it('going down takes one confirmation per step; going up takes none', () => {
    expect(canLowerBypass(0, 1, 1)).toBe(true)
    expect(canLowerBypass(0, 2, 1)).toBe(false)
    expect(canLowerBypass(0, 2, 2)).toBe(true)
    expect(canLowerBypass(2, 0, 0)).toBe(true)
    expect(backupVerdict([], 2, now).message).toMatch(/You chose this/)
  })
})

describe('the cache can always be rebuilt (S11)', () => {
  const obs: MatchObservation = {
    service: 'planted', kit: 'K', match: 'M', name: 'Made Up', sharedCm: 40, unweightedCm: 40, longestCm: 20, segments: 2, side: 'maternal',
    treeStatus: 'No trees', treeSize: null, matchDate: '2020-01-01', provenance: { file: 'list.csv', sha256: 'a'.repeat(64), row: 1 },
  }
  it('a rebuild from the same inputs has the same digest; different inputs differ', async () => {
    const a = await cacheDigest(buildCache(':memory:', { observations: [obs], links: [], decisions: [] }))
    const b = await cacheDigest(buildCache(':memory:', { observations: [obs], links: [], decisions: [] }))
    const c = await cacheDigest(buildCache(':memory:', { observations: [{ ...obs, sharedCm: 41 }], links: [], decisions: [] }))
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })
})
