/**
 * The native host Chrome starts for the extension. It checks the caller's origin, then relays framed messages
 * between Chrome (stdin and stdout) and the running app (its Unix socket). It holds nothing and decides
 * nothing else: the app checks the origin again, and owns every rule.
 */
import { connect } from 'node:net'
import { createInterface } from 'node:readline'
import { encodeFrame, FrameReader } from './framing'
import { extensionIdFromOrigin } from './wire'

/** Chrome on macOS passes the caller's origin as the first argument: chrome-extension://<id>/. */
export function callerOrigin(argv: readonly string[]): string | null {
  const origin = argv.find((a) => a.startsWith('chrome-extension://')) ?? null
  return origin && extensionIdFromOrigin(origin) ? origin : null
}

export type RelayIo = {
  argv: readonly string[]
  stdin: NodeJS.ReadableStream
  write: (bytes: Uint8Array) => void
  socketPath: string
  exit: (code: number) => void
}

export function runRelay(io: RelayIo): void {
  const fail = (error: string) => {
    io.write(encodeFrame({ type: 'response', id: 'hello', ok: false, error }))
    io.exit(1)
  }
  const origin = callerOrigin(io.argv)
  if (!origin) return fail('Only a Chrome extension can start the OneFamily native host.')

  const sock = connect(io.socketPath)
  let accepted = false
  const pendingFrames: unknown[] = []
  sock.on('error', () => fail('OneFamily isn’t open. Open the app, then try again.'))
  sock.on('connect', () => sock.write(JSON.stringify({ hello: { origin } }) + '\n'))
  sock.on('close', () => io.exit(0))
  createInterface({ input: sock, crlfDelay: Infinity }).on('line', (line) => {
    let msg: { accepted?: boolean; refused?: string }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (!accepted) {
      if (msg.accepted) {
        accepted = true
        for (const f of pendingFrames.splice(0)) sock.write(JSON.stringify(f) + '\n')
      } else fail(msg.refused ?? 'OneFamily refused this connection.')
      return
    }
    try {
      io.write(encodeFrame(msg))
    } catch {
      // Over Chrome's 1 MB limit: the app never sends that much, so drop it rather than break the stream.
    }
  })

  const reader = new FrameReader()
  io.stdin.on('data', (chunk: Buffer) => {
    let frames: unknown[]
    try {
      frames = reader.push(new Uint8Array(chunk))
    } catch {
      sock.destroy()
      io.exit(1)
      return
    }
    for (const f of frames) {
      if (accepted) sock.write(JSON.stringify(f) + '\n')
      else pendingFrames.push(f)
    }
  })
  // Chrome closes stdin when the extension disconnects or Chrome quits: end the app link with it.
  io.stdin.on('end', () => sock.end())
}
