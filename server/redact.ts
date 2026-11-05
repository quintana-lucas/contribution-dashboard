export const REDACTED = '[REDACTED]'

export function redact(text: string, secret: string | undefined): string {
  if (!secret) return text
  return text.split(secret).join(REDACTED)
}

export interface LogSink {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function stringify(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ? `${arg.message}\n${arg.stack}` : arg.message
  try {
    return JSON.stringify(arg) ?? String(arg)
  } catch {
    return String(arg)
  }
}

export function createLogger(
  secret: string | undefined,
  sink: LogSink = console,
): Logger {
  const wrap =
    (level: 'info' | 'warn' | 'error') =>
    (...args: unknown[]): void => {
      sink[level](...args.map((a) => redact(stringify(a), secret)))
    }
  return { info: wrap('info'), warn: wrap('warn'), error: wrap('error') }
}
