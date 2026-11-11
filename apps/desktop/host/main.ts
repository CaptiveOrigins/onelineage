/**
 * The host as the Mac app runs it: one JSON request per line on stdin, one JSON reply per line on stdout,
 * in order. Nothing else is written to stdout. The state folder comes from ONELINEAGE_STATE_DIR.
 */
import { createInterface } from 'node:readline'
import { createHost, defaultStateDir } from './handlers'
import { keychainStore } from './keychain'
import { noKeyStore } from './keys'
import { listenForExtension, socketPath } from './extension/socket'

const stateDir = process.env['ONELINEAGE_STATE_DIR'] || defaultStateDir()
// The real Keychain on a Mac. Tests and the browser dev server never use it.
const host = createHost({ stateDir, keys: process.platform === 'darwin' ? keychainStore() : noKeyStore })

// The extension reaches the app through Chrome's native messaging host, which relays over this socket (ADR 0009).
void host.extension.ready.then(() =>
  listenForExtension(socketPath(stateDir), host.extension).catch((e: Error) => process.stderr.write(`Extension link not started: ${e.message}\n`)),
)
setInterval(() => host.extension.expire(), 5000).unref()
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

let queue = Promise.resolve()
lines.on('line', (line) => {
  queue = queue.then(async () => {
    let id: unknown = null
    try {
      const req = JSON.parse(line) as { id: unknown; method: string; params: unknown }
      id = req.id
      const result = await host.handle(req.method, req.params)
      process.stdout.write(JSON.stringify({ id, result: result ?? null }) + '\n')
    } catch (e) {
      process.stdout.write(JSON.stringify({ id, error: (e as Error).message }) + '\n')
    }
  })
})
lines.on('close', () => void queue.then(() => process.exit(0)))
