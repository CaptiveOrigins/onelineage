import type { Family } from './scenario.js'

/** The planted answers, without genomes: what an analysis should find. Written beside the exports. */
export function truthJson(family: Family): string {
  return JSON.stringify(
    {
      madeUp: 'Every person in this file is invented. Nothing here describes a real family.',
      seed: family.seed,
      generatorVersion: family.generatorVersion,
      kits: family.kits,
      planted: family.planted,
      persons: family.persons.map(({ id, given, surname, sex, birthYear, deathYear, father, mother, bioFather, bioMother, tested, guid, displayName, noise }) => ({
        id, given, surname, sex, birthYear, deathYear, father, mother, bioFather, bioMother, tested, guid, displayName, noise,
      })),
    },
    null,
    2,
  )
}
