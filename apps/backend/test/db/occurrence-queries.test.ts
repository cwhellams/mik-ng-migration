import { describe, expect, it } from '@jest/globals'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import {
  countOccurrences,
  createOccurrence,
  getOccurrence,
  getOccurrences,
  updateOccurrence,
} from '../../src/db/occurrence-queries.ts'
import {
  OccurrenceStatus,
  OccurrenceCategory,
  type OccurrenceUpsert,
} from '@mik/contracts/occurrences'
import dayjs from 'dayjs'

const TEST_USER: JWTUser = { memberId: 'Sanna1' } as JWTUser

const expectedSMS1 = {
  id: 'SMS1_NEW',
  aircraftRegistration: 'OH-STL',
  aircraftTechnicalFault: null,
  animalNumber: '100+',
  animalSize: 'S',
  animalSpecies: 'Kiwi',
  arrivalAirport: 'EFNU',
  categories: ['BIRD', 'WILD'],
  departureAirport: 'EFNU',
  description: 'Flock of kiwis hit the propeller on final.',
  headline: 'Kiwistrike at Nummela',
  isDtoReport: false,
  isWeatherRelevant: true,
  linkedReportId: null,
  location: 'EFNU Final approach 22',
  occurrenceDate: '2025-12-01T10:30:00.000Z',
  reportDate: expect.any(String),
  status: 'NEW',
  access: [],
  comments: [],
  handling: {},
  attachments: [],
  createdAt: expect.any(String),
  createdBy: 'Matti1',
  updatedAt: expect.any(String),
  updatedBy: expect.any(String),
}

describe('Db get occurrence tests', () => {
  const access = [
    {
      accessId: 1,
      at: expect.any(String),
      author: true,
      by: 'k1mnimda',
      lastName: 'Virtanen',
      manage: true,
      memberId: 'Matti1',
      roleId: null,
      write: true,
    },
    {
      accessId: 2,
      at: expect.any(String),
      author: false,
      by: 'k1mnimda',
      lastName: null,
      manage: true,
      memberId: null,
      roleId: 'SMS_PROCESSOR',
      write: false,
    },
  ]

  it('should get new occurrence as an owner', async () => {
    const query = {
      memberId: 'Matti1',
      roles: ['MEMBER'],
    }

    const read = await getOccurrence('SMS1_NEW', query, 'read')
    expect(read).toEqual({ ...expectedSMS1, access })

    const write = await getOccurrence('SMS1_NEW', query, 'write')
    expect(write).toEqual({ ...expectedSMS1, access })

    const manage = await getOccurrence('SMS1_NEW', query, 'manage')
    expect(manage).toEqual({ ...expectedSMS1, access })
  })

  it('should get readable new occurrence as a processor', async () => {
    const query = {
      roles: ['SMS_PROCESSOR'],
    }

    const read = await getOccurrence('SMS1_NEW', query, 'read')
    expect(read).toEqual({ ...expectedSMS1, access })

    const write = await getOccurrence('SMS1_NEW', query, 'write')
    expect(write).toBeUndefined()

    const manage = await getOccurrence('SMS1_NEW', query, 'manage')
    expect(manage).toEqual({ ...expectedSMS1, access })
  })

  it('should not get occurrence as unauthorized user', async () => {
    const fetched = await getOccurrence(
      'SMS1_NEW',
      {
        memberId: 'WrongUser',
        roles: ['MEMBER'],
      },
      'read',
    )
    expect(fetched).toBeUndefined()
  })
})

