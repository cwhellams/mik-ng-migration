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
} from '../../src/routes/occurrences/models.ts'
import dayjs from 'dayjs'

const TEST_USER: JWTUser = { memberId: 'Sanna1' } as JWTUser

const expectedSMS1 = {
  id: 'SMS100001',
  aircraftRegistration: 'OH-STL',
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
  createdAt: expect.any(String),
  createdBy: 'Matti1',
  updatedAt: expect.any(String),
  updatedBy: expect.any(String),
}

describe('Db get occurrence tests', () => {
  it('should get occurrence as admin', async () => {
    const fetched = await getOccurrence('SMS100001', {})
    expect(fetched).toEqual(expectedSMS1)
  })

  it('should get occurrence as owner', async () => {
    const fetched = await getOccurrence('SMS100001', {
      owner: 'Matti1',
    })
    expect(fetched).toEqual(expectedSMS1)
  })

  it('should get new occurrences with status limitation', async () => {
    const fetched = await getOccurrence('SMS100001', {
      statuses: [OccurrenceStatus.NEW],
    })
    expect(fetched).toEqual(expectedSMS1)
  })

  it('should not get new occurrence with unauthorized status', async () => {
    const fetched = await getOccurrence('SMS100001', {
      statuses: [OccurrenceStatus.CLOSED],
    })
    expect(fetched).toBeUndefined()
  })

  it('should not get occurrence as unauthorized owner', async () => {
    const fetched = await getOccurrence('SMS100001', {
      owner: 'WrongUser',
    })
    expect(fetched).toBeUndefined()
  })
})

describe('Db query occurrence tests', () => {
  it('should get all occurrences as admin sorted by report date', async () => {
    const fetched = await getOccurrences({})
    expect(fetched.length).toEqual(5)
    expect(fetched[0]).toEqual(expectedSMS1)
  })

  it('should get occurrence as owner', async () => {
    const fetched = await getOccurrences({
      owner: 'Liisa1',
    })
    expect(fetched.length).toEqual(2)
    expect(fetched[0].id).toEqual('SMS100005')
    expect(fetched[1].id).toEqual('SMS100003')
  })

  it('should get only anonymized occurrences', async () => {
    const fetched = await getOccurrences({
      statuses: [OccurrenceStatus.ANONYMIZED, OccurrenceStatus.CLOSED],
    })
    expect(fetched.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'SMS100004', status: OccurrenceStatus.CLOSED },
      { id: 'SMS100003', status: OccurrenceStatus.ANONYMIZED },
    ])
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
    }

    const createdOccurrence = await createOccurrence({ ...occurrenceData, ...metadata }, TEST_USER)
    expect(createdOccurrence).toMatchObject({
      ...occurrenceData,
      createdBy: TEST_USER.memberId,
      updatedBy: TEST_USER.memberId,
    })

    const fetched = await getOccurrence(createdOccurrence.id, {})
    expect(fetched).toBeDefined()
    expect(fetched?.id).toBe(createdOccurrence.id)
    expect(fetched?.headline).toBe('Test Occurrence')

    await updateOccurrence(fetched!, { status: OccurrenceStatus.DELETED }, TEST_USER)

    const deletedEntriesAreHidden = await getOccurrence(createdOccurrence.id, {})
    expect(deletedEntriesAreHidden).toBeUndefined()

    const afterDelete = await getOccurrence(createdOccurrence.id, {
      statuses: [OccurrenceStatus.DELETED],
    })
    expect(afterDelete).toBeDefined()
    expect(afterDelete?.id).toBe(createdOccurrence.id)
    expect(afterDelete?.status).toBe(OccurrenceStatus.DELETED)
  })
})
