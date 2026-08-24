import { setupServer } from 'msw/node'

import { handlers } from './handlers'

/**
 * The shared MSW server. Started, reset between tests and closed by
 * `src/test/setup.ts` — a test only ever needs `server.use(...)` to override a
 * default handler for its own duration.
 */
export const server = setupServer(...handlers)