describe('Db query occurrence tests', () => {
  it('should get all occurrences as SMS_PROCESSOR sorted by report date', async () => {
    const fetched = await getOccurrences(
      {},
      {
        roles: ['SMS_PROCESSOR'],
      },
    )
    expect(fetched[0]).toEqual(expectedSMS1)
    expect(fetched.map((o) => o.id)).toEqual([
      'SMS1_NEW',
      'SMS2_RECE',
      'SMS3_RECE',
      'SMS4_ANON',
      'SMS4_RECE',
      // the three RECEIVED originals seeded for the occurrence register (#519);
      // their anonymized copies belong to the safety manager, not the processor
      'SMS5_RECE',
      'SMS6_RECE',
      'SMS7_RECE',
    ])
  })

  it('should get occurrences as SMS_PROCESSOR without received reports', async () => {
    const fetched = await getOccurrences(
      {
        ignoreStatuses: [OccurrenceStatus.RECEIVED],
      },
      {
        roles: ['SMS_PROCESSOR'],
      },
    )
    expect(fetched.length).toEqual(2)
    expect(fetched[0]).toEqual(expectedSMS1)
    expect(fetched[1].id).toEqual('SMS4_ANON')
  })

  it('should get all occurrences as owner', async () => {
    const fetched = await getOccurrences(
      {},
      {
        memberId: 'Liisa1',
        roles: ['MEMBER'],
      },
    )
    expect(fetched.length).toEqual(2)
    expect(fetched[0].id).toEqual('SMS4_ANON')
    expect(fetched[1].id).toEqual('SMS4_RECE')
  })

  it('should get unique occurrences as owner', async () => {
    const fetched = await getOccurrences(
      {
        ignoreStatuses: [OccurrenceStatus.RECEIVED],
      },
      {
        memberId: 'Liisa1',
        roles: ['MEMBER'],
      },
    )
    expect(fetched.length).toEqual(1)
    expect(fetched[0].id).toEqual('SMS4_ANON')
  })
})

// fromDate/toDate and aircraftRegistration were declared on OccurrenceFiltersSchema
// long before anything applied them; the occurrence register (#519) is the first
// caller that needs them, and isDtoReport came with it.
describe('occurrence filters', () => {
  const asSafetyManager = { roles: ['SMS_MANAGER'] }

  const ids = (filters: Parameters<typeof getOccurrences>[0]) =>
    getOccurrences(filters, asSafetyManager).then((o) => o.map((r) => r.id))

  it('bounds the range on the occurrence date, inclusive at both ends', async () => {
    // 2026-03-14 07:20Z is the SMS5_CLOS occurrence itself, so a range that
    // starts and ends on that instant still contains it.
    await expect(
      ids({ fromDate: '2026-03-14T07:20:00.000Z', toDate: '2026-03-14T07:20:00.000Z' }),
    ).resolves.toEqual(['SMS5_CLOS'])

    await expect(
      ids({ fromDate: '2026-01-01T00:00:00.000Z', toDate: '2026-12-31T23:59:59.000Z' }),
    ).resolves.toEqual(['SMS5_CLOS', 'SMS6_PROC', 'SMS7_ANON'])
  })

  it('excludes occurrences outside the range', async () => {
    await expect(ids({ fromDate: '2026-06-01T00:00:00.000Z' })).resolves.toEqual(['SMS7_ANON'])
    await expect(ids({ toDate: '2025-12-31T23:59:59.000Z' })).resolves.toEqual([
      'SMS2_ANON',
      'SMS3_CLOS',
    ])
  })

  it('filters on the DTO flag', async () => {
    await expect(ids({ isDtoReport: true })).resolves.toEqual(['SMS5_CLOS', 'SMS7_ANON'])
    await expect(ids({ isDtoReport: false })).resolves.toEqual([
      'SMS2_ANON',
      'SMS3_CLOS',
      'SMS6_PROC',
    ])
  })

  it('filters on the aircraft registration', async () => {
    await expect(ids({ aircraftRegistration: 'OH-IHQ' })).resolves.toEqual(['SMS6_PROC'])
  })

  it('combines the filters', async () => {
    await expect(
      ids({
        fromDate: '2026-01-01T00:00:00.000Z',
        toDate: '2026-12-31T23:59:59.000Z',
        isDtoReport: true,
        ignoreStatuses: [OccurrenceStatus.ANONYMIZED],
      }),
    ).resolves.toEqual(['SMS5_CLOS'])
  })
})

