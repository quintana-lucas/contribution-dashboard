import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

// shell: true keeps `npx` resolvable on Windows (npx.cmd).
const children: ChildProcess[] = [
  spawn(
    process.execPath,
    ['--watch', '--env-file-if-exists=.env', 'server/index.ts'],
    { stdio: 'inherit' },
  ),
  spawn('npx vite', { stdio: 'inherit', shell: true }),
]

let shuttingDown = false

function shutdown(code: number): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.pid !== undefined) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
        })
      } else {
        child.kill()
      }
    }
  }
  process.exitCode = code
  setTimeout(() => process.exit(code), 500).unref()
}

for (const child of children) {
  child.on('exit', (code) => shutdown(code ?? 1))
  child.on('error', () => shutdown(1))
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
