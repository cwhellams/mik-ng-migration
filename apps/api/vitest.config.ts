import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // Runs the tests inside workerd rather than Node. This package is exactly
    // where that is worth the setup cost: AsyncLocalStorage under
    // nodejs_compat, per-request `env`, and `fetch` subrequest semantics all
    // behave differently here than they do in Node, and those differences are
    // the substrate this package exists to provide.
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { LEGACY_ORIGIN: 'https://legacy.example.test', NODE_ENV: 'test' },
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})
