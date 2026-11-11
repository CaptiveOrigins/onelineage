/**
 * Human pace. Between pages, a random pause of 30 to 60 seconds. Tests may pass shorter bounds; the extension
 * itself never does, because nothing the app sends can change them.
 */
import { PAUSE_MAX_MS, PAUSE_MIN_MS } from './wire'

export type Pace = { minMs: number; maxMs: number }
export const HUMAN_PACE: Pace = { minMs: PAUSE_MIN_MS, maxMs: PAUSE_MAX_MS }

export function pauseMs(random: () => number, pace: Pace = HUMAN_PACE): number {
  const r = Math.min(Math.max(random(), 0), 1)
  return Math.round(pace.minMs + r * (pace.maxMs - pace.minMs))
}