// The count backs the export dialog's preview, so it has to agree with the list
// exactly - including on the access join, which fans out one row per grant.
describe('countOccurrences', () => {
  const asSafetyManager = { roles: ['SMS_MANAGER'] }

  it.each([
    ['no filters', {}],
    ['a date range', { fromDate: '2026-01-01T00:00:00.000Z', toDate: '2026-12-31T23:59:59.000Z' }],
    ['the DTO flag', { isDtoReport: true }],
    ['a status exclusion', { ignoreStatuses: [OccurrenceStatus.ANONYMIZED] }],
    ['a range matching nothing', { fromDate: '2099-01-01T00:00:00.000Z' }],
  ])('counts the same rows the list returns for %s', async (_name, filters) => {
    const listed = await getOccurrences(filters, asSafetyManager)

    await expect(countOccurrences(filters, asSafetyManager)).resolves.toEqual(listed.length)
  })

  it('counts each report once however many grants it has', async () => {
    // SMS5_CLOS carries two access rows: its author and the safety manager role.
    await expect(
      countOccurrences(
        { fromDate: '2026-03-01T00:00:00.000Z', toDate: '2026-03-31T00:00:00.000Z' },
        asSafetyManager,
      ),
    ).resolves.toEqual(1)
  })
})

describe('occurrence CRUD', () => {
  it('should create, updated and get occurrence', async () => {
    const occurrenceData = {
      occurrenceDate: new Date().toISOString(),
      headline: 'Test Occurrence',
      aircraftRegistration: 'OH-IHQ',
      categories: [OccurrenceCategory.BIRD],
      description: 'Test description',
      location: 'Test location',
      isWeatherRelevant: false,
      animalNumber: '0',
      animalSize: null,
      animalSpecies: null,
      arrivalAirport: 'EFHK',
      departureAirport: 'EFHK',
      isDtoReport: true,
    } as OccurrenceUpsert

    const metadata = {
      reportDate: dayjs().toISOString(),
      deadLine: dayjs().add(72, 'hour').toISOString(),
      status: OccurrenceStatus.NEW,
      linkedReportId: null,
      access: [
        {
          memberId: TEST_USER.memberId!,
          author: true,
          write: true,
          manage: true,
        },
      ],
      comments: [],
    }

    const createdOccurrence = await createOccurrence({ ...occurrenceData, ...metadata }, TEST_USER)
    expect(createdOccurrence).toMatchObject({
      ...occurrenceData,
      createdBy: TEST_USER.memberId,
      updatedBy: TEST_USER.memberId,
    })

    const fetched = await getOccurrence(
      createdOccurrence.id,
      { memberId: TEST_USER.memberId!, roles: ['MEMBER'] },
      'write',
    )
    expect(fetched).toBeDefined()
    expect(fetched?.id).toBe(createdOccurrence.id)
    expect(fetched?.headline).toBe('Test Occurrence')

    await updateOccurrence(fetched!, { status: OccurrenceStatus.DELETED }, TEST_USER)

    const deletedEntriesAreHidden = await getOccurrences(
      {
        ignoreStatuses: [OccurrenceStatus.DELETED],
      },
      {
        memberId: TEST_USER.memberId!,
        roles: ['MEMBER'],
      },
    )
    expect(deletedEntriesAreHidden).toEqual([])

    const afterDelete = await getOccurrence(
      createdOccurrence.id,
      {
        memberId: TEST_USER.memberId!,
        roles: ['MEMBER'],
      },
      'read',
    )
    expect(afterDelete).toBeDefined()
    expect(afterDelete?.id).toBe(createdOccurrence.id)
    expect(afterDelete?.status).toBe(OccurrenceStatus.DELETED)
  })
})
