import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decisionsPath, readDecisions } from '@captiveorigins/onelineage-library'
import { createHost, stampToIso } from '../host/handlers'
import type { KeyStore } from '../host/keys'

const tmp = () => mkdtempSync(join(tmpdir(), 'onelineage-app-'))
const T0 = new Date('2026-11-10T12:00:00Z')

function setup(keys?: KeyStore) {
  const root = tmp()
  const host = createHost({ stateDir: join(root, 'state'), now: () => T0, ...(keys ? { keys } : {}) })
  return { root, host, h: host.handlers }
}

describe('first launch, on the host', () => {
  it('makes the chosen folder a library, and refuses a folder full of other files', async () => {
    const { root, h } = setup()
    const busy = join(root, 'busy')
    mkdirSync(busy)
    writeFileSync(join(busy, 'notes.txt'), 'x')
    await expect(h.chooseLibrary({ path: busy })).rejects.toThrow(/other files/)
    await expect(h.chooseLibrary({ path: 'relative/path' })).rejects.toThrow(/full folder path/)
    const s = await h.chooseLibrary({ path: join(root, 'lib') })
    expect(s.home?.path).toBe(join(root, 'lib'))
    expect(s.current?.use).toBeNull()
  })

  it('records the use once, in the decisions log, and offers no law-enforcement option', async () => {
    const { root, h } = setup()
    await h.chooseLibrary({ path: join(root, 'lib') })
    await expect(h.declareUse({ use: 'law-enforcement' as never })).rejects.toThrow(/isn’t one of the kinds/)
    const s = await h.declareUse({ use: 'personal' })
    expect(s.home?.use?.use).toBe('personal')
    await expect(h.declareUse({ use: 'wildlife-agency' })).rejects.toThrow(/asked once/)
    const log = await readDecisions(decisionsPath(join(root, 'lib')))
    expect(log.map((d) => d.kind)).toEqual(['use-declaration'])
    expect(log[0]!.data).toMatchObject({ use: 'personal', policy: 'draft 2026-11-10' })
  })

  it('needs two destinations by default, and steps down one recorded confirmation at a time', async () => {
    const { root, h } = setup()
    await h.chooseLibrary({ path: join(root, 'lib') })
    let b = await h.backupState({})
    expect(b.required).toBe(2)
    expect(b.verdict.ok).toBe(false)
    await expect(h.lowerBackupRequirement({ confirm: false })).rejects.toThrow(/its own confirmation/)
    b = await h.lowerBackupRequirement({ confirm: true })
    expect(b.required).toBe(1)
    b = await h.lowerBackupRequirement({ confirm: true })
    expect(b.required).toBe(0)
    expect(b.verdict.message).toMatch(/You chose this/)
    await expect(h.lowerBackupRequirement({ confirm: true })).rejects.toThrow(/already/)
    b = await h.raiseBackupRequirement({})
    expect(b.required).toBe(1)
    const log = await readDecisions(decisionsPath(join(root, 'lib')))
    expect(log.map((d) => [d.kind, d.data['to']])).toEqual([['backup-bypass', 1], ['backup-bypass', 2], ['backup-bypass', 1]])
  })

  it('backs up everywhere and counts only checked copies of this library', async () => {
    const { root, h } = setup()
    await h.chooseLibrary({ path: join(root, 'lib') })
    const a = join(root, 'disk-a')
    const b = join(root, 'disk-b')
    mkdirSync(a)
    mkdirSync(b)
    await expect(h.addDestination({ path: join(root, 'lib', 'exports') })).rejects.toThrow(/inside the library/)
    await expect(h.addDestination({ path: join(root, 'missing') })).rejects.toThrow(/doesn’t exist/)
    await h.addDestination({ path: a })
    await expect(h.addDestination({ path: a })).rejects.toThrow(/already/)
    let s = await h.addDestination({ path: b })
    expect(s.destinations.every((d) => d.warnings.some((w) => /same disk as the library/.test(w)))).toBe(true)
    expect(s.verdict.current).toBe(0)
    const run = await h.backUpEverywhere({})
    expect(run.results.every((r) => r.ok)).toBe(true)
    expect(run.state.verdict).toMatchObject({ ok: true, current: 2 })
    expect(run.state.destinations[0]!.lastCheckedBackup).toBe(T0.toISOString())
    s = await h.removeDestination({ path: b })
    expect(s.destinations).toHaveLength(1)
    expect(s.verdict.ok).toBe(false)
  })

  it('refuses a cloud-synced destination while there is no key store, and writes nothing there', async () => {
    const { root, h } = setup()
    await h.chooseLibrary({ path: join(root, 'lib') })
    const cloud = join(root, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
    mkdirSync(cloud, { recursive: true })
    const s = await h.addDestination({ path: cloud })
    expect(s.destinations[0]!.cloudSynced).toBe(true)
    const run = await h.backUpEverywhere({})
    expect(run.results[0]).toMatchObject({ ok: false })
    expect(run.results[0]!.problems[0]).toMatch(/Keychain/)
    expect(readdirSync(cloud)).toEqual([])
  })
})

describe('the demo family', () => {
  it('opens in its own library, with kits, matches and a blind theory page until unblinded', async () => {
    const { root, h } = setup()
    await h.chooseLibrary({ path: join(root, 'lib') })
    const s = await h.openDemo({ seed: 1 })
    expect(s.current?.demo).toBe(true)
    expect(s.home?.path).toBe(join(root, 'lib'))
    await expect(h.chooseLibrary({ path: s.current!.path })).rejects.toThrow(/demo/)

    const { kits, comparisons } = await h.kits({})
    expect(kits).toHaveLength(2)
    expect(kits.every((k) => k.blind && k.matches > 0 && k.raw && k.raw.markers > 10000)).toBe(true)
    // The two family kits are parent and child: about half the genome, compared on this Mac.
    expect(comparisons[0]!.totalCm).toBeGreaterThan(3000)

    // The chromosome browser's data: parent and child share along all 22 chromosomes.
    const seg = await h.segments({ a: kits[0]!.kit, b: kits[1]!.kit })
    expect(seg.chromosomes).toHaveLength(22)
    expect(seg.chromosomes.every((c) => c.segments.length >= 1 && c.endCm > c.startCm)).toBe(true)
    expect(seg.totalCm).toBeGreaterThan(3300)
    expect(seg.map).toMatch(/approximate/)
    await expect(h.segments({ a: kits[0]!.kit, b: 'nope' })).rejects.toThrow(/isn’t in this library/)

    const rows = await h.matches({ kit: kits[0]!.kit })
    expect(rows.length).toBe(kits[0]!.matches)
    expect(rows.every((r) => r.cm >= 8)).toBe(true)

    const blind = await h.theory({})
    expect(blind).toMatchObject({ blind: true, kit: kits[0]!.kit })
    const open = await h.unblind({ kit: kits[0]!.kit })
    if (!open || open.blind) throw new Error('expected the tree after unblinding')
    const child = open.theory.individuals.find((i) => i.id === open.question.child)!
    expect(child.parentage?.uncertainParents?.[0]?.candidates.map((c) => c.individual)).toEqual([open.question.recordedFather, open.question.biologicalFather])
    expect(child.parentage?.parents.some((p) => p.individual === open.question.recordedFather)).toBe(false)
    expect(open.recorded.individuals.find((i) => i.id === open.question.child)?.parentage?.parents.some((p) => p.individual === open.question.recordedFather)).toBe(true)
    const log = await readDecisions(decisionsPath(s.current!.path))
    expect(log.filter((d) => d.kind === 'unblind')).toHaveLength(1)

    const back = await h.openHome({})
    expect(back.current?.path).toBe(join(root, 'lib'))
    expect(back.demoAvailable).toBe(true)
  })

  it('refuses requests it does not know', async () => {
    const { host } = setup()
    await expect(host.handle('deleteEverything', {})).rejects.toThrow(/Unknown request/)
  })
})

it('reads backup folder stamps back as times', () => {
  expect(stampToIso('2026-11-10T12-00-00-000Z')).toBe('2026-11-10T12:00:00.000Z')
  expect(stampToIso('nonsense')).toBeNull()
})
