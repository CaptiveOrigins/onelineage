/**
 * Stand-in names for the privacy switch. Each word of a name is replaced by an invented one, keyed on the
 * word itself, so every "Brathford" on screen becomes the same stand-in wherever it appears, whether it's a
 * match, a kit or a person in a tree. Digits and punctuation are kept, so "brath42" and "B. K." keep their shape.
 *
 * The salt is random per session in the app, so the stand-ins can't be looked up from a list made elsewhere.
 * Two different words never share a stand-in within one set. Single letters (initials) map to another
 * letter, and those can repeat.
 */

const ONSET = ['Al', 'Bel', 'Cor', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Iv', 'Jor', 'Kel', 'Lom', 'Mar', 'Nor', 'Or', 'Pel', 'Quin', 'Ros', 'Sel', 'Tor', 'Ul', 'Vel', 'Wyn', 'Yar', 'Zel']
const MID = ['a', 'e', 'i', 'o', 'u', 'ia', 'ea']
const END = ['ren', 'dal', 'mor', 'wyn', 'ton', 'ley', 'ric', 'ath', 'ell', 'son', 'brook', 'crest', 'dell', 'gate', 'holm', 'vale']
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** FNV-1a, 32-bit. Not for security: it spreads names evenly over the stand-in list. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** One candidate stand-in for a word (lower-case form), before collisions are resolved. */
export function standInCandidate(word: string, salt: string, attempt = 0): string {
  const h = hash(`${salt}\u0000${word.toLowerCase()}\u0000${attempt}`)
  if (word.length === 1) return LETTERS[h % LETTERS.length] as string
  const a = ONSET[h % ONSET.length] as string
  const b = MID[Math.floor(h / ONSET.length) % MID.length] as string
  const c = END[Math.floor(h / (ONSET.length * MID.length)) % END.length] as string
  return a + b + c
}

/** Copy the original's capitals: "SMITH" stays all capitals, "smith" all small, "Smith" capitalised. */
function matchCase(original: string, standIn: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return standIn.toUpperCase()
  if (original === original.toLowerCase()) return standIn.toLowerCase()
  return standIn.charAt(0).toUpperCase() + standIn.slice(1).toLowerCase()
}

export type StandIns = {
  /** The stand-in for one word. */
  word: (word: string) => string
  /** A whole name or label: each run of letters is replaced, everything else kept. */
  name: (text: string) => string
}

/** Endings and beginnings kept as they are, so a stand-in keeps the original's kind of name. */
const SUFFIXES = ['sdotter', 'dotter', 'sdatter', 'datter', 'sson', 'son', 'sen', 'ovich', 'ova', 'ez'] as const
// Only joined-on prefixes. Separate words such as "van", "de" and "St" get their own stand-ins.
const PREFIXES = ['mac', 'mc', 'fitz'] as const

/** Split a lower-case word into a kept prefix, a core to replace, and a kept suffix. */
export function splitStyle(word: string): { prefix: string; core: string; suffix: string } {
  let w = word
  let prefix = ''
  let suffix = ''
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 3) { prefix = p; w = w.slice(p.length); break }
  for (const x of SUFFIXES) if (w.endsWith(x) && w.length - x.length >= 3) { suffix = x; w = w.slice(0, -x.length); break }
  return { prefix, core: w, suffix }
}

/**
 * A rough sound-alike key, so spellings of one name (invented examples: Vellén and Velleen, Garrick and Garick) share a stand-in
 * root. Accents are dropped, prefixes and suffixes ignored, vowels after the first letter dropped, and
 * similar consonants merged.
 */
export function variantKey(word: string): string {
  const plain = word.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const { core } = splitStyle(plain)
  const c = core.replace(/ph/g, 'f').replace(/[ckq]/g, 'k').replace(/[sz]/g, 's').replace(/[dt]/g, 't').replace(/[bp]/g, 'p').replace(/[gj]/g, 'g').replace(/[mn]/g, 'n').replace(/w/g, 'v')
  const tail = c.slice(1).replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1')
  return (c[0] ?? '') + tail
}

export type StandInOptions = {
  /** Stand-ins already given in this library: word → stand-in. They're kept as they are. */
  known?: Readonly<Record<string, string>>
  /** Real words in this library. A stand-in is never one of them. */
  reserved?: Iterable<string>
  /** Called once for each new pairing, so it can be saved and reused next time. */
  onNew?: (word: string, standIn: string) => void
}

/**
 * A consistent set of stand-ins. The same word (ignoring case) always gets the same stand-in. With `known`
 * from the library, that holds across sessions and recordings too. Spelling variants share a root.
 */
export function createStandIns(salt: string, opts: StandInOptions = {}): StandIns {
  const forward = new Map<string, string>()
  const taken = new Map<string, string>()
  const reserved = new Set([...(opts.reserved ?? [])].map((w) => w.toLowerCase()))
  for (const [w, s] of Object.entries(opts.known ?? {})) { forward.set(w.toLowerCase(), s.toLowerCase()); taken.set(s.toLowerCase(), w.toLowerCase()) }
  const styled = (key: string, attempt: number) => {
    const { prefix, core, suffix } = splitStyle(key)
    if (!core) return standInCandidate(key, salt, attempt).toLowerCase()
    // Root from the sound-alike group, so variants look related; ending from the word itself.
    const root = standInCandidate(variantKey(key) || key, salt, 0).toLowerCase().slice(0, 4)
    const tail = standInCandidate(key, salt, attempt + 1).toLowerCase().slice(-3)
    return prefix + (suffix ? root : root + tail) + suffix
  }
  const word = (w: string) => {
    const key = w.toLowerCase()
    let s = forward.get(key)
    if (!s && key.length === 1) {
      // Initials: a different letter, the same every time. Initials are ambiguous anyway, so letters may repeat.
      for (let attempt = 0; !s || s === key; attempt++) s = standInCandidate(key, salt, attempt).toLowerCase()
      forward.set(key, s)
    }
    if (!s) {
      for (let attempt = 0; ; attempt++) {
        const c = attempt < 50 ? styled(key, attempt) : standInCandidate(key, salt, attempt).toLowerCase()
        const owner = taken.get(c)
        // Never the word itself, never a real word in this library, and never a stand-in another word already has.
        if (c !== key && !reserved.has(c) && (owner === undefined || owner === key)) {
          s = c
          break
        }
        if (attempt > 10000) throw new Error('ran out of stand-in names')
      }
      forward.set(key, s)
      taken.set(s, key)
      opts.onNew?.(key, s)
    }
    return matchCase(w, s)
  }
  // "O'" before a surname is kept as it is, like other prefixes.
  return { word, name: (text) => text.replace(/(?<!\p{L})(O['’])?(\p{L}+)/gu, (_m, o: string | undefined, w: string) => (o ?? '') + word(w)) }
}

/** A fresh random salt for one session. */
export function sessionSalt(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
