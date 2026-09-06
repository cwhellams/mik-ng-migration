import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The Worker is exercised through its exported fetch handler with a stubbed
    // assets binding and a stubbed global fetch, so it needs no workerd runtime.
    // When the API Worker arrives (plan phase 2) and real bindings matter, that
    // package gets @cloudflare/vitest-pool-workers; this one does not need it.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
