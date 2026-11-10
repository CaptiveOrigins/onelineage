import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { CapabilityRefused, ImportRefused, registerFromFiles } from '@captiveorigins/onelineage-core'
import { loadTermsRegister } from '../../core/src/node.js'
import { AlleleBook, genotypesOf, makePanel, RAW_FORMATS, standardFamily, writeRaw } from '@captiveorigins/onelineage-simulate'
import { detectRawService, importRawDna } from '../src/index.js'

const terms = loadTermsRegister(fileURLToPath(new URL('../../../terms', import.meta.url)))
const family = standardFamily({ seed: 5 })
const panel = makePanel(5, 1)
const book = new AlleleBook(panel, 5)
const tester = family.persons.find((p) => p.id === family.kits[0])!
const geno = genotypesOf(family.genomes.get(tester.id)!, panel, book, 11)
const enc = new TextEncoder()

describe('raw DNA files in each company\'s layout', () => {
  for (const format of RAW_FORMATS) {
    it(`${format}: recognised, read completely, and every call kept in order`, async () => {
      const text = writeRaw(format, panel, geno)
      expect(detectRawService(text)).toBe(format)
      const r = await importRawDna({ file: `${format}.txt`, bytes: enc.encode(text), terms })
      expect(r.details.service).toBe(format)
      expect(r.details.markers).toBe(panel.markers.length)
      expect(r.details.noCalls).toBe(geno.filter((c) => c === '--').length)
      expect(r.details.chromosomes).toEqual(Array.from({ length: 22 }, (_, i) => String(i + 1)))
      const chr1 = r.calls.get('1')!
      const expected = panel.markers.map((m, i) => ({ m, g: geno[i]! })).filter((x) => x.m.chromosome === 1)
      expect(chr1.call).toEqual(expected.map((x) => x.g))
      expect([...chr1.position]).toEqual(expected.map((x) => x.m.position))
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
    })
  }

  it('records the test details the file states, and says plainly what it doesn\'t', async () => {
    const a = await importRawDna({ file: 'a.txt', bytes: enc.encode(writeRaw('ancestry', panel, geno)), terms })
    expect(a.details.chip).toBe('AncestryDNA array version: V2.0')
    expect(a.details.converter).toBe('AncestryDNA converter version: V1.0')
    expect(a.details.generated).toBe('2020-01-15 12:00:00 UTC')
    expect(a.details.build).toBeNull()
    expect(a.notices.map((n) => n.code)).toContain('raw.no-build')
    const m = await importRawDna({ file: 'm.csv', bytes: enc.encode(writeRaw('myheritage', panel, geno)), terms })
    expect(m.details).toMatchObject({ chip: 'GSA', build: '37' })
  })
})

describe('checks before reading', () => {
  it('the terms register must allow downloading your own data from that company', async () => {
    const strict = registerFromFiles({})
    await expect(importRawDna({ file: 'a.txt', bytes: enc.encode(writeRaw('ancestry', panel, geno)), terms: strict })).rejects.toBeInstanceOf(CapabilityRefused)
  })
  it('an unrecognised layout is refused, not guessed at', async () => {
    await expect(importRawDna({ file: 'x.txt', bytes: enc.encode('id,chr,pos,gt\nrs1,1,100,AA\n'), terms })).rejects.toBeInstanceOf(ImportRefused)
  })
  it('a zipped or binary file is refused with a hint', async () => {
    await expect(importRawDna({ file: 'x.zip', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe]), terms })).rejects.toThrow(/unzipping/)
  })
  const corrupt = (from: string, to: string) => writeRaw('23andme', panel, geno).replace(from, to)
  it('a bad call, a duplicate marker or an unknown chromosome refuses the file', async () => {
    const first = panel.markers[0]!
    const codes = async (text: string) => {
      try { await importRawDna({ file: 'x.txt', bytes: enc.encode(text), terms }) } catch (e) { return (e as ImportRefused).issues.map((i) => i.code) }
      return []
    }
    expect(await codes(corrupt(`${first.rsid}\t1\t${first.position}\t${geno[0]}`, `${first.rsid}\t1\t${first.position}\tZZ`))).toContain('raw.call')
    expect(await codes(corrupt(`${first.rsid}\t1\t`, `${first.rsid}\t99\t`))).toContain('raw.chromosome')
    const second = panel.markers[1]!
    expect(await codes(corrupt(`${second.rsid}\t`, `${first.rsid}\t`))).toContain('raw.duplicate')
  })
})
