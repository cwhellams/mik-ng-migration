import { describe } from 'vitest'

import { authScenarios } from './test/auth'
import { runRouteMatrix } from './test/routeMatrix'

/**
 * Every route visited by `k1mnimda` carrying the club's *real* ADMIN role.
 *
 * The most informative run of the four: that role grants MEMBER_ADMIN but not
 * STORE_ADMIN, EXAM_ADMIN, DTO_ADMIN, EVENTS_ADMIN, INVENTORY_ADMIN, AME_ADMIN,
 * MEETING_ADMIN or OUTBOX_ADMIN, so it is the one identity for which the matrix
 * is a mix of open and closed rather than all one or all the other.
 */
describe('as an admin with the real ADMIN role', () => runRouteMatrix(authScenarios.clubAdmin))
