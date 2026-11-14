/**
 * First launch: choose a library folder, say which kind of use this is, then set up backups. Each step is
 * worked out from what's already recorded, so quitting halfway picks up where it stopped.
 */
import type { BackupState, Status } from '../host/protocol'

export type FirstLaunchStep = 'library' | 'use' | 'backups' | 'ready'
export const FIRST_LAUNCH_STEPS: readonly Exclude<FirstLaunchStep, 'ready'>[] = ['library', 'use', 'backups']

export type FlowInputs = {
  hasLibrary: boolean
  useDeclared: boolean
  /** Backup destinations chosen for the library. */
  destinations: number
  /** How many the current rule requires: 2 by default, fewer only after recorded confirmations. */
  required: number
}

export function firstLaunchStep(i: FlowInputs): FirstLaunchStep {
  if (!i.hasLibrary) return 'library'
  if (!i.useDeclared) return 'use'
  if (i.destinations < i.required) return 'backups'
  return 'ready'
}

/** The inputs, from the host's status of the user's own library (never the demo) and its backup state. */
export function flowInputs(status: Status, backups: BackupState | null): FlowInputs {
  return {
    hasLibrary: status.home !== null,
    useDeclared: Boolean(status.home?.use),
    destinations: backups?.destinations.length ?? 0,
    required: backups?.required ?? 2,
  }
}

/** "Step 2 of 3", for the heading and screen readers. */
export function stepLabel(step: FirstLaunchStep): string {
  const i = FIRST_LAUNCH_STEPS.indexOf(step as Exclude<FirstLaunchStep, 'ready'>)
  return i < 0 ? '' : `Step ${i + 1} of ${FIRST_LAUNCH_STEPS.length}`
}

/**
 * Going down from the two-backup default takes one confirmation per step. This says what the next step
 * down is, and what would be lost, so the confirmation can say it plainly. Null when there's no step left.
 */
export function nextStepDown(bypass: 0 | 1 | 2): { to: 1 | 2; button: string; loses: string; confirm: string } | null {
  if (bypass === 0)
    return {
      to: 1,
      button: 'Use one backup instead',
      loses: 'With one backup, a single lost or failed disk can leave you with no copy of your decisions, approvals and imported files.',
      confirm: 'Yes, one backup is enough',
    }
  if (bypass === 1)
    return {
      to: 2,
      button: 'Use no backups',
      loses: 'With no backups, everything you decide and approve in OneFamily is lost if this Mac is lost or its disk fails. Raw exports can be downloaded again; your decisions can’t.',
      confirm: 'Yes, use no backups',
    }
  return null
}

export function requirementText(bypass: 0 | 1 | 2): string {
  return bypass === 0 ? 'Two backups are required (the default).' : bypass === 1 ? 'One backup is required. You chose this.' : 'No backups are required. You chose this.'
}
