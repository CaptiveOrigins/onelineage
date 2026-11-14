/**
 * Chrome's native messaging host manifest, and the files the install script writes. Writing them is left to
 * the person, who runs the install script themselves; nothing here writes outside a test folder on its own.
 */
import { join } from 'node:path'
import { NATIVE_HOST_NAME, PUBLISHED_EXTENSION_ID } from './wire'

export type NativeHostManifest = { name: string; description: string; path: string; type: 'stdio'; allowed_origins: string[] }

const ID = /^[a-p]{32}$/

/** The manifest, listing only our extension's IDs. Refuses an empty list or anything that isn't an extension ID. */
export function nativeHostManifest(p: { path: string; extensionIds: readonly string[] }): NativeHostManifest {
  if (p.extensionIds.length === 0) throw new Error('List at least one extension ID: the published one, or a developer build trusted in the app.')
  for (const id of p.extensionIds) if (!ID.test(id)) throw new Error(`"${id}" isn’t a Chrome extension ID (32 letters, a to p).`)
  if (!p.path.startsWith('/')) throw new Error('The host path must be absolute; Chrome requires it on macOS.')
  return {
    name: NATIVE_HOST_NAME,
    description: 'OneFamily: lets the OneFamily extension talk to the OneFamily app on this Mac.',
    path: p.path,
    type: 'stdio',
    allowed_origins: [...new Set(p.extensionIds)].map((id) => `chrome-extension://${id}/`),
  }
}

/** The template committed in native-host/, with placeholders the install script fills in. */
export function manifestTemplate(): string {
  const m = { ...nativeHostManifest({ path: '/__HOST_PATH__', extensionIds: ['a'.repeat(32)] }), path: '__HOST_PATH__', allowed_origins: ['chrome-extension://__EXTENSION_ID__/'] }
  return JSON.stringify(m, null, 2) + '\n'
}

export type InstallFile = { path: string; content: string; mode: number }

/**
 * What the install script writes: a small launcher that starts the host with Node, and the manifest in
 * Chrome's per-user NativeMessagingHosts folder. The launcher lives in OneFamily's own folder.
 */
export function installPlan(p: { home: string; node: string; hostScript: string; developerIds: readonly string[] }): InstallFile[] {
  const ids = [...(PUBLISHED_EXTENSION_ID ? [PUBLISHED_EXTENSION_ID] : []), ...p.developerIds]
  const launcher = join(p.home, 'Library', 'Application Support', 'OneFamily', 'native-host', 'onefamily-native-host')
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  return [
    {
      path: launcher,
      content: `#!/bin/sh\n# Started by Chrome for the OneFamily extension. Written by OneFamily's install script.\nexec ${q(p.node)} ${q(p.hostScript)} "$@"\n`,
      mode: 0o755,
    },
    {
      path: join(p.home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`),
      content: JSON.stringify(nativeHostManifest({ path: launcher, extensionIds: ids }), null, 2) + '\n',
      mode: 0o644,
    },
  ]
}
