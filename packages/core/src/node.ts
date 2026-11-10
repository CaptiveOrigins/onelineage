/** Node helpers: load the terms register from a folder. Kept apart so the core stays free of file-system code. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerFromFiles, type TermsRegister } from './terms.js'

export function loadTermsRegister(dir: string): TermsRegister {
  const files: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.md')) files[name] = readFileSync(join(dir, name), 'utf8')
  }
  return registerFromFiles(files)
}
