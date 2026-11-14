/**
 * Importer for Ancestry match data in the CSV shapes Genealogy Assistant writes: the match list, one file of
 * shared matches per match, and match trees.
 *
 * Checked before anything is kept:
 * - the terms register must allow `read_own_matches` for the service, unless the data is made up ("planted")
 * - every column and value is checked, and problems refuse the whole import (S4)
 * - IDs are unique, and shared-match files must point at matches that are in the list (S5)
 * - every record carries its file, the file's SHA-256 and its row (S12)
 * - tree files stay sealed, read by nobody, while the kit is blind (S1)
 */
import {
  type BlindGate, type Issue, ImportRefused, type MatchObservation, type MatchSide, type SealedFile, type SharedMatchLink,
  SYNTHETIC_SOURCES, sha256Hex, type TermsRegister,
} from '@extantape/onefamily-core'
import { parseCsv } from './csv.js'

export const MATCH_LIST_REQUIRED = [
  'Match Name', 'Shared cM', 'Unweighted cM', 'Longest Segment cM', 'Shared Segments', 'Match Side', 'Family Tree', 'Tree Size', 'GUID', 'Match Date',
] as const
export const SHARED_REQUIRED = [
  'GUID', 'Shared cM', 'GUID of Match', 'Shared cM with Match', 'Shared Segments with Match', 'Longest Segment cM with Match',
] as const
/** Columns that are the user's own labels or the service's ancestor hints: tree sources under ADR 0002. Never read while blind. */
export const TREE_SOURCE_COLUMNS = ['Common Ancestor', 'Notes', 'Groups', 'Connected To Tree'] as const

const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const LIST_FILE = /^(.*) - DNA Matches - Test ([0-9A-F-]{36})(?: \(\d+\))?\.csv$/
const SHARED_FILE = /^Shared Matches - .* - Test ([0-9A-F-]{36}) - Match ([0-9A-F-]{36})\.csv$/
const TREES_FILE = / - Match Trees( \(\d+\))?\.csv$/
const SIDES: Record<string, MatchSide> = { 'Paternal side': 'paternal', 'Maternal side': 'maternal', 'Both sides': 'both', Unassigned: 'unassigned', '': 'unassigned' }

export type ImportInput = {
  /** "ancestry" for real data; "planted" for made-up test families. */
  source: string
  /** File path relative to the export folder → bytes. Shared-match files sit under "Shared Matches/". */
  files: Readonly<Record<string, Uint8Array>>
  terms: TermsRegister
  blind: BlindGate
  /** The match count the service showed on the day of the export, if recorded (S5). */
  expectedMatchCount?: number
}

export type ImportResult = {
  service: 'ancestry'
  kit: string
  observations: MatchObservation[]
  links: SharedMatchLink[]
  sealed: SealedFile[]
  /** Every file read or sealed, with its checksum. */
  manifest: { file: string; sha256: string }[]
  notices: Issue[]
}

const decoder = new TextDecoder('utf-8', { fatal: true })

