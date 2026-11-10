/**
 * Approximate sex-averaged genetic lengths of the 22 autosomes, in centimorgans.
 * Rounded, illustrative values in the range published genetic maps give (total about 3,500 cM).
 * They make simulated sharing realistic; they aren't used for any real person.
 */
export const AUTOSOME_CM: readonly number[] = [
  284, 266, 222, 213, 202, 190, 185, 167, 166, 180, 156, 170, 127, 117, 132, 133, 135, 128, 108, 108, 62, 72,
]
export const GENOME_CM = AUTOSOME_CM.reduce((a, b) => a + b, 0)

/** One stretch of one chromosome copy, inherited from a founder's chromosome copy (label). */
export type Segment = { start: number; end: number; label: string }
/** One copy of every autosome. */
export type Haplotype = Segment[][]
/** A person's two copies: [from father, from mother]. */
export type Genome = [Haplotype, Haplotype]
