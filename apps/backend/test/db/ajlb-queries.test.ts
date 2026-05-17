import { createAjlb, deleteAjlb, getAjlb, getAjlbs, updateAjlb } from '../../src/db/ajlb-queries.ts'
import type { AjlbFilter } from '../../src/routes/ajlb/model.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import { audit, maskAudit } from '../util/helpers.ts'

describe('Db query ajlb get tests', () => {
  it('should return all ajlbs', async () => {
    const result = await getAjlbs({})
    expect(result.map(maskAudit)).toMatchSnapshot()
  })

  it('should return all current ajlbs', async () => {
    const result = await getAjlbs({ current: true })
    expect(result.map(maskAudit)).toMatchSnapshot()
  })

  it('should return STL ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-STL',
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit)).toMatchSnapshot()
  })

  it('should return IHQ ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-IHQ',
      seqNo: 1,
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit)).toMatchSnapshot()
  })

  it('from date should return expected ajlbs', async () => {
    const filter: AjlbFilter = {
      fromDate: '2025-04-04',
    }

    const result = await getAjlbs(filter)
    expect(result.map(maskAudit)).toMatchSnapshot()
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

  const payload = {
    aircraftRegistration: 'OH-STL',
    seqNo: 3,
    startDate: '2025-06-01',
    endDate: '2026-06-01',
    startFlightMins: 600,
    startLandings: 0,
    noOfPages: 10,
    rowsPerPage: 30,
    startPage: 1,
  }

  it('should create new ajlb', async () => {
    await createAjlb(payload, jwt)
    expect(await getAjlb('OH-STL', 3)).toEqual({
      ...payload,
      startFlightTime: '10:00',
      ...audit(jwt.memberId),
      view: {
        lastPage: 1,
        newFlightsCount: 0,
        newFlightsPage: 1,
        newFlightsTime: '00:00',
        unverifiedTotalFlightTime: '10:00',
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

    const result = await updateAjlb('OH-STL', 3, patch, jwt)
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
        validatedBeforeUTC: null,
        validatedFlightsCount: 0,
        validatedFlightsTime: '00:00',
        verifiedTotalFlightTime: '15:00',
        validatedTotalLandings: 0,
        totalLandings: 0,
      },
    })
    expect(await getAjlb('OH-STL', 3)).toEqual(result)
  })

  it('should delete ajlb', async () => {
    const result = await deleteAjlb('OH-STL', 3)
    expect(result).toEqual(true)
    expect(await getAjlb('OH-STL', 3)).toBeUndefined()
  })
})