export async function importGenealogyAssistant(input: ImportInput): Promise<ImportResult> {
  const issues: Issue[] = []
  const err = (code: string, message: string, at: Partial<Issue> = {}) => issues.push({ severity: 'error', code, message, ...at })
  const note = (code: string, message: string, at: Partial<Issue> = {}) => issues.push({ severity: 'notice', code, message, ...at })

  // Terms first: nothing is parsed if the service's terms don't clearly allow it.
  if (!SYNTHETIC_SOURCES.has(input.source)) input.terms.require(input.source, 'read_own_matches')

  const names = Object.keys(input.files)
  const listNames = names.filter((n) => LIST_FILE.test(basename(n)))
  if (listNames.length !== 1) {
    err('list.count', `expected exactly one match list ("… - DNA Matches - Test <ID>.csv"), found ${listNames.length}`)
    throw new ImportRefused(issues)
  }
  const listName = listNames[0] as string
  const kit = (LIST_FILE.exec(basename(listName)) as RegExpExecArray)[2] as string

  const manifest: ImportResult['manifest'] = []
  const hashes = new Map<string, string>()
  for (const n of names) {
    const h = await sha256Hex(input.files[n] as Uint8Array)
    hashes.set(n, h)
    manifest.push({ file: n, sha256: h })
  }
  const text = (n: string): string | null => {
    try {
      return decoder.decode(input.files[n])
    } catch {
      err('file.encoding', 'not valid UTF-8 text', { file: n })
      return null
    }
  }
  const table = (n: string): { header: string[]; rows: string[][] } | null => {
    const t = text(n)
    if (t === null) return null
    let rows: string[][]
    try {
      rows = parseCsv(t)
    } catch (e) {
      err('csv.syntax', (e as Error).message, { file: n })
      return null
    }
    const [header, ...body] = rows
    if (!header) { err('csv.empty', 'file is empty', { file: n }); return null }
    const width = header.length
    body.forEach((r, i) => { if (r.length !== width) err('csv.width', `row has ${r.length} fields, header has ${width}`, { file: n, row: i + 1 }) })
    return { header, rows: body }
  }
  const columns = (n: string, header: string[], required: readonly string[]) => {
    const idx = new Map(header.map((h, i) => [h, i]))
    for (const c of required) if (!idx.has(c)) err('schema.missing-column', `missing column "${c}"`, { file: n, column: c })
    return (row: string[], c: string) => row[idx.get(c) ?? -1] ?? ''
  }
  const num = (n: string, row: number, column: string, v: string, min: number, max: number, integer = false): number => {
    const x = Number(v)
    if (v.trim() === '' || !Number.isFinite(x) || (integer && !Number.isInteger(x)) || x < min || x > max) {
      err('value.range', `"${v}" isn't a ${integer ? 'whole number' : 'number'} from ${min} to ${max}`, { file: n, row, column })
      return Number.NaN
    }
    return x
  }

  // --- The match list.
  const observations: MatchObservation[] = []
  const list = table(listName)
  if (list) {
    const get = columns(listName, list.header, MATCH_LIST_REQUIRED)
    const seen = new Set<string>()
    list.rows.forEach((r, i) => {
      const row = i + 1
      const at = (column: string) => ({ file: listName, row, column })
      const guid = get(r, 'GUID')
      if (!GUID.test(guid)) err('value.id', `"${guid}" isn't a test ID`, at('GUID'))
      else if (seen.has(guid)) err('value.duplicate-id', `test ID ${guid} appears twice`, at('GUID'))
      seen.add(guid)
      const shared = num(listName, row, 'Shared cM', get(r, 'Shared cM'), 6, 3600, true)
      const unweighted = num(listName, row, 'Unweighted cM', get(r, 'Unweighted cM'), 6, 3600, true)
      const longest = num(listName, row, 'Longest Segment cM', get(r, 'Longest Segment cM'), 0, 3600, true)
      const segments = num(listName, row, 'Shared Segments', get(r, 'Shared Segments'), 1, 400, true)
      if (longest > unweighted) err('value.longest', `longest segment ${longest} cM is more than the total ${unweighted} cM`, at('Longest Segment cM'))
      const sideText = get(r, 'Match Side')
      const side = SIDES[sideText]
      if (!side) err('value.side', `unknown match side "${sideText}"`, at('Match Side'))
      const date = get(r, 'Match Date')
      if (date !== '' && !DATE.test(date)) err('value.date', `"${date}" isn't a YYYY-MM-DD date`, at('Match Date'))
      const treeSize = get(r, 'Tree Size')
      observations.push({
        service: 'ancestry', kit, match: guid, name: get(r, 'Match Name'), sharedCm: shared, unweightedCm: unweighted, longestCm: longest,
        segments, side: side ?? 'unassigned', treeStatus: get(r, 'Family Tree'), treeSize: treeSize === '' ? null : Number(treeSize),
        matchDate: date || null, provenance: { file: listName, sha256: hashes.get(listName) as string, row },
      })
    })
    if (input.expectedMatchCount !== undefined && list.rows.length !== input.expectedMatchCount) {
      err('count.expected', `the list has ${list.rows.length} matches; the service showed ${input.expectedMatchCount}`, { file: listName })
    }
    const sealedCols = TREE_SOURCE_COLUMNS.filter((c) => list.header.includes(c))
    if (sealedCols.length && input.blind.isBlind(kit)) note('blind.columns', `kit is blind, so ${sealedCols.join(', ')} were not read`, { file: listName })
  }
  const inList = new Set(observations.map((o) => o.match))

  // --- Shared matches.
  const links: SharedMatchLink[] = []
  for (const n of names) {
    const m = SHARED_FILE.exec(basename(n))
    if (!m) continue
    const [, fileKit, focal] = m as unknown as [string, string, string]
    if (fileKit !== kit) { err('shared.kit', `file is for test ${fileKit}, but the match list is for ${kit}`, { file: n }); continue }
    if (!inList.has(focal)) err('shared.unknown-match', `match ${focal} isn't in the match list`, { file: n })
    const t = table(n)
    if (!t) continue
    const get = columns(n, t.header, SHARED_REQUIRED)
    t.rows.forEach((r, i) => {
      const row = i + 1
      const of = get(r, 'GUID of Match')
      if (of !== focal) err('shared.focal', `"GUID of Match" is ${of}, but the file name says ${focal}`, { file: n, row })
      const other = get(r, 'GUID')
      if (!GUID.test(other)) { err('value.id', `"${other}" isn't a test ID`, { file: n, row, column: 'GUID' }); return }
      if (!inList.has(other)) err('shared.unknown-match', `shared match ${other} isn't in the match list`, { file: n, row })
      const cm = num(n, row, 'Shared cM with Match', get(r, 'Shared cM with Match'), 6, 3600, true)
      const segs = get(r, 'Shared Segments with Match')
      const longest = get(r, 'Longest Segment cM with Match')
      links.push({
        service: 'ancestry', kit, a: focal, b: other, cmAB: cm,
        segmentsAB: segs === '' ? null : num(n, row, 'Shared Segments with Match', segs, 1, 400, true),
        longestAB: longest === '' ? null : num(n, row, 'Longest Segment cM with Match', longest, 0, 3600, true),
        provenance: { file: n, sha256: hashes.get(n) as string, row },
      })
    })
  }

  // --- Trees: sealed while blind. After unblinding, a later importer reads them.
  const sealed: SealedFile[] = []
  for (const n of names) {
    if (TREES_FILE.test(basename(n))) {
      sealed.push({ file: n, sha256: hashes.get(n) as string, reason: input.blind.isBlind(kit) ? 'kit is blind' : 'tree reading is not built yet' })
    }
  }
  const known = (n: string) => n === listName || SHARED_FILE.test(basename(n)) || TREES_FILE.test(basename(n))
  for (const n of names) if (!known(n)) note('file.ignored', 'not a file this importer reads; kept in the manifest only', { file: n })

  if (issues.some((i) => i.severity === 'error')) throw new ImportRefused(issues)
  return { service: 'ancestry', kit, observations, links, sealed, manifest, notices: issues }
}

function basename(p: string): string {
  return p.split('/').pop() as string
}
