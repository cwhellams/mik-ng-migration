import { describe } from 'vitest'

import { authScenarios } from './test/auth'
import { runRouteMatrix } from './test/routeMatrix'

/** Every route visited by a signed-in member holding no permissions at all. */
describe('as a member without permissions', () => runRouteMatrix(authScenarios.none))
