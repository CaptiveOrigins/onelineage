/**
 * Importer for pages the Chrome extension collected, stored in the library as one JSON file per page
 * (`pages/0001.json`, …). Only match pages carry data. Every value is checked; a problem refuses the whole set.
 * Today the only site that may be collected from is the local mock site (made-up data). Real services are
 * refused by the terms register.
 */
import { ImportRefused, type Issue, type MatchObservation, sha256Hex, SYNTHETIC_SOURCES, type TermsRegister } from '@captiveorigins/onelineage-core'

const ID = /^[A-Za-z0-9-]{6,64}$/

export async function importCollectedPages(input: { site: string; kit: string; files: Readonly<Record<string, Uint8Array>>; terms: TermsRegister }): Promise<MatchObservation[]> {
  if (!SYNTHETIC_SOURCES.has(input.site)) input.terms.require(input.site, 'read_own_matches')
  const issues: Issue[] = []
  const err = (file: string, message: string) => issues.push({ severity: 'error', code: 'collected.value', message, file })
  const out: MatchObservation[] = []
  const seen = new Set<string>()
  for (const [file, bytes] of Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^pages\/\d{4,}\.json$/.test(file)) continue
    let page: { kind?: unknown; kit?: unknown; match?: Record<string, unknown> }
    try {
      page = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      err(file, 'not readable JSON text')
      continue
    }
    if (page.kind !== 'match') continue
    if (page.kit !== input.kit) { err(file, 'belongs to a different kit'); continue }
    const m = page.match ?? {}
    const id = m['id'], name = m['name'], cm = Number(m['sharedCm']), seg = Number(m['segments']), longest = Number(m['longestCm'])
    if (typeof id !== 'string' || !ID.test(id)) { err(file, 'match ID missing or malformed'); continue }
    if (seen.has(id)) { err(file, `match ${id} appears twice`); continue }
    seen.add(id)
    if (typeof name !== 'string' || name.length > 200) err(file, 'name missing or too long')
    if (!(cm >= 6 && cm <= 3600)) err(file, `shared cM ${m['sharedCm']} is out of range`)
    if (!(Number.isInteger(seg) && seg >= 1 && seg <= 400)) err(file, `segments ${m['segments']} is out of range`)
    if (!(longest >= 0 && longest <= cm)) err(file, 'longest segment is bigger than the total')
    out.push({
      service: input.site, kit: input.kit, match: id, name: String(name), sharedCm: cm, unweightedCm: cm, longestCm: longest, segments: seg,
      side: 'unassigned', treeStatus: '', treeSize: null, matchDate: null, provenance: { file, sha256: await sha256Hex(bytes), row: 1 },
    })
  }
  if (issues.length) throw new ImportRefused(issues)
  return out
}
