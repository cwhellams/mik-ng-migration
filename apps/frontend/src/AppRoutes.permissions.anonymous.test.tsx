import { describe } from 'vitest'

import { runAnonymousRouteMatrix } from './test/routeMatrix'

/**
 * Every route in `AppRoutes.tsx`, visited by someone who is not signed in — the
 * fifth run of the route permission matrix (issue #1116, phase 3), and the one
 * that was missing until #1132 §2 moved `useApi`'s redirect out of the render
 * body. Before that, a signed-out visit re-navigated on every render and hung
 * the run.
 *
 * It asserts a destination rather than `<Forbidden />`: see
 * `runAnonymousRouteMatrix` in `src/test/routeMatrix.tsx`.
 */
describe('as an anonymous visitor', () => runAnonymousRouteMatrix())
