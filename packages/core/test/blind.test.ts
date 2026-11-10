import { describe, expect, it } from 'vitest'
import { BlindGate, sha256Hex, TreeSourceSealed } from '../src/index.js'

describe('the blind-first gate (S1)', () => {
  it('every kit starts blind, and reading a tree source throws', () => {
    const gate = new BlindGate()
    expect(gate.isBlind('KIT')).toBe(true)
    expect(() => gate.requireUnblinded('KIT', 'match trees')).toThrow(TreeSourceSealed)
  })
  it('unblinding is a record with who and when, and opens only that kit', () => {
    const gate = new BlindGate()
    const u = gate.unblind('KIT', 'owner', '2026-11-10T00:00:00Z')
    expect(u).toEqual({ kit: 'KIT', by: 'owner', at: '2026-11-10T00:00:00Z' })
    expect(() => gate.requireUnblinded('KIT', 'match trees')).not.toThrow()
    expect(gate.isBlind('OTHER')).toBe(true)
  })
  it('restores earlier unblindings from the decisions log', () => {
    expect(new BlindGate([{ kit: 'KIT', by: 'owner', at: 'x' }]).isBlind('KIT')).toBe(false)
  })
})

describe('checksums (S12)', () => {
  it('SHA-256 matches a known value', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
