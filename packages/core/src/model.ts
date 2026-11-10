/** Records as stored (ADR 0001). Every record carries where it came from. */

export type Provenance = {
  /** File name inside the export, as given. */
  file: string
  /** SHA-256 of the file's bytes, lower-case hex. */
  sha256: string
  /** 1-based data row (the header is row 0). */
  row: number
}

/** A service-assigned ID, such as an Ancestry test GUID. A name is never a key. */
export type ServiceId = { service: string; id: string }

export type MatchSide = 'paternal' | 'maternal' | 'both' | 'unassigned'

/** One match as one kit sees it in one export. */
export type MatchObservation = {
  service: string
  kit: string
  match: string
  /** A label only. Names change; IDs don't. */
  name: string
  sharedCm: number
  unweightedCm: number
  longestCm: number
  segments: number
  side: MatchSide
  treeStatus: string
  treeSize: number | null
  /** As the service reports it, YYYY-MM-DD. */
  matchDate: string | null
  provenance: Provenance
}

/** Match A and match B, both matches of the kit, and what they share with each other. */
export type SharedMatchLink = {
  service: string
  kit: string
  a: string
  b: string
  cmAB: number
  segmentsAB: number | null
  longestAB: number | null
  provenance: Provenance
}

/** A file kept but not read, such as a tree export for a kit still blind. */
export type SealedFile = { file: string; sha256: string; reason: string }
