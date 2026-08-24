import { describe } from 'vitest'

import { runAnonymousRouteMatrix } from './test/routeMatrix'

/**
 * Every route visited by someone who is not signed in. This run asserts a
 * redirect to /login rather than `<Forbidden />` — a signed-out visitor never
 * reaches the permission gate, so it has its own harness.
 */
describe('as a signed-out visitor', () => runAnonymousRouteMatrix())
