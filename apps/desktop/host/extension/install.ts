/**
 * Installs the native messaging host for the current user, only when the person runs it:
 *
 *   node apps/desktop/host-dist/install-native-host.mjs --extension-id <id> [--node /path/to/node] [--dry-run]
 *
 * The extension ID must be the one trusted in OneFamily's settings (or the published one, once there is one).
 * It writes two files and prints them: a launcher in ~/Library/Application Support/OneFamily/native-host/
 * and Chrome's manifest in ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installPlan } from './manifest'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = args.includes('--dry-run')
const ids = args.flatMap((a, i) => (args[i - 1] === '--extension-id' ? [a] : []))
/** Node as the app finds it: ONEFAMILY_NODE, then Homebrew's stable links, then the Node running this script. */
const defaultNode = () =>
  [process.env['ONEFAMILY_NODE'], '/opt/homebrew/bin/node', '/usr/local/bin/node'].find((p): p is string => Boolean(p && existsSync(p))) ?? process.execPath
const hostScript = join(dirname(fileURLToPath(import.meta.url)), 'native-host.mjs')
if (!existsSync(hostScript)) {
  console.error(`Build the host first (pnpm --filter onefamily-desktop build:host): ${hostScript} is missing.`)
  process.exit(1)
}
try {
  const plan = installPlan({ home: homedir(), node: opt('--node') ?? defaultNode(), hostScript, developerIds: ids })
  for (const f of plan) {
    console.log(`${dryRun ? 'Would write' : 'Writing'} ${f.path}`)
    if (dryRun) console.log(f.content)
    else {
      mkdirSync(dirname(f.path), { recursive: true })
      writeFileSync(f.path, f.content)
      chmodSync(f.path, f.mode)
    }
  }
  if (!dryRun) console.log('Done. Restart Chrome so it reads the new manifest.')
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
