/**
 * The terms register (ADR 0004): what each service's terms allow OneLineage to do.
 *
 * One Markdown file per service in `terms/`, with a front-matter block the engine parses.
 * A capability is used only if its verdict is exactly "allowed". Anything else, a missing
 * file, a missing capability or an unreadable block, refuses. Unclear means no.
 */

export const CAPABILITIES = [
  'read_own_matches',
  'automate_page_visits',
  'site_export',
  'write_labels',
  'official_api',
  'raw_upload',
] as const
export type Capability = (typeof CAPABILITIES)[number]

export const VERDICTS = ['allowed', 'not-allowed', 'unclear', 'n/a'] as const
export type Verdict = (typeof VERDICTS)[number]

export type SiteTerms = {
  site: string
  name: string
  /** Date the terms were read, YYYY-MM-DD. */
  read: string
  sources: string[]
  capabilities: Record<Capability, Verdict>
}

export class TermsParseError extends Error {
  constructor(public readonly file: string, message: string) {
    super(`${file}: ${message}`)
    this.name = 'TermsParseError'
  }
}

export class CapabilityRefused extends Error {
  constructor(
    public readonly site: string,
    public readonly capability: Capability,
    public readonly verdict: Verdict | 'missing',
  ) {
    super(
      verdict === 'missing'
        ? `${capability} is refused for ${site}: the terms register has no entry for it, so the answer is no.`
        : `${capability} is refused for ${site}: the terms register says "${verdict}". Only "allowed" is used.`,
    )
    this.name = 'CapabilityRefused'
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+$/

/**
 * Parse one terms file. Only a small, strict subset of YAML is accepted, on purpose:
 * `key: value` lines, a `sources:` list of `  - url` lines and a `capabilities:` map of
 * `  name: verdict` lines. Anything unexpected is an error, never a silent default.
 */
export function parseTermsFile(file: string, text: string): SiteTerms {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0] !== '---') throw new TermsParseError(file, 'must start with a "---" front-matter line')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new TermsParseError(file, 'front matter has no closing "---" line')

  const top: Record<string, string> = {}
  const sources: string[] = []
  const caps: Partial<Record<Capability, Verdict>> = {}
  let block: 'sources' | 'capabilities' | null = null

  for (let i = 1; i < end; i++) {
    const raw = lines[i] ?? ''
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue
    const where = `line ${i + 1}`
    if (!raw.startsWith(' ')) {
      const m = /^([a-z_]+):\s*(.*)$/.exec(raw)
      if (!m) throw new TermsParseError(file, `${where}: expected "key: value"`)
      const [, key, value] = m as unknown as [string, string, string]
      if (key === 'sources' || key === 'capabilities') {
        if (value !== '') throw new TermsParseError(file, `${where}: "${key}:" takes indented lines below it`)
        block = key
        continue
      }
      if (!['site', 'name', 'read'].includes(key)) throw new TermsParseError(file, `${where}: unknown key "${key}"`)
      if (key in top) throw new TermsParseError(file, `${where}: "${key}" appears twice`)
      top[key] = value.trim()
      block = null
      continue
    }
    if (block === 'sources') {
      const m = /^\s+-\s+(https:\/\/\S+)\s*$/.exec(raw)
      if (!m) throw new TermsParseError(file, `${where}: sources must be "  - https://…" lines`)
      sources.push(m[1] as string)
    } else if (block === 'capabilities') {
      const m = /^\s+([a-z_]+):\s*(\S+)\s*$/.exec(raw)
      if (!m) throw new TermsParseError(file, `${where}: capabilities must be "  name: verdict" lines`)
      const [, name, verdict] = m as unknown as [string, string, string]
      if (!(CAPABILITIES as readonly string[]).includes(name)) throw new TermsParseError(file, `${where}: unknown capability "${name}"`)
      if (!(VERDICTS as readonly string[]).includes(verdict)) {
        throw new TermsParseError(file, `${where}: verdict for ${name} must be one of ${VERDICTS.join(', ')}`)
      }
      if (name in caps) throw new TermsParseError(file, `${where}: "${name}" appears twice`)
      caps[name as Capability] = verdict as Verdict
    } else {
      throw new TermsParseError(file, `${where}: indented line outside "sources:" or "capabilities:"`)
    }
  }

  const site = top['site'] ?? ''
  if (!SLUG.test(site)) throw new TermsParseError(file, 'site must be a lowercase slug')
  if (!top['name']) throw new TermsParseError(file, 'name is required')
  const read = top['read'] ?? ''
  if (!DATE.test(read)) throw new TermsParseError(file, 'read must be a YYYY-MM-DD date')
  if (sources.length === 0) throw new TermsParseError(file, 'at least one source URL is required')
  const missing = CAPABILITIES.filter((c) => !(c in caps))
  if (missing.length) throw new TermsParseError(file, `every capability needs a verdict; missing: ${missing.join(', ')}`)

  return { site, name: top['name'], read, sources, capabilities: caps as Record<Capability, Verdict> }
}

/** The loaded register. Refuses by default. */
export class TermsRegister {
  private readonly sites: ReadonlyMap<string, SiteTerms>

  constructor(entries: readonly SiteTerms[]) {
    const map = new Map<string, SiteTerms>()
    for (const e of entries) {
      if (map.has(e.site)) throw new Error(`terms register: ${e.site} is listed twice`)
      map.set(e.site, e)
    }
    this.sites = map
  }

  /** The verdict, or "missing" if the site or capability isn't in the register. */
  verdict(site: string, capability: Capability): Verdict | 'missing' {
    return this.sites.get(site)?.capabilities[capability] ?? 'missing'
  }

  /** True only when the verdict is exactly "allowed". */
  allows(site: string, capability: Capability): boolean {
    return this.verdict(site, capability) === 'allowed'
  }

  /** Throws CapabilityRefused unless the verdict is exactly "allowed". Connectors call this before acting. */
  require(site: string, capability: Capability): void {
    const v = this.verdict(site, capability)
    if (v !== 'allowed') throw new CapabilityRefused(site, capability, v)
  }

  entry(site: string): SiteTerms | undefined {
    return this.sites.get(site)
  }

  list(): SiteTerms[] {
    return [...this.sites.values()].sort((a, b) => a.site.localeCompare(b.site))
  }
}

/** Build a register from file contents: `{ "ancestry.md": "---\n…" }`. README.md is skipped. */
export function registerFromFiles(files: Readonly<Record<string, string>>): TermsRegister {
  const entries: SiteTerms[] = []
  for (const [name, text] of Object.entries(files)) {
    if (!name.endsWith('.md') || name.toLowerCase() === 'readme.md') continue
    const parsed = parseTermsFile(name, text)
    if (`${parsed.site}.md` !== name) throw new TermsParseError(name, `file name must be ${parsed.site}.md`)
    entries.push(parsed)
  }
  return new TermsRegister(entries)
}
