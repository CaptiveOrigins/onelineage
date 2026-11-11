/**
 * The Node host: everything the window asks for that needs files. It calls the sibling packages unchanged,
 * and holds no app logic they should own. The Mac app runs it as a child process (host/main.ts); `pnpm dev`
 * in a browser serves it from the Vite dev server; tests call it directly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { BlindGate, compareKits, ONE_CM_PER_MB, sha256Hex, TermsRegister, type Unblinding } from '@captiveorigins/onelineage-core'
import { importGenealogyAssistant, importRawDna, type ImportResult, type RawImport } from '@captiveorigins/onelineage-connectors'
import {
  appendDecision, backupTo, backupVerdict, canLowerBypass, checkBackup, decisionsPath, initLibrary, isCloudSynced, listFiles, openLibrary,
  readDecisions, type BypassLevel, type Decision,
} from '@captiveorigins/onelineage-library'
import type { PedigreeDocument } from '@captiveorigins/onepedigree-core'
import { withCandidateFathers, type TreePerson } from '../src/pedigree'
import { createDemoLibrary, DEMO_NOTE } from './demo'
import { noKeyStore, type KeyStore } from './keys'
import {
  USE_KINDS, USE_POLICY_VERSION, type BackupRun, type BackupState, type DestinationState, type HostApi, type HostMethod, type KitsResult,
  type LibraryState, type MatchRow, type Status, type TheoryResult, type UseDeclaration, type UseKind,
} from './protocol'
import { readState, writeState, type AppState } from './state'

export { defaultStateDir } from './state'

/** Who a decision is recorded as made by. The app has one person at the keyboard and no accounts. */
const BY = 'user'
const EXPORT_DIR = /^(\d{4}-\d{2}-\d{2}) planted (.+)$/
const LIST_FILE = /^(.*) - DNA Matches - Test ([0-9A-F-]{36})(?: \(\d+\))?\.csv$/
/** Real services aren't readable in v0: an empty register refuses them all. Planted data is exempt from terms, never from blindness. */
const NO_TERMS = new TermsRegister([])

type LoadedKit = { result: ImportResult; name: string; exportDate: string; sharedFiles: number; raw: RawImport | null }
type Loaded = { kits: LoadedKit[]; ownTree: { name: string; doc: PedigreeDocument } | null; truthFile: string | null }

export class HostError extends Error {}

