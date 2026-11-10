/**
 * The adjusted Rand index (Hubert and Arabie, 1985): how well two groupings of the same items agree, corrected for
 * chance. 1 is identical up to the group names; around 0 is no better than chance. Used to compare runs, and
 * to compare with other tools.
 */
export function adjustedRandIndex<K>(x: ReadonlyMap<K, string | number>, y: ReadonlyMap<K, string | number>): number {
  const keys = [...x.keys()].filter((k) => y.has(k))
  const n = keys.length
  if (n < 2) return 1
  const table = new Map<string, number>()
  const rows = new Map<string, number>()
  const cols = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const k of keys) {
    const a = String(x.get(k))
    const b = String(y.get(k))
    bump(table, `${a}\u0000${b}`)
    bump(rows, a)
    bump(cols, b)
  }
  const c2 = (v: number) => (v * (v - 1)) / 2
  let index = 0
  for (const v of table.values()) index += c2(v)
  let sa = 0
  for (const v of rows.values()) sa += c2(v)
  let sb = 0
  for (const v of cols.values()) sb += c2(v)
  const expected = (sa * sb) / c2(n)
  const max = (sa + sb) / 2
  if (max === expected) return 1
  return (index - expected) / (max - expected)
}
