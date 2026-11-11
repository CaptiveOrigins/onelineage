/**
 * What the OneLineage Chrome extension and the app say to each other (ADR 0009). The app owns this list and
 * enforces it; the extension imports the same file. Pure TypeScript with no Node or browser APIs, so both
 * sides can use it.
 *
 * The list is fixed and short on purpose. There is no command to read the library or to run anything.
 */

export const WIRE_VERSION = 1

/** The native messaging host's name, as Chrome looks it up in NativeMessagingHosts/. */
export const NATIVE_HOST_NAME = 'org.captiveorigins.onelineage'

/**
 * The extension's ID once it's listed on the Chrome Web Store. Null until the owner publishes the listing,
 * so until then only a developer build the owner trusted in the app's settings can connect.
 */
export const PUBLISHED_EXTENSION_ID: string | null = null

/** Started in the app, sent to the extension. */
export const APP_COMMANDS = ['startRun', 'stopRun', 'applyLabels', 'setPrivacy'] as const
export type AppCommandName = (typeof APP_COMMANDS)[number]

/** Started in the extension. Each needs the owner's OK in the app, or a grant that covers it. */
export const EXTENSION_REQUESTS = ['matchSummary', 'newMatchesToFetch', 'pageExport'] as const
export type ExtensionRequestName = (typeof EXTENSION_REQUESTS)[number]

/** Every message type the extension may send. Anything else is refused. */
export const EXTENSION_MESSAGE_TYPES = ['hello', 'request', 'privacyButton', 'runReport'] as const

/** A session grant covers one kit, and ends when Chrome closes the connection or after this long. */
export const SESSION_GRANT_MS = 60 * 60 * 1000
/** A request nobody answers in the app is refused after this long. */
export const REQUEST_TIMEOUT_MS = 2 * 60 * 1000

/** Human pace, on every site including the mock: one page at a time, a random pause between pages, a daily cap. */
export const PAUSE_MIN_MS = 30_000
export const PAUSE_MAX_MS = 60_000
export const DAILY_PAGE_CAP = 100

/** Why a run stopped. Anything that looks like a challenge, a sign-in page or an error stops it at once. */
export const STOP_REASONS = ['finished', 'stopped-in-app', 'challenge', 'sign-in', 'error', 'daily-cap', 'grant-ended', 'disconnected'] as const
export type StopReason = (typeof STOP_REASONS)[number]

export type GrantKind = 'once' | 'session' | 'run'
export type Grant = { id: string; kind: GrantKind; kit: string; /** ISO time. The extension drops anything it holds for this grant at this time. */ expiresAt: string }

/** What one page held, as the extension read it. The page's own export block, never the page's HTML. */
export type PageSnapshot = {
  url: string
  /** The page's declared kind: `match-list`, `match`, `challenge`, `sign-in`, `error`, or null if it declared none. */
  kind: string | null
  /** The page's machine-readable export, as text, or null. */
  exportText: string | null
}

/** The minimum about one match: its line, a confidence and theory names. Never a name or a list of matches. */
export type MatchSummary = { match: string; line: string; confidence: string; theories: string[] }

export type ExtensionMessage =
  | { type: 'hello'; version: number }
  | { type: 'request'; id: string; request: 'matchSummary'; kit: string; match: string }
  | { type: 'request'; id: string; request: 'newMatchesToFetch'; kit: string; runId?: string }
  | { type: 'request'; id: string; request: 'pageExport'; kit: string; runId?: string; page: PageSnapshot }
  /** The toolbar button. Hands over nothing; the app flips its own switch and answers with setPrivacy. */
  | { type: 'privacyButton' }
  | { type: 'runReport'; runId: string; state: 'stopped'; reason: StopReason; pages: number; detail?: string }
  | { type: 'runReport'; runId: string; state: 'labelled'; batchId: string; applied: number; reason: StopReason; detail?: string }

export type LabelInstruction = { match: string; label: string }

export type AppMessage =
  | { type: 'welcome'; version: number; privacy: boolean }
  | {
      type: 'command'
      command: 'startRun'
      runId: string
      kit: string
      site: string
      /** The site's origin. In this version always http://127.0.0.1:<port>, the local mock site. */
      origin: string
      startPath: string
      maxPages: number
      grant: Grant
    }
  | { type: 'command'; command: 'stopRun'; runId: string }
  | { type: 'command'; command: 'applyLabels'; runId: string; batchId: string; kit: string; site: string; origin: string; labels: LabelInstruction[]; grant: Grant }
  | { type: 'command'; command: 'setPrivacy'; on: boolean }
  | { type: 'response'; id: string; ok: true; grant: Grant; data: MatchSummary | { matches: string[] } | { accepted: true } }
  | { type: 'response'; id: string; ok: false; error: string }
  | { type: 'grantEnded'; grantId: string }

/** Loopback only, with a port: the one kind of origin this version will ever visit. */
export function isLoopbackOrigin(origin: string): boolean {
  return /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin)
}

/** A Chrome extension origin as Chrome passes it to a native host: chrome-extension://<32 letters a–p>/. */
export function extensionIdFromOrigin(origin: string): string | null {
  const m = /^chrome-extension:\/\/([a-p]{32})\/$/.exec(origin)
  return m ? (m[1] as string) : null
}

/** A request without its ID, which the sender adds. */
export type ExtensionRequestBody = Extract<ExtensionMessage, { type: 'request' }> extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never
