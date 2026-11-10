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

/** A consistent set of stand-ins. The same word (ignoring case) always gets the same stand-in. */
export function createStandIns(salt: string): StandIns {
  const forward = new Map<string, string>()
  const taken = new Map<string, string>()
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
        const c = standInCandidate(key, salt, attempt).toLowerCase()
        const owner = taken.get(c)
        // Never the word itself, and never a stand-in another word already has.
        if (c !== key && (owner === undefined || owner === key)) {
          s = c
          break
        }
        if (attempt > 10000) throw new Error('ran out of stand-in names')
      }
      forward.set(key, s)
      taken.set(s, key)
    }
    return matchCase(w, s)
  }
  return { word, name: (text) => text.replace(/\p{L}+/gu, (w) => word(w)) }
}

/** A fresh random salt for one session. */
export function sessionSalt(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
