/**
 * The app end of the link from the native host. Chrome starts the native host (native-main.ts) for the
 * extension; it passes messages to the running app over a Unix socket in the app's own folder, readable by
 * this user only. There's no network port, localhost included.
 */
import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { ExtensionBridge } from './bridge'

export const socketPath = (stateDir: string) => join(stateDir, 'extension.sock')

export function listenForExtension(path: string, bridge: Pick<ExtensionBridge, 'connect'>): Promise<Server> {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if (existsSync(path)) unlinkSync(path)
  let active: Socket | null = null
  const server = createServer((sock) => {
    // One extension connection at a time; a newer one replaces the older.
    active?.destroy()
    active = sock
    const lines = createInterface({ input: sock, crlfDelay: Infinity })
    let conn: ReturnType<ExtensionBridge['connect']> | null = null
    let queue = Promise.resolve()
    lines.on('line', (line) => {
      queue = queue.then(async () => {
        let msg: unknown
        try {
          msg = JSON.parse(line)
        } catch {
          sock.destroy()
          return
        }
        if (!conn) {
          const origin = (msg as { hello?: { origin?: unknown } })?.hello?.origin
          try {
            conn = bridge.connect(String(origin), (m) => sock.writable && sock.write(JSON.stringify(m) + '\n'))
            sock.write(JSON.stringify({ accepted: true }) + '\n')
          } catch (e) {
            sock.end(JSON.stringify({ refused: (e as Error).message }) + '\n')
          }
          return
        }
        await conn.receive(msg)
      })
    })
    sock.on('close', () => {
      conn?.close()
      if (active === sock) active = null
    })
    sock.on('error', () => sock.destroy())
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      chmodSync(path, 0o600)
      resolve(server)
    })
  })
}
