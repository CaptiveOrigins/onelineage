import { describe, expect, it } from 'vitest'
import { CapabilityRefused, ImportRefused, registerFromFiles } from '@captiveorigins/onelineage-core'
import { importCollectedPages } from '../src/index.js'

const enc = new TextEncoder()
const page = (match: Record<string, unknown>, kit = 'KIT-1') => enc.encode(JSON.stringify({ kind: 'match', kit, match }))
const good = { id: 'ABCDEF-123', name: 'Made Up', sharedCm: 42, segments: 2, longestCm: 30 }
const terms = registerFromFiles({})

describe('pages the extension collected', () => {
  it('reads match pages from the mock site into observations with provenance', async () => {
    const obs = await importCollectedPages({ site: 'mocksite', kit: 'KIT-1', terms, files: { 'pages/0001.json': page(good), 'pages/0002.json': enc.encode(JSON.stringify({ kind: 'match-list', kit: 'KIT-1' })) } })
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ service: 'mocksite', match: 'ABCDEF-123', sharedCm: 42 })
    expect(obs[0]!.provenance.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('refuses any real service whose terms do not allow it', async () => {
    await expect(importCollectedPages({ site: 'ancestry', kit: 'KIT-1', terms, files: {} })).rejects.toBeInstanceOf(CapabilityRefused)
  })
  it('refuses the whole set on a bad value, another kit or a duplicate', async () => {
    const run = (files: Record<string, Uint8Array>) => importCollectedPages({ site: 'mocksite', kit: 'KIT-1', terms, files })
    await expect(run({ 'pages/0001.json': page({ ...good, longestCm: 99 }) })).rejects.toBeInstanceOf(ImportRefused)
    await expect(run({ 'pages/0001.json': page(good, 'OTHER') })).rejects.toBeInstanceOf(ImportRefused)
    await expect(run({ 'pages/0001.json': page(good), 'pages/0002.json': page(good) })).rejects.toBeInstanceOf(ImportRefused)
  })
})
