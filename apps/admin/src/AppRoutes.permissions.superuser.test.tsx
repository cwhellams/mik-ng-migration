import { describe } from 'vitest'

import { authScenarios } from './test/auth'
import { runRouteMatrix } from './test/routeMatrix'

/**
 * Every route in `AppRoutes.tsx`, visited by an admin holding every permission
 * — one quarter of the admin app's route permission matrix (#1233). The shared
 * harness, the route table and the expectations live in
 * `src/test/routeMatrix.tsx`; the four identities are split across files so
 * they run in parallel.
 */
describe('as an admin with every permission', () => runRouteMatrix(authScenarios.superuser))
