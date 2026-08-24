import { describe } from 'vitest'

import { authScenarios } from './test/auth'
import { runRouteMatrix } from './test/routeMatrix'

/** Every route visited by an ordinary flying member — every gate must close. */
describe('as an ordinary member', () => runRouteMatrix(authScenarios.user))
