import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { CAPABILITIES, CapabilityRefused, parseTermsFile, registerFromFiles, TermsParseError, TermsRegister } from '../src/index.js'
import { loadTermsRegister } from '../src/node.js'

const TERMS_DIR = fileURLToPath(new URL('../../../terms', import.meta.url))

const good = (caps: Record<string, string> = {}) =>
  [
    '---',
    'site: example',
    'name: Example DNA',
    'read: 2026-11-10',
    'sources:',
    '  - https://example.com/terms',
    'capabilities:',
    ...CAPABILITIES.map((c) => `  ${c}: ${caps[c] ?? 'unclear'}`),
    '---',
    '',
    '# Example',
  ].join('\n')

describe('the repo terms register', () => {
  const reg = loadTermsRegister(TERMS_DIR)

  it('loads every service file, each with a full set of verdicts', () => {
    expect(reg.list().map((s) => s.site)).toEqual([
      '23andme', 'ancestry', 'familysearch', 'ftdna', 'gedmatch', 'livingdna', 'myheritage', 'wikitree', 'yfull',
    ])
    for (const s of reg.list()) expect(Object.keys(s.capabilities).sort()).toEqual([...CAPABILITIES].sort())
  })

  it('refuses automated page visits on every DNA service', () => {
    for (const site of ['ancestry', 'myheritage', '23andme', 'gedmatch', 'ftdna']) {
      expect(() => reg.require(site, 'automate_page_visits')).toThrow(CapabilityRefused)
    }
  })

  it('allows downloading your own raw DNA where the terms say so', () => {
    for (const site of ['ancestry', 'myheritage', '23andme', 'ftdna']) expect(reg.allows(site, 'site_export')).toBe(true)
    expect(reg.allows('gedmatch', 'site_export')).toBe(false)
  })

  it('refuses writing labels on Ancestry', () => {
    expect(() => reg.require('ancestry', 'write_labels')).toThrow(/not-allowed/)
  })
})

describe('the gate refuses by default', () => {
  const reg = registerFromFiles({ 'example.md': good({ site_export: 'allowed', official_api: 'n/a' }) })

  it('passes only an exact "allowed"', () => {
    expect(() => reg.require('example', 'site_export')).not.toThrow()
    for (const c of ['read_own_matches', 'automate_page_visits', 'official_api'] as const) {
      expect(() => reg.require('example', c)).toThrow(CapabilityRefused)
    }
  })

  it('refuses a site that is not in the register', () => {
    expect(reg.verdict('nowhere', 'site_export')).toBe('missing')
    expect(() => reg.require('nowhere', 'site_export')).toThrow(/no entry/)
  })

  it('an empty register refuses everything', () => {
    const empty = new TermsRegister([])
    for (const c of CAPABILITIES) expect(empty.allows('ancestry', c)).toBe(false)
  })
})

describe('parsing fails loudly', () => {
  const bad = (text: string) => () => parseTermsFile('example.md', text)

  it('rejects a misspelled verdict instead of reading it as allowed', () => {
    expect(bad(good({ site_export: 'Allowed' }))).toThrow(TermsParseError)
    expect(bad(good({ site_export: 'yes' }))).toThrow(/must be one of/)
  })
  it('rejects a missing capability', () => {
    expect(bad(good().replace('  write_labels: unclear\n', ''))).toThrow(/missing: write_labels/)
  })
  it('rejects an unknown capability', () => {
    expect(bad(good().replace('  write_labels: unclear', '  write_labels: unclear\n  teleport: allowed'))).toThrow(/unknown capability/)
  })
  it('rejects a duplicate capability, so a later line cannot quietly override an earlier one', () => {
    expect(bad(good().replace('  raw_upload: unclear', '  raw_upload: unclear\n  raw_upload: allowed'))).toThrow(/twice/)
  })
  it('rejects a bad date, a missing source and a missing front matter', () => {
    expect(bad(good().replace('read: 2026-11-10', 'read: 10 Nov 2026'))).toThrow(/YYYY-MM-DD/)
    expect(bad(good().replace('  - https://example.com/terms\n', ''))).toThrow(/source URL/)
    expect(bad('# no front matter')).toThrow(/front-matter/)
  })
  it('rejects a file whose name does not match its site', () => {
    expect(() => registerFromFiles({ 'other.md': good() })).toThrow(/file name must be example.md/)
  })
})
