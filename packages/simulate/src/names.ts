import type { Rng } from './rng.js'

/**
 * Invented names, built from syllables so they read like names without being anyone's.
 * Every planted family is made up; these lists exist so nothing real can slip in.
 */
const ONSET = ['b', 'br', 'c', 'cl', 'd', 'dr', 'f', 'g', 'gr', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'th', 'v', 'w']
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ou', 'ei']
const CODA = ['n', 'r', 'l', 's', 'th', 'm', 'nd', 'rt', 'st', 'ck']
const SUR_END = ['ford', 'well', 'ton', 'by', 'mere', 'wick', 'dale', 'hurst', 'stead', 'grove', 'more', 'ley']
const GIVEN_F_END = ['a', 'ie', 'ette', 'ine', 'elle', 'ia']
const GIVEN_M_END = ['an', 'or', 'en', 'el', 'us', 'ard']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const syl = (rng: Rng) => rng.pick(ONSET) + rng.pick(VOWEL)

export function surname(rng: Rng): string {
  return cap(syl(rng) + rng.pick(CODA) + rng.pick(SUR_END))
}
export function givenName(rng: Rng, sex: 'M' | 'F'): string {
  return cap(syl(rng) + (rng.chance(0.4) ? rng.pick(CODA) : '') + rng.pick(sex === 'F' ? GIVEN_F_END : GIVEN_M_END))
}
export function place(rng: Rng): string {
  return `${cap(syl(rng) + rng.pick(SUR_END))}, Region ${'ABCDEFGH'[rng.int(0, 7)]}`
}
/** A made-up username like the handles some testers use. */
export function handle(rng: Rng): string {
  return syl(rng) + rng.pick(CODA) + rng.int(10, 99)
}
