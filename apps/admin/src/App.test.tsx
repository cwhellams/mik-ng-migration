import { describe, it, expect } from 'vitest'

// Smoke test — verifies the app module exports can be imported without error.
// Full render tests will be added as admin sections are migrated.
describe('admin app', () => {
  it('has a root component', async () => {
    const { default: App } = await import('./App')
    expect(App).toBeDefined()
    expect(typeof App).toBe('function')
  })
})
