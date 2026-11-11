import type { IncomingMessage } from 'node:http'

export const MAX_BODY_BYTES = 16 * 1024

export type BodyResult =
  | { ok: true; input: string }
  | { ok: false; status: 400 | 413; error: 'invalid_format' | 'too_large' }

export const MAX_JSON_BODY_BYTES = 64 * 1024

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: 'invalid_team' | 'too_large' }

/** Reads a JSON body of at most 64 KB and returns the parsed value. */
export async function readJsonBody(req: IncomingMessage): Promise<JsonBodyResult> {
  const chunks: Buffer[] = []
  let size = 0
  let tooLarge = false
  try {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      size += buf.length
      if (size > MAX_JSON_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        continue
      }
      if (!tooLarge) chunks.push(buf)
    }
  } catch {
    return { ok: false, status: 400, error: 'invalid_team' }
  }
  if (tooLarge) return { ok: false, status: 413, error: 'too_large' }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, status: 400, error: 'invalid_team' }
  }
}

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
