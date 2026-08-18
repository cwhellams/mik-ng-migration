import { createAjlb, deleteAjlb, getAjlb, getAjlbs, updateAjlb } from '../../src/db/ajlb-queries.ts'
import { db } from '../../src/db/connection.ts'
import type { AjlbFilter } from '@mik/contracts/ajlb'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import { audit, maskAudit } from '../util/helpers.ts'

const normalizeAjlbLandingTotals = <T extends Record<string, unknown>>(book: T): T => {
  const view = (book.view ?? {}) as Record<string, unknown>
  return {
    ...book,
    startLandings: typeof book.startLandings === 'number' ? 0 : book.startLandings,
    view: {
      ...view,
      totalLandings: typeof view.totalLandings === 'number' ? 0 : view.totalLandings,
      validatedTotalLandings:
        typeof view.validatedTotalLandings === 'number' ? 0 : view.validatedTotalLandings,
    },
  }
}

describe('Db query ajlb get tests', () => {
  it('should return all ajlbs', async () => {
    const result = await getAjlbs({})
    expect(result.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('should return all current ajlbs', async () => {
    const result = await getAjlbs({ current: true })
    expect(result.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('should return STL ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-STL',
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('should return IHQ ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-IHQ',
      seqNo: 1,
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('from date should return expected ajlbs', async () => {
    const filter: AjlbFilter = {
      fromDate: '2025-04-04',
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit).map(normalizeAjlbLandingTotals)).toMatchSnapshot()
  })

  it('too early date should return an empty array', async () => {
    const filter: AjlbFilter = {
      toDate: '2023-04-04',
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit)).toEqual([])
  })
})

describe('Db ajlb CRUD tests', () => {
  const jwt: JWTUser = {
    memberId: 'k1mnimda',
    lastName: 'Test',
    email: 'loggedinuser',
    roles: [],
    permissions: [],
    canMakeReservations: false,
  }

  let payload: {
    aircraftRegistration: string
    seqNo: number
    startDate: string
    endDate: string
    startFlightMins: number
    startLandings: number
    noOfPages: number
    rowsPerPage: number
    startPage: number
  }

  beforeAll(async () => {
    const maxSeqResult = await db
      .selectFrom('flight.aircraftJourneyLogBook')
      .select(({ fn }) => fn.max<number>('seqNo').as('maxSeqNo'))
      .where('aircraftRegistration', '=', 'OH-STL')
      .executeTakeFirst()
    const seqNo = (maxSeqResult?.maxSeqNo ?? 0) + 1

    payload = {
      aircraftRegistration: 'OH-STL',
      seqNo,
      startDate: '2025-06-01',
      endDate: '2026-06-01',
      startFlightMins: 600,
      startLandings: 0,
      noOfPages: 10,
      rowsPerPage: 30,
      startPage: 1,
    }
  })

  it('should create new ajlb', async () => {
    await createAjlb(payload, jwt)
    expect(await getAjlb('OH-STL', payload.seqNo)).toEqual({
      ...payload,
      startFlightTime: '10:00',
      ...audit(jwt.memberId),
      view: {
        lastPage: 1,
        newFlightsCount: 0,
        newFlightsPage: 1,
        newFlightsTime: '00:00',
        unverifiedTotalFlightTime: '10:00',
        unverifiedTotalFlightMins: 600,
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '10:00',
        validatedTotalLandings: 0,
        totalLandings: 0,
      },
    })
  })

  it('should patch ajlb', async () => {
    const patch = {
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      startFlightMins: 900,
      noOfPages: 20,
      rowsPerPage: 1,
      startPage: 2,
    }

    const result = await updateAjlb('OH-STL', payload.seqNo, patch, jwt)
    expect(result).toEqual({
      ...payload,
      ...patch,
      startFlightTime: '15:00',
      ...audit(jwt.memberId),
      view: {
        lastPage: 2,
        newFlightsCount: 0,
        newFlightsPage: 2,
        newFlightsTime: '00:00',
        unverifiedTotalFlightTime: '15:00',
        unverifiedTotalFlightMins: 900,
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '15:00',
        validatedTotalLandings: 0,
        totalLandings: 0,
      },
    })
    expect(await getAjlb('OH-STL', payload.seqNo)).toEqual(result)
  })

  it('should delete ajlb', async () => {
    const result = await deleteAjlb('OH-STL', payload.seqNo)
    expect(result).toEqual(true)
    expect(await getAjlb('OH-STL', payload.seqNo)).toBeUndefined()
  })
})
