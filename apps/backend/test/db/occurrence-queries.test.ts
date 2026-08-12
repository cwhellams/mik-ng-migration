import { describe, expect, it } from '@jest/globals'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import {
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
    expect(fetched.length).toEqual(5)
    expect(fetched[0]).toEqual(expectedSMS1)
    expect(fetched[1].id).toEqual('SMS2_RECE')
    expect(fetched[2].id).toEqual('SMS3_RECE')
    expect(fetched[3].id).toEqual('SMS4_ANON')
    expect(fetched[4].id).toEqual('SMS4_RECE')
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
