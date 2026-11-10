import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { BlindGate, CapabilityRefused, ImportRefused, registerFromFiles, sha256Hex } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { exportKit, standardFamily } from '@captiveorigins/onelineage-simulate'
import { importGenealogyAssistant, parseCsv } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const family = standardFamily({ seed: 3 })
const kit = family.persons.find((p) => p.id === family.kits[0])!
const exported = exportKit(family, kit.id)
const enc = new TextEncoder()
const asBytes = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))
const listName = Object.keys(exported.files).find((n) => n.includes('DNA Matches'))!
const run = (files = exported.files, extra: Partial<Parameters<typeof importGenealogyAssistant>[0]> = {}) =>
  importGenealogyAssistant({ source: 'planted', files: asBytes(files), terms, blind: new BlindGate(), ...extra })
const edit = (name: string, f: (rows: string[][]) => string[][]) => {
  const rows = f(parseCsv(exported.files[name]!))
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return { ...exported.files, [name]: '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n' }
}
const refusal = async (p: Promise<unknown>) => {
  try { await p } catch (e) { if (e instanceof ImportRefused) return e.issues.filter((i) => i.severity === 'error').map((i) => i.code); throw e }
  throw new Error('expected the import to be refused')
}

describe('importing a planted family', () => {
  it('keeps every match, every shared-match link, and where each came from', async () => {
    const r = await run()
    expect(r.kit).toBe(kit.guid)
    expect(r.observations.map((o) => o.match).sort()).toEqual(exported.matches.map((m) => m.guid).sort())
    for (const o of r.observations) {
      const truth = exported.matches.find((m) => m.guid === o.match)!
      expect(o.sharedCm).toBe(truth.cm)
      expect(o.provenance.file).toBe(listName)
      expect(o.provenance.sha256).toBe(await sha256Hex(enc.encode(exported.files[listName]!)))
      expect(o.provenance.row).toBeGreaterThan(0)
    }
    expect(r.links.length).toBeGreaterThan(0)
    expect(r.manifest).toHaveLength(Object.keys(exported.files).length)
  })

  it('keeps tree files sealed, unread, while the kit is blind (S1)', async () => {
    const r = await run()
    expect(r.sealed).toHaveLength(1)
    expect(r.sealed[0]!.reason).toBe('kit is blind')
    expect(r.notices.some((n) => n.code === 'blind.columns')).toBe(true)
  })
})

describe('the terms register is checked first (principle 8)', () => {
  it('refuses real Ancestry match data while its terms are unclear', async () => {
    await expect(run(exported.files, { source: 'ancestry' })).rejects.toBeInstanceOf(CapabilityRefused)
  })
  it('refuses a service the register has never heard of', async () => {
    const empty = registerFromFiles({})
    await expect(run(exported.files, { source: 'somewhere', terms: empty })).rejects.toBeInstanceOf(CapabilityRefused)
  })
})

describe('problems refuse the import, loudly (S4, S5)', () => {
  it('a duplicate test ID', async () => {
    const files = edit(listName, (rows) => [...rows, rows[1]!])
    expect(await refusal(run(files))).toContain('value.duplicate-id')
  })
  it('a missing column', async () => {
    const files = edit(listName, (rows) => rows.map((r) => r.filter((_, i) => rows[0]![i] !== 'Shared cM')))
    expect(await refusal(run(files))).toContain('schema.missing-column')
  })
  it('a value out of range, or a longest segment bigger than the total', async () => {
    const at = (name: string) => parseCsv(exported.files[listName]!)[0]!.indexOf(name)
    const files = edit(listName, (rows) => rows.map((r, i) => (i === 1 ? r.map((v, j) => (j === at('Shared cM') ? 'lots' : j === at('Longest Segment cM') ? '9999' : v)) : r)))
    const codes = await refusal(run(files))
    expect(codes).toContain('value.range')
  })
  it('a shared-match file for a match that is not in the list', async () => {
    const sharedName = Object.keys(exported.files).find((n) => n.startsWith('Shared Matches/'))!
    const focal = /Match ([0-9A-F-]{36})\.csv$/.exec(sharedName)![1]!
    const files = edit(listName, (rows) => rows.filter((r) => r[16] !== focal))
    expect(await refusal(run(files))).toContain('shared.unknown-match')
  })
  it('a row count that differs from what the service showed', async () => {
    expect(await refusal(run(exported.files, { expectedMatchCount: exported.matches.length + 1 }))).toContain('count.expected')
  })
  it('a file that is not valid text', async () => {
    const files = { ...asBytes(exported.files), [listName]: new Uint8Array([0xff, 0xfe, 0xfd]) }
    await expect(importGenealogyAssistant({ source: 'planted', files, terms, blind: new BlindGate() })).rejects.toBeInstanceOf(ImportRefused)
  })
  it('two match lists in one import', async () => {
    const files = { ...exported.files, [listName.replace('.csv', ' (1).csv')]: exported.files[listName]! }
    expect(await refusal(run(files))).toContain('list.count')
  })
})
