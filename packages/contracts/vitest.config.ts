import { defineConfig } from 'vitest/config'

// Deliberately *not* Europe/Helsinki, unlike the frontend's config. Everything in
// this package that touches a timezone converts to Helsinki explicitly, so running
// the suite in Helsinki would let a missing `.tz()` pass by accident. Under UTC the
// conversion has to actually do something for the assertions to hold.
process.env.TZ = 'UTC'

export default defineConfig({
  test: {
    // No DOM: the package must run in Node as well as the browser, and a test that
    // needs `document` would mean src/ had grown a dependency it shouldn't have.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
    },
  },
})
