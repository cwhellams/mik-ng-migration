import { describe } from 'vitest'

import { authScenarios } from './test/auth'
import { runRouteMatrix } from './test/routeMatrix'

/**
 * Every route in `AppRoutes.tsx`, visited as an ordinary member — one quarter of the
 * route permission matrix (issue #1116, phase 3). The shared harness, the route
 * table and the expectations live in `src/test/routeMatrix.tsx`; the four
 * identities are split across files so they run in parallel.
 */
describe('as an ordinary member', () => runRouteMatrix(authScenarios.user))
