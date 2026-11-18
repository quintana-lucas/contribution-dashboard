import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.SERVER_PORT ?? 8787}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Process BarList's and ReviewsChart's CSS so their tests can assert the
    // fixed count column (#68, #72).
    css: { include: [/BarList\.module\.css/, /ReviewsChart\.module\.css/] },
  },
})
