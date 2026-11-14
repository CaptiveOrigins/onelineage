/**
 * Optional masking for anything shared while privacy mode is on (OneFamily plan section 2b). Years and places
 * can identify a family even under stand-in names. Each is off by default, and is applied only when the
 * person chooses it for a share or an export.
 */

/** "1887", "12 Mar 1887" or "1887-03-12" → "1880s". Anything without a four-digit year is left as it is. */
export function maskYear(text: string): string {
  return text.replace(/\b(1[0-9]|20)(\d)\d\b/g, (_m, c: string, d: string) => `${c}${d}0s`).replace(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+(?=\d{3}0s)|\b(?=\d{3}0s-\d{2}-\d{2})/g, '').replace(/(\d{3}0s)-\d{2}-\d{2}/g, '$1')
}

/** "Harrowfield, Somecounty, Region C" → "Region C": only the last, broadest part is kept. */
export function maskPlace(place: string): string {
  const parts = place.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length ? (parts[parts.length - 1] as string) : ''
}
