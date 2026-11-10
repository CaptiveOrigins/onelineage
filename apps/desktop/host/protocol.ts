/**
 * What the window and the Node host say to each other. The window imports these as types only, so no
 * Node code reaches the web view.
 */
import type { MatchSide } from '@captiveorigins/onelineage-core'
import type { PedigreeDocument } from '@captiveorigins/onepedigree-core'

/** The kinds of use USE-POLICY.md allows. Law-enforcement use isn't one of them, so it can't be recorded. */
export const USE_KINDS = ['personal', 'for-someone-else', 'sanctioned-lab', 'wildlife-agency'] as const
export type UseKind = (typeof USE_KINDS)[number]
/** The policy version the answer was given against. */
export const USE_POLICY_VERSION = 'draft 2026-11-10'

export type UseDeclaration = { use: UseKind; at: string; policy: string }

export type DestinationState = {
  path: string
  /** ISO time of the newest backup of this library there that passed its test-restore, or null. */
  lastCheckedBackup: string | null
  /** Plain-words problems found at this destination (missing folder, failed check). */
  problems: string[]
  /** Advice that doesn't block, such as "on the same disk as the library". */
  warnings: string[]
  cloudSynced: boolean
}

export type BackupState = {
  /** 0: two required (the default); 1: one is enough; 2: none required. Read from the decisions log. */
  bypass: 0 | 1 | 2
  required: number
  destinations: DestinationState[]
  verdict: { ok: boolean; required: number; current: number; message: string }
}

export type LibraryState = {
  path: string
  created: string
  /** A made-up demo library made by the app, kept apart from the user's own. */
  demo: boolean
  use: UseDeclaration | null
  kits: number
}

export type Status = {
  /** The user's own library, once chosen. */
  home: LibraryState | null
  /** The library on screen: the home library or the demo. */
  current: LibraryState | null
  /** A demo library exists and can be reopened. */
  demoAvailable: boolean
  /** Where encryption keys for cloud backups would be kept. */
  keyStore: string
}

export type KitSummary = {
  /** The service's test ID. */
  kit: string
  name: string
  service: string
  exportDate: string
  matches: number
  sharedMatchFiles: number
  sealedFiles: number
  blind: boolean
  raw: {
    service: string
    chip: string | null
    build: string | null
    generated: string | null
    markers: number
    noCalls: number
  } | null
}

export type KitsResult = {
  kits: KitSummary[]
  /** The family kits compared with each other on this Mac, from their raw DNA. */
  comparisons: { a: string; b: string; totalCm: number; segments: number; longestCm: number; map: string }[]
}

export type MatchRow = {
  match: string
  name: string
  cm: number
  segments: number
  longestCm: number
  side: MatchSide
  treeStatus: string
  date: string | null
}

export type TheoryResult =
  | { blind: true; kit: string; name: string }
  | {
      blind: false
      kit: string
      name: string
      /** The tester's tree as recorded, as a OnePedigree document. */
      recorded: PedigreeDocument
      /** The person the planted question is about, and the two candidate fathers. */
      question: { child: string; recordedFather: string; biologicalFather: string }
      /** The recorded tree plus the candidate fathers, in OnePedigree's uncertainParents shape (0.1.0-alpha.20 and later). */
      theory: TheoryDocument
    }

/** OnePedigree's uncertain parent slot, as released in 0.1.0-alpha.20. Written here until that release is on npm. */
export type UncertainParentSlot = { role: string | null; candidates: { individual: string; probability: number }[] }
export type TheoryDocument = {
  schemaVersion: 1
  individuals: {
    id: string
    label: string | null
    sex: string | null
    parentage: { parents: { individual: string; role: string | null }[]; uncertainParents?: UncertainParentSlot[] } | null
    data?: Record<string, unknown>
  }[]
}

export type BackupRun = { results: { destination: string; ok: boolean; files: number; encrypted: boolean; problems: string[] }[]; state: BackupState }

export type HostApi = {
  status: { params: Record<string, never>; result: Status }
  chooseLibrary: { params: { path: string }; result: Status }
  declareUse: { params: { use: UseKind }; result: Status }
  backupState: { params: Record<string, never>; result: BackupState }
  addDestination: { params: { path: string }; result: BackupState }
  removeDestination: { params: { path: string }; result: BackupState }
  /** One step down (2 → 1 → 0 required). `confirm` must be true: one confirmation per step, recorded. */
  lowerBackupRequirement: { params: { confirm: boolean }; result: BackupState }
  raiseBackupRequirement: { params: Record<string, never>; result: BackupState }
  backUpEverywhere: { params: Record<string, never>; result: BackupRun }
  openDemo: { params: { seed?: number }; result: Status }
  openHome: { params: Record<string, never>; result: Status }
  kits: { params: Record<string, never>; result: KitsResult }
  matches: { params: { kit: string }; result: MatchRow[] }
  theory: { params: Record<string, never>; result: TheoryResult | null }
  unblind: { params: { kit: string }; result: TheoryResult | null }
}
export type HostMethod = keyof HostApi
