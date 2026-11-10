/**
 * The decisions log: every choice a person made that the data can't recreate. That covers unblinding,
 * confirmed identity links, approved theory changes, label batches, backup bypasses and use declarations.
 * It's append-only JSON Lines, and each entry carries the hash of the one before it, so an edit or a missing
 * line shows up (the same idea as the ops ledger).
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { sha256Hex } from '@captiveorigins/onelineage-core'

export type DecisionKind = 'unblind' | 'identity-link' | 'theory-status' | 'label-batch' | 'backup-bypass' | 'use-declaration' | (string & {})
export type Decision = { seq: number; at: string; by: string; kind: DecisionKind; data: Record<string, unknown>; prev: string; hash: string }

const enc = new TextEncoder()
const GENESIS = '0'.repeat(64)
const body = (d: Omit<Decision, 'hash'>) => JSON.stringify({ seq: d.seq, at: d.at, by: d.by, kind: d.kind, data: d.data, prev: d.prev })

export class DecisionLogBroken extends Error {
  constructor(public readonly line: number, why: string) {
    super(`decisions log is broken at line ${line}: ${why}. Nothing more is written until it's restored from a backup.`)
    this.name = 'DecisionLogBroken'
  }
}

export async function readDecisions(path: string): Promise<Decision[]> {
  if (!existsSync(path)) return []
  const out: Decision[] = []
  let prev = GENESIS
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l !== '')
  for (let i = 0; i < lines.length; i++) {
    let d: Decision
    try {
      d = JSON.parse(lines[i] as string) as Decision
    } catch {
      throw new DecisionLogBroken(i + 1, 'not valid JSON')
    }
    if (d.seq !== i + 1) throw new DecisionLogBroken(i + 1, `expected entry ${i + 1}, found ${d.seq}`)
    if (d.prev !== prev) throw new DecisionLogBroken(i + 1, 'its link to the previous entry does not match')
    if ((await sha256Hex(enc.encode(body(d)))) !== d.hash) throw new DecisionLogBroken(i + 1, 'its contents were changed after it was written')
    prev = d.hash
    out.push(d)
  }
  return out
}

export async function appendDecision(path: string, entry: { by: string; kind: DecisionKind; data: Record<string, unknown>; at?: string }): Promise<Decision> {
  const existing = await readDecisions(path)
  const last = existing[existing.length - 1]
  const draft = { seq: existing.length + 1, at: entry.at ?? new Date().toISOString(), by: entry.by, kind: entry.kind, data: entry.data, prev: last?.hash ?? GENESIS }
  const d: Decision = { ...draft, hash: await sha256Hex(enc.encode(body(draft))) }
  appendFileSync(path, JSON.stringify(d) + '\n')
  return d
}
