/**
 * The cache: a SQLite database kept outside the library (by default in ~/Library/Application Support/OneLineage),
 * holding what the importers read from the library, ready to query. It's disposable. Rebuilding it from the
 * library must give the same contents (S11), which `cacheDigest` checks.
 */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sha256Hex, type MatchObservation, type SharedMatchLink } from '@captiveorigins/onelineage-core'
import type { Decision } from './decisions.js'

export const defaultCacheDir = () => join(homedir(), 'Library', 'Application Support', 'OneLineage')

export type CacheInput = { observations: readonly MatchObservation[]; links: readonly SharedMatchLink[]; decisions: readonly Decision[] }

const SCHEMA = `
CREATE TABLE observation (service TEXT, kit TEXT, match TEXT, name TEXT, shared_cm REAL, unweighted_cm REAL, longest_cm REAL, segments INTEGER,
  side TEXT, tree_status TEXT, tree_size INTEGER, match_date TEXT, file TEXT, sha256 TEXT, row INTEGER, PRIMARY KEY (service, kit, match, sha256));
CREATE TABLE link (service TEXT, kit TEXT, a TEXT, b TEXT, cm_ab REAL, segments_ab INTEGER, longest_ab REAL, file TEXT, sha256 TEXT, row INTEGER,
  PRIMARY KEY (service, kit, a, b, sha256));
CREATE TABLE decision (seq INTEGER PRIMARY KEY, at TEXT, by TEXT, kind TEXT, data TEXT, hash TEXT);
`

/** Build a fresh cache at `path` (":memory:" for tests). Any existing tables are dropped first. */
export function buildCache(path: string, input: CacheInput): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('DROP TABLE IF EXISTS observation; DROP TABLE IF EXISTS link; DROP TABLE IF EXISTS decision;')
  db.exec(SCHEMA)
  db.exec('BEGIN')
  const o = db.prepare('INSERT INTO observation VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  for (const x of input.observations) {
    o.run(x.service, x.kit, x.match, x.name, x.sharedCm, x.unweightedCm, x.longestCm, x.segments, x.side, x.treeStatus, x.treeSize, x.matchDate, x.provenance.file, x.provenance.sha256, x.provenance.row)
  }
  const l = db.prepare('INSERT INTO link VALUES (?,?,?,?,?,?,?,?,?,?)')
  for (const x of input.links) l.run(x.service, x.kit, x.a, x.b, x.cmAB, x.segmentsAB, x.longestAB, x.provenance.file, x.provenance.sha256, x.provenance.row)
  const d = db.prepare('INSERT INTO decision VALUES (?,?,?,?,?,?)')
  for (const x of input.decisions) d.run(x.seq, x.at, x.by, x.kind, JSON.stringify(x.data), x.hash)
  db.exec('COMMIT')
  return db
}

/** A digest of the cache's contents in a fixed order, so a rebuild can be compared with the live cache. */
export async function cacheDigest(db: DatabaseSync): Promise<string> {
  const parts: string[] = []
  for (const [table, order] of [['observation', 'service, kit, match, sha256'], ['link', 'service, kit, a, b, sha256'], ['decision', 'seq']] as const) {
    for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()) parts.push(table + JSON.stringify(row))
  }
  return sha256Hex(new TextEncoder().encode(parts.join('\n')))
}
