import {
  FindingSearchFiltersSchema,
  RelatedFindingsQuerySchema,
  TechnicalNotesQuerySchema,
  TrendingFindingsQuerySchema,
  type FindingSearchResponse,
  type RelatedFindingsResponse,
  type TechnicalNotesResponse,
  type TrendingFindingsResponse,
} from '@mik/contracts/findings'
import { MIKPermissions } from '@mik/contracts/members'
import { Router, type Request, type Response } from 'express'

import {
  findingExists,
  findRelatedFindings,
  findTrendingFindings,
  getTechnicalNotes,
  searchFindings,
} from '../../db/finding-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { problem } from '../response.ts'

export const router = Router()

/**
 * Defect and remark search and monitoring (#1230).
 *
 * The three search/monitoring endpoints are `FLIGHTLOG_ADMIN` only, which is
 * the sixth answer on the issue and a step tighter than the per-aircraft
 * defect and remark routes next door: those answer "what is wrong with the
 * aeroplane I am about to fly", which every pilot needs, while this answers
 * "what keeps going wrong across the fleet", which is the fleet manager's job.
 *
 * `technical-notes` is the exception and carries `FLIGHTLOG_USER`. It is the
 * member app's per-aircraft panel, and it shows exactly what a member can
 * already read on that aircraft's logbook pages — just gathered into one list
 * instead of spread over the pages.
 */
const flightLogUser = validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN)
const flightLogAdmin = validateUser(MIKPermissions.FLIGHTLOG_ADMIN)

// GET /v1/findings/technical-notes -- must precede nothing in particular here,
// but is kept above the bare '/' for the same reason the remarks router keeps
// '/recent' at the top: a later ':id'-shaped route would otherwise swallow it.
router.get(
  '/technical-notes',
  flightLogUser,
  async (req: Request, res: Response<TechnicalNotesResponse>) => {
    const query = TechnicalNotesQuerySchema.parse(req.query)
    res.status(200).json({ entries: await getTechnicalNotes(query) })
  },
)

router.get(
  '/trending',
  flightLogAdmin,
  async (req: Request, res: Response<TrendingFindingsResponse>) => {
    const query = TrendingFindingsQuerySchema.parse(req.query)
    res.status(200).json({ clusters: await findTrendingFindings(query) })
  },
)

router.get(
  '/related',
  flightLogAdmin,
  async (req: Request, res: Response<RelatedFindingsResponse>) => {
    const { kind, findingId } = RelatedFindingsQuerySchema.parse(req.query)

    // An empty list is a real answer -- most findings resemble nothing else --
    // so a finding that does not exist has to be told apart from one that is
    // merely unique, or a mistyped id reads as "nothing to worry about".
    if (!(await findingExists(kind, findingId))) {
      return problem({ status: 404, detail: 'Finding not found' })
    }

    res.status(200).json({ findings: await findRelatedFindings(kind, findingId) })
  },
)

router.get('/', flightLogAdmin, async (req: Request, res: Response<FindingSearchResponse>) => {
  const filters = FindingSearchFiltersSchema.parse(req.query)
  res.status(200).json(await searchFindings(filters))
})

export default router
