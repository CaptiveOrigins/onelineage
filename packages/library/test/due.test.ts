import { describe, expect, it } from 'vitest'
import { dueItems, dueMessage } from '../src/index.js'

const now = new Date('2026-11-10T12:00:00Z')
describe('when kits are due', () => {
  it('a check every 13 weeks, a rerun once a year, most overdue first', () => {
    const items = dueItems([
      { kit: 'A', label: 'Kit A', lastExport: '2026-01-01', lastFullRun: '2025-06-01' },
      { kit: 'B', label: 'Kit B', lastExport: '2026-10-01', lastFullRun: null },
    ], now)
    expect(items.map((i) => `${i.kit} ${i.kind}`)).toEqual(['A check', 'A rerun'])
    expect(items.find((i) => i.kind === 'check')!.dueOn).toBe('2026-04-02')
  })
  it('nothing due gives no message; the message has counts only', () => {
    expect(dueMessage([])).toBeNull()
    const msg = dueMessage(dueItems([{ kit: 'A', label: 'Secret Kit Name', lastExport: '2025-01-01', lastFullRun: null }], now))!
    expect(msg).toBe('OneLineage: 1 kit due for a match-list check and 1 due for a yearly rerun. Open the app to see which.')
    expect(msg).not.toContain('Secret')
  })
  it('refuses a date it can’t read', () => {
    expect(() => dueItems([{ kit: 'A', label: 'A', lastExport: 'soon', lastFullRun: null }], now)).toThrow(/isn't a date/)
  })
})
