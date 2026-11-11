/**
 * Chrome native messaging framing: each message is UTF-8 JSON preceded by its length as a 32-bit unsigned
 * integer in native byte order (little-endian on every Mac OneLineage runs on). Chrome refuses messages
 * from the host over 1 MB, and sends at most 64 MiB to it.
 */

export const MAX_TO_CHROME = 1024 * 1024
export const MAX_FROM_CHROME = 64 * 1024 * 1024

export class FramingError extends Error {}

export function encodeFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message))
  if (body.length > MAX_TO_CHROME) throw new FramingError(`A message to Chrome can be at most 1 MB; this one is ${body.length} bytes.`)
  const out = new Uint8Array(4 + body.length)
  new DataView(out.buffer).setUint32(0, body.length, true)
  out.set(body, 4)
  return out
}

/**
 * Reads frames from a byte stream that arrives in pieces of any size. `push` returns every complete
 * message so far. A frame that's too long, or isn't JSON, throws, and the reader shouldn't be used again.
 */
export class FrameReader {
  private buf = new Uint8Array(0)

  push(chunk: Uint8Array): unknown[] {
    const joined = new Uint8Array(this.buf.length + chunk.length)
    joined.set(this.buf)
    joined.set(chunk, this.buf.length)
    this.buf = joined
    const out: unknown[] = []
    for (;;) {
      if (this.buf.length < 4) break
      const len = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true)
      if (len > MAX_FROM_CHROME) throw new FramingError(`A frame of ${len} bytes is over the 64 MiB limit.`)
      if (this.buf.length < 4 + len) break
      const body = this.buf.subarray(4, 4 + len)
      this.buf = this.buf.slice(4 + len)
      try {
        out.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)))
      } catch {
        throw new FramingError('A frame wasn’t valid UTF-8 JSON.')
      }
    }
    return out
  }

  /** Bytes held back, waiting for the rest of a frame. */
  get pending(): number {
    return this.buf.length
  }
}
