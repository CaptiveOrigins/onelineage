/**
 * What the window and the Node host say to each other. The window imports these as types only, so no
 * Node code reaches the web view.
 */
import type { MatchSide } from '@captiveorigins/onelineage-core'
import type { PedigreeDocument } from '@captiveorigins/onepedigree-core'
import type { ExtensionStatus } from './extension/bridge'
import type { LabelInstruction } from './extension/wire'

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
      /** The recorded tree plus the candidate fathers, in OnePedigree's uncertainParents shape (OneLineage will use it from 0.1.0-alpha.21). */
      theory: TheoryDocument
    }

/** OnePedigree's uncertain parent slot, as in OnePedigree 0.1.0-alpha.21. Written here until that release is on npm. */
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

/** One chromosome as drawn: the compared stretch, and the shared segments on it, in cM. */
export type ChromosomeRow = { chromosome: string; startCm: number; endCm: number; segments: { startCm: number; endCm: number; cm: number; markers: number }[] }
export type SegmentsResult = { a: string; b: string; totalCm: number; longestCm: number; map: string; comparedMarkers: number; chromosomes: ChromosomeRow[] }

/** The extension, as the app's Extension screen shows it (ADR 0009). */
export type ExtensionView = ExtensionStatus & {
  /** Developer builds trusted in the app's settings, each a recorded decision. */
  developerIds: string[]
  publishedId: string | null
}

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
  /** Privacy mode's saved stand-ins for this library, and the real words a stand-in must never be. */
  privacyNames: { params: Record<string, never>; result: { salt: string; known: Record<string, string>; reserved: string[] } }
  /** Save new stand-in pairings, so they stay the same next time. */
  addPrivacyNames: { params: { pairs: Record<string, string> }; result: { saved: number } }
  /** The kit's DNA groups, worked out from DNA figures alone (neutral IDs until unblinding). */
  groups: { params: { kit: string }; result: { kit: string; engine: string; grouped: number; excluded: number; groups: { group: string; size: number; sides: string[] }[] } }
  /** S11: rebuild the cache from the library and compare. If they differ, the cache on disk is replaced. */
  cacheCheck: { params: Record<string, never>; result: { ok: boolean; rebuilt: boolean; digest: string } }
  /** A recovery copy of this library's backup key, shown once when the person asks. */
  backupKeyRecovery: { params: Record<string, never>; result: { copy: string } }
  /** Two family kits compared on this Mac from their raw DNA, for the chromosome browser. */
  segments: { params: { a: string; b: string }; result: SegmentsResult }
  /** The Chrome extension: connection, waiting requests, grants, the current run and the hand-over log. */
  extensionStatus: { params: Record<string, never>; result: ExtensionView }
  /** The owner's answer to a request started in the extension. */
  extensionDecide: { params: { request: string; answer: 'once' | 'session' | 'deny' }; result: ExtensionView }
  /** "End now" on a grant. */
  extensionEndGrant: { params: { grant: string }; result: ExtensionView }
  /** Start collecting a kit's matches on a site. In this version only the local mock site on 127.0.0.1 is allowed. */
  extensionStartRun: { params: { kit: string; site: string; origin: string; maxPages?: number }; result: ExtensionView }
  extensionStopRun: { params: Record<string, never>; result: ExtensionView }
  /** Apply a label batch the owner approved, one page at a time. */
  extensionApplyLabels: { params: { kit: string; site: string; origin: string; labels: LabelInstruction[]; approved: boolean }; result: ExtensionView }
  /** The app's privacy switch, shared with the extension's side panel. */
  setPrivacy: { params: { on: boolean }; result: ExtensionView }
  /** Trust a developer build of the extension, by its ID. Recorded in the decisions log; `confirm` must be true. */
  trustDeveloperExtension: { params: { id: string; confirm: boolean }; result: ExtensionView }
  untrustDeveloperExtension: { params: { id: string }; result: ExtensionView }
}
export type HostMethod = keyof HostApi
