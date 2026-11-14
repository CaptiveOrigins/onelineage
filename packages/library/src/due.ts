/**
 * When a kit is due for work (decided by the owner, 2026-11-09): a fresh match-list check about every 13
 * weeks, and a full rerun once a year. The reasons are counts and dates only. They're what a notification
 * or the counts-only email says, so they never carry names or DNA details.
 */
export type KitDates = { kit: string; label: string; lastExport: string; lastFullRun: string | null }
export type DueItem = { kit: string; label: string; kind: 'check' | 'rerun'; dueOn: string; overdueDays: number; reason: string }

export const CHECK_EVERY_DAYS = 91
export const RERUN_EVERY_DAYS = 365

const day = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export function dueItems(kits: readonly KitDates[], now: Date, opts: { checkEveryDays?: number; rerunEveryDays?: number } = {}): DueItem[] {
  const check = opts.checkEveryDays ?? CHECK_EVERY_DAYS
  const rerun = opts.rerunEveryDays ?? RERUN_EVERY_DAYS
  const out: DueItem[] = []
  for (const k of kits) {
    const last = Date.parse(k.lastExport)
    if (Number.isNaN(last)) throw new Error(`${k.label}: last export date "${k.lastExport}" isn't a date`)
    const checkDue = last + check * day
    if (now.getTime() >= checkDue) {
      const over = Math.floor((now.getTime() - checkDue) / day)
      out.push({ kit: k.kit, label: k.label, kind: 'check', dueOn: iso(checkDue), overdueDays: over, reason: `Last match-list export ${k.lastExport}; a check is due every ${Math.round(check / 7)} weeks.` })
    }
    const base = Date.parse(k.lastFullRun ?? k.lastExport)
    const rerunDue = base + rerun * day
    if (now.getTime() >= rerunDue) {
      out.push({ kit: k.kit, label: k.label, kind: 'rerun', dueOn: iso(rerunDue), overdueDays: Math.floor((now.getTime() - rerunDue) / day), reason: `Last full run ${k.lastFullRun ?? 'never recorded'}; a full rerun is due once a year.` })
    }
  }
  return out.sort((a, b) => b.overdueDays - a.overdueDays || a.label.localeCompare(b.label))
}

/** The counts-only text for a notification or an email: no names, no cM, no DNA details. */
export function dueMessage(items: readonly DueItem[]): string | null {
  if (!items.length) return null
  const checks = items.filter((i) => i.kind === 'check').length
  const reruns = items.filter((i) => i.kind === 'rerun').length
  const parts = [checks ? `${checks} kit${checks === 1 ? '' : 's'} due for a match-list check` : '', reruns ? `${reruns} due for a yearly rerun` : ''].filter(Boolean)
  return `OneFamily: ${parts.join(' and ')}. Open the app to see which.`
}
