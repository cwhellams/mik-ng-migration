import { FlightType, type FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { MIKLang, type MemberListResponse } from '@mik/contracts/members'
import { describe, expect, it } from 'vitest'

import { AIRCRAFT_REGISTRATION, INSTRUCTOR_MEMBER_ID, MEMBER_ID } from '../../test/fixtures'
import { buildFlightLogResolver } from './formResolver'

/** The resolver only ever passes the key through, so echoing it keeps assertions readable. */
const t = (key: string) => key

/** 2025-06-02, comfortably in the past so the "no future times" rule is satisfied. */
const OFF_BLOCK = Date.UTC(2025, 5, 2, 9, 0, 0) / 1000
const epoch = (offsetMinutes: number) => String(OFF_BLOCK + offsetMinutes * 60)

const aFlightLogForm = (
  overrides: Partial<FlightLogUpsertRequest> = {},
): FlightLogUpsertRequest => ({
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  ajlbSeqNo: 4,
  ajlbBlankRowsBefore: 0,
  departureAirport: 'EFNU',
  arrivalAirport: 'EFNU',
  flightType: FlightType.PRIVATE,
  billableMemberId: MEMBER_ID,
  picMemberId: MEMBER_ID,
  picRole: 'PIC',
  crew2MemberId: null,
  crew2Role: null,
  crew3MemberId: null,
  crew3Role: null,
  crew4MemberId: null,
  crew4Role: null,
  offBlockTimeEpoch: epoch(0),
  takeoffTimeEpoch: epoch(10),
  landingTimeEpoch: epoch(110),
  onBlockTimeEpoch: epoch(120),
  numberOfLandings: 1,
  numberOfNightLandings: 0,
  nightFlyingMins: 0,
  instrumentFlyingMins: 0,
  personsOnBoard: 1,
  fuelRemainingLitres: 90,
  fuelUpliftLitres: 40,
  oilUpliftLitres: 0,
  totalTimeInService: 4750,
  isBillableFlight: true,
  partiallyBillableFlight: false,
  entryErrorFee: false,
  entryErrorFeeAppliedByMemberId: null,
  billingRemarks: null,
  nonBillingReason: null,
  nonBillingApprovedByMemberId: null,
  minBillableExceptionReason: null,
  minBillableExceptionApprovedByMemberId: null,
  validationRemarks: null,
  incidentOrObservations: null,
  personalRemarks: null,
  ...overrides,
})

const aMemberList = (roles: Record<string, string[]>): MemberListResponse => ({
  members: Object.entries(roles).map(([memberId, memberRoles]) => ({
    memberId,
    first: memberId,
    last: memberId,
    email: `${memberId}@example.com`,
    roles: memberRoles,
    lang: MIKLang.FI,
  })),
})

const INSTRUCTOR_LIST = aMemberList({
  [MEMBER_ID]: ['MEMBER'],
  [INSTRUCTOR_MEMBER_ID]: ['INSTRUCTOR'],
  Antti1: ['EXAMINER'],
  Anna1: ['MEMBER'],
})

const resolve = (
  values: FlightLogUpsertRequest,
  { memberList = INSTRUCTOR_LIST, isNew = false } = {},
) =>
  buildFlightLogResolver(t, memberList, isNew)(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  })

