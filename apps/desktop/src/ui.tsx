import type { LucideIcon } from 'lucide-react'
import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { inMacApp, pickFolder } from './api'

/** Lucide icons at the suite's 1.75 stroke. Decorative: the text beside them carries the meaning. */
export function Icon({ of: Of, size = 16 }: { of: LucideIcon; size?: number }) {
  return <Of className="ol-icon" size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
}

/** How names are shown: as they are, or as stand-ins while privacy is on. Every screen reads names through this. */
export const NamesContext = createContext<{ privacy: boolean; show: (name: string) => string }>({ privacy: false, show: (n) => n })
export const useNames = () => useContext(NamesContext)

/** A plain error with what to do next. Technical detail isn't shown, because the host already words its errors. */
export function ErrorBox({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null
  return (
    <div className="ol-error" role="alert">
      <strong>That didn’t work.</strong> {error}{' '}
      {onDismiss && (
        <button type="button" className="ol-link" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

/**
 * Choosing a folder. In the Mac app, the system folder picker. In a browser during development there's no
 * picker, so a labelled path field takes its place.
 */
export function FolderField({ label, action, onChoose, busy }: { label: string; action: string; onChoose: (path: string) => Promise<boolean | void>; busy?: boolean }) {
  const id = useId()
  const [path, setPath] = useState('')
  if (inMacApp)
    return (
      <button
        type="button"
        className="ol-primary"
        disabled={busy}
        onClick={async () => {
          const p = await pickFolder(label)
          if (p) await onChoose(p)
        }}
      >
        {action}
      </button>
    )
  return (
    <form
      className="ol-field-row"
      onSubmit={(e) => {
        e.preventDefault()
        // Cleared once the folder is taken; kept when it's refused, so it can be corrected.
        if (path.trim()) void onChoose(path.trim()).then((ok) => ok !== false && setPath(''))
      }}
    >
      <label htmlFor={id}>
        {label}
        <input id={id} value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/Documents/OneFamily" spellCheck={false} autoComplete="off" />
      </label>
      <button type="submit" className="ol-primary" disabled={busy || !path.trim()}>
        {action}
      </button>
    </form>
  )
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="ol-facts">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'none yet')
