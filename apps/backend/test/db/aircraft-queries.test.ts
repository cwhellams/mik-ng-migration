import 'dotenv/config'

import {
  addAircraft,
  addAircraftDocument,
  getAircraftByRegistration,
  getAllAircraft,
  getDocuments,
  removeAircraft,
  removeAircraftDocument,
  updateAircraft,
  updateAircraftDocument,
} from '../../src/db/aircraft-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  email: 'loggedinuser',
  permissions: [],
}

describe('Db query Get aircrafts tests', () => {
  it('getAllAircraft returns all aircraft in the db', async () => {
    const result = await getAllAircraft(false)
    expect(result.length).toEqual(3)
    expect(result).toMatchSnapshot(
      result.map(res => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        documents: res?.documents.map(doc => ({
          ...doc,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })),
    )
  })

  it('getAllAircraft returns all active aircraft in the db', async () => {
    const result = await getAllAircraft(true)
    expect(result.length).toEqual(2)
    expect(result).toMatchSnapshot(
      result.map(res => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        documents: res?.documents.map(doc => ({
          ...doc,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })),
    )
  })

  it('getAllAircraftByRegistration returns the active aircraft in the db', async () => {
    const result = await getAircraftByRegistration('OH-STL', true)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      documents: result?.documents.map(doc => ({
        ...doc,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getAllAircraftByRegistration returns the aircraft in the db', async () => {
    const result = await getAircraftByRegistration('OH-P28', true)
    expect(result).toBeUndefined()
  })
})

describe('Db add aircraft tests', () => {
  const expectSnapshottedPlane = async (registration: string) => {
    const result = await getAircraftByRegistration(registration, true)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  }

  it('add aircraft and update aircraft', async () => {
    const aircraft = await addAircraft(
      {
        registration: 'OH-TST',
        displayName: 'Test plane',
        model: 'Jest',
        manufacturer: 'Jest',
        yearOfManufacture: 2000,
        active: true,
        maintenance: {
          maintenanceCycle: 100,
          lastMaintenanceDate: '2023-10-01',
          lastMaintenanceType: '100h',
          lastMaintenanceTach: 100,
          nextMaintenanceDate: null,
          nextMaintenanceType: '50h',
          nextMaintenanceTach: 150,
          totalPercentageHours: 5,
          usablePercentageHours: 3,
        },
        notes: [],
        location: 'test',
        equipment: 'test',
        hourlyRateEur: 100,
        documents: [],
      },
      jwt,
    )
    await expectSnapshottedPlane(aircraft.registration)

    const updated = await updateAircraft(
      aircraft.registration,
      {
        displayName: 'Test plane 2',
      },
      jwt,
    )
    expect(updated).toEqual(true)
    await expectSnapshottedPlane(aircraft.registration)

    const deleted = await removeAircraft(aircraft.registration)
    expect(deleted).toEqual(true)
  })

  it('add aircraft for duplicate plane fails', async () => {
    await expect(
      async () =>
        await addAircraft(
          {
            registration: 'OH-STL',
            displayName: 'Test plane',
            model: 'Jest',
            manufacturer: 'Jest',
            yearOfManufacture: 2000,
            active: true,
            maintenance: {
              maintenanceCycle: 100,
              lastMaintenanceDate: '2023-10-01',
              lastMaintenanceType: '100h',
              lastMaintenanceTach: 100,
              nextMaintenanceDate: null,
              nextMaintenanceType: '50h',
              nextMaintenanceTach: 150,
              totalPercentageHours: 5,
              usablePercentageHours: 3,
            },
            notes: [],
            location: 'test',
            equipment: 'test',
            hourlyRateEur: 100,
            documents: [],
          },
          jwt,
        ),
    ).rejects.toThrow('aircraft_pkey')
  })
})

describe('Db document tests', () => {
  const expectSnapshottedDocument = async (documentId: string) => {
    const result = await getDocuments('OH-STL', documentId)
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  }

  it('add document and update document', async () => {
    const doc = await addAircraftDocument(
      'OH-STL',
      {
        documentId: 'TST',
        startDate: '2023-10-01',
        endDate: '2023-10-01',
        alertDaysBefore: 30,
        hardLimit: 0,
        softLimit: 7,
      },
      jwt,
    )
    await expectSnapshottedDocument('TST')

    const updated = await updateAircraftDocument(
      'OH-STL',
      doc.documentId,
      {
        documentId: 'TST2',
        startDate: '2023-10-02',
        endDate: '2023-10-02',
        alertDaysBefore: 15,
        hardLimit: 1,
        softLimit: 5,
      },
      jwt,
    )
    expect(updated).toEqual(true)
    await expectSnapshottedDocument('TST2')

    const deleted = await removeAircraftDocument('OH-STL', 'TST2')
    expect(deleted).toEqual(true)
  })

  it('add document for unknown plane fails', async () => {
    await expect(async () =>
      addAircraftDocument(
        'OH-UFO',
        {
          documentId: 'TST',
          startDate: '2023-10-01',
          endDate: '2023-10-01',
          alertDaysBefore: 30,
          hardLimit: 0,
          softLimit: 7,
        },
        jwt,
      ),
    ).rejects.toThrow('aircraft_documents_registration_fkey')
  })
})