export function createHost(opts: { stateDir: string; keys?: KeyStore; now?: () => Date }) {
  const keys = opts.keys ?? noKeyStore
  const now = opts.now ?? (() => new Date())
  const loaded = new Map<string, Loaded>()

  const state = () => readState(opts.stateDir)
  const save = (s: AppState) => writeState(opts.stateDir, s)
  const current = () => {
    const s = state()
    if (!s.current) throw new HostError('Choose a library folder first.')
    return s.current
  }

  // --- Library and decisions

  const decisions = (lib: string) => readDecisions(decisionsPath(lib))
  const useOf = (ds: Decision[]): UseDeclaration | null => {
    const d = [...ds].reverse().find((x) => x.kind === 'use-declaration')
    return d ? { use: d.data['use'] as UseKind, at: d.at, policy: String(d.data['policy']) } : null
  }
  const bypassOf = (ds: Decision[]): BypassLevel => {
    const d = [...ds].reverse().find((x) => x.kind === 'backup-bypass')
    const to = d?.data['to']
    return to === 1 || to === 2 ? to : 0
  }
  const gateOf = (ds: Decision[]) =>
    new BlindGate(ds.filter((d) => d.kind === 'unblind').map((d): Unblinding => ({ kit: String(d.data['kit']), at: d.at, by: d.by })))

  const exportFolders = (lib: string) => {
    const root = join(lib, 'exports')
    if (!existsSync(root)) return []
    return readdirSync(root)
      .sort()
      .flatMap((name) => {
        const m = EXPORT_DIR.exec(name)
        return m ? [{ folder: join(root, name), date: m[1] as string, label: m[2] as string }] : []
      })
  }
  const readExport = (folder: string): Record<string, Uint8Array> =>
    Object.fromEntries(listFiles(folder).filter((f) => f !== 'MANIFEST.sha256').map((f) => [f.split(sep).join('/'), new Uint8Array(readFileSync(join(folder, f)))]))

  const libraryState = async (lib: string): Promise<LibraryState> => {
    const info = openLibrary(lib)
    const ds = await decisions(lib)
    return {
      path: lib,
      created: info.created,
      demo: existsSync(join(lib, DEMO_NOTE)) && state().demo === lib,
      use: useOf(ds),
      kits: exportFolders(lib).filter((e) => e.label.startsWith('matches ')).length,
    }
  }

  const status = async (): Promise<Status> => {
    const s = state()
    return {
      home: s.home ? await libraryState(s.home) : null,
      current: s.current ? await libraryState(s.current) : null,
      demoAvailable: Boolean(s.demo && existsSync(join(s.demo, 'library.json'))),
      keyStore: keys.description,
    }
  }

  async function load(lib: string): Promise<Loaded> {
    const have = loaded.get(lib)
    if (have) return have
    const gate = gateOf(await decisions(lib))
    const folders = exportFolders(lib)
    const kits: LoadedKit[] = []
    for (const e of folders.filter((f) => f.label.startsWith('matches '))) {
      const files = readExport(e.folder)
      const result = await importGenealogyAssistant({ source: 'planted', files, terms: NO_TERMS, blind: gate })
      const listName = Object.keys(files).find((n) => LIST_FILE.test(n.split('/').pop() ?? ''))
      const name = LIST_FILE.exec(listName?.split('/').pop() ?? '')?.[1] ?? e.label.slice('matches '.length)
      const rawFolder = folders.find((f) => f.label === `raw DNA ${name}`)
      let raw: RawImport | null = null
      if (rawFolder) {
        const [file, bytes] = Object.entries(readExport(rawFolder.folder))[0] ?? []
        if (file && bytes) raw = await importRawDna({ file, bytes, terms: NO_TERMS, source: 'planted' })
      }
      kits.push({ result, name, exportDate: e.date, sharedFiles: Object.keys(files).filter((n) => n.startsWith('Shared Matches/')).length, raw })
    }
    const treeFolder = folders.find((f) => f.label.startsWith('own tree '))
    const ownTree = treeFolder
      ? { name: treeFolder.label.slice('own tree '.length), doc: JSON.parse(new TextDecoder().decode(readExport(treeFolder.folder)['own-tree.onepedigree.json'])) as PedigreeDocument }
      : null
    const answers = folders.find((f) => f.label === 'answers')
    const out: Loaded = { kits, ownTree, truthFile: answers ? join(answers.folder, 'truth.json') : null }
    loaded.set(lib, out)
    return out
  }

  // --- Backups

  const backupState = async (): Promise<BackupState> => {
    const lib = current()
    const bypass = bypassOf(await decisions(lib))
    const dests = state().destinations[lib] ?? []
    const libHash = await sha256Hex(new Uint8Array(readFileSync(join(lib, 'library.json'))))
    const libDev = statSync(lib).dev
    const devs = dests.map((d) => (existsSync(d) ? statSync(d).dev : null))
    const destinations: DestinationState[] = []
    for (const [i, d] of dests.entries()) {
      const cloud = isCloudSynced(d)
      const problems: string[] = []
      const warnings: string[] = []
      let lastCheckedBackup: string | null = null
      if (!existsSync(d)) problems.push('This folder can’t be found. If it’s on a disk that isn’t plugged in, connect it and look again.')
      else {
        if (cloud) problems.push('This folder is synced to a cloud service, so copies there must be encrypted. Encryption keys need the Keychain, which isn’t built yet. Choose a folder that isn’t synced for now.')
        if (devs[i] === libDev) warnings.push('On the same disk as the library, so one failed disk would take both.')
        if (devs.some((x, j) => j !== i && x !== null && x === devs[i])) warnings.push('On the same disk as another backup destination.')
        const key = cloud ? await keys.backupKey(lib) : null
        const mine = readdirSync(d).filter((n) => n.startsWith('OneLineage backup ')).sort().reverse()
        for (const name of mine) {
          const folder = join(d, name)
          const manifest = join(folder, 'BACKUP-MANIFEST.sha256')
          if (!existsSync(manifest)) continue
          // Only copies of this library count: its library.json must be the one in the copy.
          if (!readFileSync(manifest, 'utf8').split('\n').some((l) => l === `${libHash}  library.json`)) continue
          const found = await checkBackup(folder, key ?? undefined)
          if (found.length === 0) lastCheckedBackup = stampToIso(name.slice('OneLineage backup '.length))
          else problems.push(`The newest copy here failed its check: ${found[0]}`)
          break
        }
      }
      destinations.push({ path: d, lastCheckedBackup, problems, warnings, cloudSynced: cloud })
    }
    const verdict = backupVerdict(destinations.map((x) => ({ destination: x.path, lastCheckedBackup: x.lastCheckedBackup })), bypass, now())
    return { bypass, required: verdict.required, destinations, verdict }
  }

  const setDestinations = (lib: string, f: (list: string[]) => string[]) => {
    const s = state()
    s.destinations[lib] = f(s.destinations[lib] ?? [])
    save(s)
  }

  // --- Handlers

  const handlers: { [M in HostMethod]: (params: HostApi[M]['params']) => Promise<HostApi[M]['result']> } = {
    status,

    async chooseLibrary({ path }) {
      const dir = folderParam(path)
      const s = state()
      if (s.demo && (dir === s.demo || inside(dir, s.demo))) throw new HostError('That’s the made-up demo library. Choose a folder of your own.')
      if (existsSync(dir) && readdirSync(dir).filter((n) => !n.startsWith('.')).length && !existsSync(join(dir, 'library.json')))
        throw new HostError('That folder already has other files in it. Choose an empty folder, or one that’s already a OneLineage library.')
      initLibrary(dir, now())
      s.home = dir
      s.current = dir
      save(s)
      return status()
    },

    async declareUse({ use }) {
      const s = state()
      if (!s.home) throw new HostError('Choose a library folder first.')
      if (!(USE_KINDS as readonly string[]).includes(use)) throw new HostError('That isn’t one of the kinds of use the policy allows.')
      const ds = await decisions(s.home)
      if (useOf(ds)) throw new HostError('This library already has its use recorded. It’s asked once.')
      await appendDecision(decisionsPath(s.home), { by: BY, kind: 'use-declaration', data: { use, policy: USE_POLICY_VERSION }, at: now().toISOString() })
      return status()
    },

    backupState,

    async addDestination({ path }) {
      const lib = current()
      const dir = folderParam(path)
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new HostError('That folder doesn’t exist. Choose an existing folder.')
      if (dir === lib || inside(dir, lib)) throw new HostError('A backup can’t go inside the library it’s backing up. Choose a folder elsewhere, ideally on another disk.')
      if ((state().destinations[lib] ?? []).includes(dir)) throw new HostError('That folder is already a backup destination.')
      setDestinations(lib, (l) => [...l, dir])
      return backupState()
    },

    async removeDestination({ path }) {
      const lib = current()
      setDestinations(lib, (l) => l.filter((d) => d !== path))
      return backupState()
    },

    async lowerBackupRequirement({ confirm }) {
      const lib = current()
      const from = bypassOf(await decisions(lib))
      if (from === 2) throw new HostError('No backups are required already.')
      const to = (from + 1) as BypassLevel
      if (confirm !== true || !canLowerBypass(from, to, 1)) throw new HostError('Going down a step needs its own confirmation.')
      await appendDecision(decisionsPath(lib), { by: BY, kind: 'backup-bypass', data: { from, to, confirmed: true }, at: now().toISOString() })
      return backupState()
    },

    async raiseBackupRequirement() {
      const lib = current()
      const from = bypassOf(await decisions(lib))
      if (from === 0) throw new HostError('Two backups are already required.')
      const to = (from - 1) as BypassLevel
      await appendDecision(decisionsPath(lib), { by: BY, kind: 'backup-bypass', data: { from, to }, at: now().toISOString() })
      return backupState()
    },

    async backUpEverywhere() {
      const lib = current()
      const results: BackupRun['results'] = []
      for (const d of state().destinations[lib] ?? []) {
        try {
          if (!existsSync(d)) throw new HostError('This folder can’t be found. Connect its disk and try again.')
          const cloud = isCloudSynced(d)
          const key = cloud ? await keys.backupKey(lib) : null
          if (cloud && !key) throw new HostError('This folder is synced to a cloud service, so copies there must be encrypted, and the Keychain isn’t built yet. Nothing was written.')
          const r = await backupTo(lib, d, { now: now(), ...(key ? { encryptWith: key } : {}) })
          results.push({ destination: d, ok: r.checked, files: r.files, encrypted: r.encrypted, problems: r.problems })
        } catch (e) {
          results.push({ destination: d, ok: false, files: 0, encrypted: false, problems: [(e as Error).message] })
        }
      }
      return { results, state: await backupState() }
    },

    // --- Demo

    async openDemo({ seed = 1 }) {
      if (!Number.isInteger(seed) || seed < 1) throw new HostError('The demo seed must be a whole number from 1.')
      const s = state()
      const dir = join(opts.stateDir, `Demo library (seed ${seed})`)
      if (!existsSync(join(dir, 'library.json'))) {
        await createDemoLibrary(dir, seed, now())
        loaded.delete(dir)
      }
      s.demo = dir
      s.current = dir
      save(s)
      return status()
    },

    async openHome() {
      const s = state()
      if (!s.home) throw new HostError('Choose a library folder first.')
      s.current = s.home
      save(s)
      return status()
    },

    // --- Screens

    async kits(): Promise<KitsResult> {
      const lib = current()
      const data = await load(lib)
      const gate = gateOf(await decisions(lib))
      const kits = data.kits.map((k) => ({
        kit: k.result.kit,
        name: k.name,
        service: 'Made-up (planted)',
        exportDate: k.exportDate,
        matches: k.result.observations.length,
        sharedMatchFiles: k.sharedFiles,
        sealedFiles: k.result.sealed.length,
        blind: gate.isBlind(k.result.kit),
        raw: k.raw
          ? { service: k.raw.details.service, chip: k.raw.details.chip, build: k.raw.details.build, generated: k.raw.details.generated, markers: k.raw.details.markers, noCalls: k.raw.details.noCalls }
          : null,
      }))
      const comparisons: KitsResult['comparisons'] = []
      for (let i = 0; i < data.kits.length; i++)
        for (let j = i + 1; j < data.kits.length; j++) {
          const a = data.kits[i]!
          const b = data.kits[j]!
          if (!a.raw || !b.raw) continue
          const c = compareKits(a.raw.calls, b.raw.calls, { map: ONE_CM_PER_MB, errorTolerance: 50 })
          comparisons.push({ a: a.result.kit, b: b.result.kit, totalCm: Math.round(c.totalCm), segments: c.segments.length, longestCm: Math.round(c.longestCm), map: c.map })
        }
      return { kits, comparisons }
    },

    async matches({ kit }): Promise<MatchRow[]> {
      const data = await load(current())
      const k = data.kits.find((x) => x.result.kit === kit)
      if (!k) throw new HostError('That kit isn’t in this library.')
      return k.result.observations.map((o) => ({
        match: o.match, name: o.name, cm: o.sharedCm, segments: o.segments, longestCm: o.longestCm, side: o.side, treeStatus: o.treeStatus, date: o.matchDate,
      }))
    },

    async theory(): Promise<TheoryResult | null> {
      const lib = current()
      const data = await load(lib)
      if (!data.ownTree) return null
      const tester = data.kits.find((k) => k.name === data.ownTree!.name)
      if (!tester) return null
      const gate = gateOf(await decisions(lib))
      if (gate.isBlind(tester.result.kit)) return { blind: true, kit: tester.result.kit, name: tester.name }
      gate.requireUnblinded(tester.result.kit, 'The recorded family tree')
      if (!data.truthFile) return null
      const truth = JSON.parse(readFileSync(data.truthFile, 'utf8')) as { planted: { kind: string; child?: string; recordedFather?: string; biologicalFather?: string }[]; persons: TreePerson[] }
      const p = truth.planted.find((x) => x.kind === 'misattributed-father')
      if (!p?.child || !p.recordedFather || !p.biologicalFather) return null
      const question = { child: p.child, recordedFather: p.recordedFather, biologicalFather: p.biologicalFather }
      return { blind: false, kit: tester.result.kit, name: tester.name, recorded: data.ownTree.doc, question, theory: withCandidateFathers(data.ownTree.doc, question, truth.persons) }
    },

    async segments({ a, b }) {
      const data = await load(current())
      const ka = data.kits.find((k) => k.result.kit === a)
      const kb = data.kits.find((k) => k.result.kit === b)
      if (!ka || !kb) throw new HostError('That kit isn’t in this library.')
      if (!ka.raw || !kb.raw) throw new HostError('Both kits need a raw DNA file to be compared.')
      const c = compareKits(ka.raw.calls, kb.raw.calls, { map: ONE_CM_PER_MB, errorTolerance: 50 })
      const chromosomes = [...ka.raw.calls.keys()].filter((chr) => /^\d+$/.test(chr) && kb.raw!.calls.has(chr)).map((chr) => {
        const pos = ka.raw!.calls.get(chr)!.position
        return {
          chromosome: chr,
          startCm: ONE_CM_PER_MB.toCm(chr, Number(pos[0] ?? 0)),
          endCm: ONE_CM_PER_MB.toCm(chr, Number(pos[pos.length - 1] ?? 0)),
          segments: c.segments.filter((s) => s.chromosome === chr).map((s) => ({ startCm: s.startCm, endCm: s.endCm, cm: s.cm, markers: s.markers })),
        }
      })
      return { a, b, totalCm: c.totalCm, longestCm: c.longestCm, map: c.map, comparedMarkers: c.comparedMarkers, chromosomes }
    },

    async unblind({ kit }) {
      const lib = current()
      const data = await load(lib)
      if (!data.kits.some((k) => k.result.kit === kit)) throw new HostError('That kit isn’t in this library.')
      const gate = gateOf(await decisions(lib))
      if (gate.isBlind(kit)) {
        await appendDecision(decisionsPath(lib), { by: BY, kind: 'unblind', data: { kit }, at: now().toISOString() })
        loaded.delete(lib)
      }
      return handlers.theory({})
    },
  }

  return {
    /** Run one method. Unknown methods are refused; only the handlers above can be reached. */
    async handle(method: string, params: unknown): Promise<unknown> {
      if (!Object.prototype.hasOwnProperty.call(handlers, method)) throw new HostError(`Unknown request "${method}".`)
      const fn = handlers[method as HostMethod] as (p: unknown) => Promise<unknown>
      return fn(params ?? {})
    },
    handlers,
  }
}
export type Host = ReturnType<typeof createHost>

function folderParam(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) throw new HostError('Choose a folder.')
  const p = path.trim().replace(/^~(?=\/|$)/, process.env['HOME'] ?? '~')
  if (!isAbsolute(p)) throw new HostError('Use a full folder path, starting with / or ~.')
  return resolve(p)
}
const inside = (child: string, parent: string) => {
  const r = relative(parent, child)
  return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}
/** "2026-11-10T12-00-00-000Z" (as backup folders are named) back to an ISO time. */
export function stampToIso(stamp: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp)
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null
}
