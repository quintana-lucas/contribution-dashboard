import type { IncomingMessage } from 'node:http'

export const MAX_BODY_BYTES = 16 * 1024

export type BodyResult =
  | { ok: true; input: string }
  | { ok: false; status: 400 | 413; error: 'invalid_format' | 'too_large' }

/** Reads a JSON body of at most 16 KB and returns its `input` string. */
export async function readInputBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = []
  let size = 0
  let tooLarge = false
  try {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      size += buf.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        continue // keep draining without storing
      }
      if (!tooLarge) chunks.push(buf)
    }
  } catch {
    return { ok: false, status: 400, error: 'invalid_format' }
  }
  if (tooLarge) return { ok: false, status: 413, error: 'too_large' }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input?: unknown } | null
    if (parsed && typeof parsed.input === 'string') return { ok: true, input: parsed.input }
  } catch {
    // fall through
  }
  return { ok: false, status: 400, error: 'invalid_format' }
}
