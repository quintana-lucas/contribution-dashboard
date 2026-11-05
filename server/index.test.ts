// @vitest-environment node
import type { Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { startServer } from './index.ts'

let server: Server | undefined

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
  server = undefined
})

it('AC11: startServer listens on 127.0.0.1 and never on all interfaces', async () => {
  server = await startServer({ port: 0, distDir: '.' })
  const a = server.address()
  expect(a).toMatchObject({ address: '127.0.0.1', family: 'IPv4' })
})