describe('buildFlightLogResolver', () => {
  it('accepts a complete, valid entry', async () => {
    const result = await resolve(aFlightLogForm())

    expect(result.errors).toEqual({})
    expect(result.values).toMatchObject({ picMemberId: MEMBER_ID })
  })

  describe('crew role qualifications', () => {
    it('accepts an FI slot filled by a member holding the INSTRUCTOR role', async () => {
      const result = await resolve(
        aFlightLogForm({ crew2MemberId: INSTRUCTOR_MEMBER_ID, crew2Role: 'FI' }),
      )

      expect(result.errors).toEqual({})
    })

    it('rejects an FI slot filled by a member who is not an instructor', async () => {
      const result = await resolve(aFlightLogForm({ crew2MemberId: 'Anna1', crew2Role: 'FI' }))

      expect(result.errors.crew2MemberId).toEqual({
        type: 'custom',
        message: 'flightLog.error.memberNotInstructor',
      })
    })

    it('rejects an FE slot filled by a member who is not an examiner', async () => {
      const result = await resolve(
        aFlightLogForm({ crew2MemberId: INSTRUCTOR_MEMBER_ID, crew2Role: 'FE' }),
      )

      expect(result.errors.crew2MemberId).toEqual({
        type: 'custom',
        message: 'flightLog.error.memberNotExaminer',
      })
    })

    it('accepts an FE slot filled by a member holding the EXAMINER role', async () => {
      const result = await resolve(aFlightLogForm({ crew2MemberId: 'Antti1', crew2Role: 'FE' }))

      expect(result.errors).toEqual({})
    })

    it('rejects a crew member who is not in the member list at all', async () => {
      // Distinct from the still-loading case below: the list is here and the
      // member is not in it, so no qualification can be read for them.
      const result = await resolve(aFlightLogForm({ crew2MemberId: 'Ghost1', crew2Role: 'FI' }))

      expect(result.errors.crew2MemberId?.message).toBe('flightLog.error.memberNotInstructor')
    })

    it('checks the PIC slot too', async () => {
      const result = await resolve(aFlightLogForm({ picMemberId: 'Anna1', picRole: 'FI' }))

      expect(result.errors.picMemberId?.message).toBe('flightLog.error.memberNotInstructor')
    })

    it.each(['crew3', 'crew4'] as const)('checks the %s slot', async (slot) => {
      const result = await resolve(
        aFlightLogForm({ [`${slot}MemberId`]: 'Anna1', [`${slot}Role`]: 'FI' }),
      )

      expect(result.errors[`${slot}MemberId`]?.message).toBe('flightLog.error.memberNotInstructor')
    })

    it('ignores roles that carry no qualification requirement', async () => {
      const result = await resolve(aFlightLogForm({ crew2MemberId: 'Anna1', crew2Role: 'STU' }))

      expect(result.errors).toEqual({})
    })

    it('ignores an empty crew slot even when a role is set', async () => {
      const result = await resolve(aFlightLogForm({ crew2MemberId: null, crew2Role: 'FI' }))

      expect(result.errors).toEqual({})
    })

    it('skips the role check while the member list is still loading', async () => {
      // There is nothing to check the role against until the list arrives, and
      // the picker offers nobody before then, so an unqualified selection cannot
      // have been made. Failing here would blame a member the form has not
      // finished loading.
      const values = aFlightLogForm({ crew2MemberId: INSTRUCTOR_MEMBER_ID, crew2Role: 'FI' })
      const result = await buildFlightLogResolver(t, undefined, false)(values, undefined, {
        fields: {},
        shouldUseNativeValidation: false,
      })

      expect(result.errors).toEqual({})
    })
  })

  describe('uplift requirements on a new entry', () => {
    it('requires an oil uplift reading', async () => {
      const result = await resolve(aFlightLogForm({ oilUpliftLitres: null }), { isNew: true })

      expect(result.errors.oilUpliftLitres).toEqual({
        type: 'custom',
        message: 'flightLog.error.oilUpliftRequired',
      })
    })

    it('requires a fuel uplift reading', async () => {
      const result = await resolve(aFlightLogForm({ fuelUpliftLitres: null }), { isNew: true })

      expect(result.errors.fuelUpliftLitres?.message).toBe('flightLog.error.fuelUpliftRequired')
    })

    it('accepts zero as a reading — nothing was uplifted', async () => {
      const result = await resolve(aFlightLogForm({ oilUpliftLitres: 0, fuelUpliftLitres: 0 }), {
        isNew: true,
      })

      expect(result.errors).toEqual({})
    })

    it('leaves an existing entry alone, so an old null uplift stays editable', async () => {
      const result = await resolve(
        aFlightLogForm({ oilUpliftLitres: null, fuelUpliftLitres: null }),
        { isNew: false },
      )

      expect(result.errors).toEqual({})
    })
  })

  describe('interaction with the schema’s own validation', () => {
    it('reports times that are out of order', async () => {
      const result = await resolve(
        aFlightLogForm({ landingTimeEpoch: epoch(5), onBlockTimeEpoch: epoch(20) }),
      )

      expect(result.errors.landingTimeEpoch).toBeDefined()
    })

    it('reports a taxi-out longer than the permitted hour', async () => {
      const result = await resolve(aFlightLogForm({ takeoffTimeEpoch: epoch(90) }))

      expect(result.errors.takeoffTimeEpoch).toBeDefined()
    })

    it('reports times in the future', async () => {
      const future = String(Math.floor(Date.now() / 1000) + 3600)
      const result = await resolve(
        aFlightLogForm({
          offBlockTimeEpoch: future,
          takeoffTimeEpoch: String(Number(future) + 600),
          landingTimeEpoch: String(Number(future) + 6600),
          onBlockTimeEpoch: String(Number(future) + 7200),
        }),
      )

      expect(result.errors.offBlockTimeEpoch?.message).toMatch(/^future:/)
    })

    it('keeps both the schema’s errors and the resolver’s own', async () => {
      const result = await resolve(
        aFlightLogForm({
          crew2MemberId: 'Anna1',
          crew2Role: 'FI',
          personsOnBoard: 9,
        }),
        { isNew: true },
      )

      expect(result.errors.crew2MemberId).toBeDefined()
      expect(result.errors.personsOnBoard).toBeDefined()
    })

    it('withholds the parsed values whenever it adds an error of its own', async () => {
      // Otherwise react-hook-form would submit a value set the resolver has
      // just rejected.
      const result = await resolve(aFlightLogForm({ crew2MemberId: 'Anna1', crew2Role: 'FI' }))

      expect(result.values).toEqual({})
    })
  })
})
