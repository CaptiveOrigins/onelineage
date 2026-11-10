/**
 * The two-backup rule (decided by the owner, 2026-11-09). By default, two destinations must each hold a
 * checked copy from the last 30 days. A person can deliberately go down to one, or to none, with a separate
 * recorded confirmation for each step.
 */
export type DestinationStatus = { destination: string; lastCheckedBackup: string | null }
export type BypassLevel = 0 | 1 | 2 // 0: two required; 1: one is enough; 2: none required
export type BackupVerdict = { ok: boolean; required: number; current: number; message: string }

export function backupVerdict(status: readonly DestinationStatus[], bypass: BypassLevel, now = new Date(), maxAgeDays = 30): BackupVerdict {
  const required = bypass === 0 ? 2 : bypass === 1 ? 1 : 0
  const fresh = status.filter((s) => s.lastCheckedBackup && now.getTime() - Date.parse(s.lastCheckedBackup) <= maxAgeDays * 86400000).length
  const ok = fresh >= required
  const message = ok
    ? required === 0 && fresh === 0
      ? 'No backups. You chose this; your decisions and approvals would be lost with this Mac.'
      : `${fresh} checked backup${fresh === 1 ? '' : 's'} from the last ${maxAgeDays} days.`
    : `${fresh} of ${required} required backups are current. Back up before importing.`
  return { ok, required, current: fresh, message }
}

/** Going down needs a confirmation per step, recorded in the decisions log by the caller. */
export function canLowerBypass(from: BypassLevel, to: BypassLevel, confirmations: number): boolean {
  return to <= from || confirmations >= to - from
}
