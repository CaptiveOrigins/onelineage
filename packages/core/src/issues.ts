/** Problems are explained, never silently repaired: each has a code, plain words and a place. */
export type IssueSeverity = 'error' | 'notice'
export type Issue = { severity: IssueSeverity; code: string; message: string; file?: string; row?: number; column?: string }

export class ImportRefused extends Error {
  constructor(public readonly issues: readonly Issue[]) {
    const errors = issues.filter((i) => i.severity === 'error')
    super(`import refused: ${errors.length} problem${errors.length === 1 ? '' : 's'}. First: ${errors[0]?.message ?? 'unknown'}`)
    this.name = 'ImportRefused'
  }
}
