/**
 * The terms register the extension bridge uses: the real services' entries (from `terms/`, when the app has
 * them) plus one synthetic entry for the local mock site. The synthetic entry's text is kept here and in
 * apps/extension/mock-site/mocksite.md, and a test keeps the two identical.
 */
import { registerFromFiles, type TermsRegister } from '@captiveorigins/onelineage-core'

export const MOCK_SITE_TERMS = `---
site: mocksite
name: Made-up genealogy site (local mock, synthetic)
read: 2026-11-10
sources:
  - https://github.com/CaptiveOrigins/onelineage/tree/main/apps/extension/mock-site
capabilities:
  read_own_matches: allowed
  automate_page_visits: allowed
  site_export: allowed
  write_labels: allowed
  official_api: n/a
  raw_upload: n/a
---
`

/** Real entries, as file name → text, plus the mock site's. A real file can't take the mock's name. */
export function extensionRegister(realFiles: Readonly<Record<string, string>>): TermsRegister {
  if ('mocksite.md' in realFiles) throw new Error('terms/mocksite.md is reserved for the synthetic mock-site entry')
  return registerFromFiles({ ...realFiles, 'mocksite.md': MOCK_SITE_TERMS })
}
