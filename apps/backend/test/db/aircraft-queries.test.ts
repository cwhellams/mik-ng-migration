import 'dotenv/config'

import {
  addAircraft,
  getAircraftByRegistration,
  getAllAircraft,
  getAllFuelTypes,
  removeAircraft,
  updateAircraft,
} from '../../src/db/aircraft-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  lastName: 'Test',
  email: 'loggedinuser',
  roles: [],
  permissions: [],
  canMakeReservations: false,
}

describe('Db query fuel types tests', () => {
  it('getAllFuelTypes returns all 8 reference fuel types in order', async () => {
    const result = await getAllFuelTypes()
    expect(result.length).toEqual(8)
    expect(result.map((ft) => ft.name)).toEqual([
      'JET A',
      'JET A-1',
      'JP-8',
      '100LL',
      'MOGAS 98E5',
      'MOGAS 95E10',
      'EN228 SUPER',
      'EN228 SUPER PLUS',
    ])
  })
})

describe('Db query Get aircrafts tests', () => {
  it('getAllAircraft returns all aircraft in the db', async () => {
    const result = await getAllAircraft(false, false)
    expect(result.length).toEqual(3)
    expect(result).toMatchSnapshot(
      result.map((res) => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        documents: res?.documents.map((doc) => ({
          ...doc,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })),
    )
  })

  it('getAllAircraft returns all active aircraft in the db', async () => {
    const result = await getAllAircraft(true, false)
    expect(result.length).toEqual(2)
    expect(result).toMatchSnapshot(
      result.map((res) => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        documents: res?.documents.map((doc) => ({
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
      documents: result?.documents.map((doc) => ({
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
        seats: 2,
        usableFuelLitres: 100,
        fuelTypes: ['100LL'],
        active: true,
        hidden: false,
        maintenance: {
          maintenanceCycle: 100,
          lastMaintenanceDate: '2023-10-01',
          lastMaintenanceType: '100h',
          lastMaintenanceMins: 100 * 60,
          nextMaintenanceDate: null,
          nextMaintenanceType: '50h',
          nextMaintenanceMins: 150 * 60,
          totalPercentageHours: 5,
          reservedHours: 2,
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
            seats: 4,
            usableFuelLitres: 100,
            fuelTypes: ['100LL'],
            active: true,
            hidden: false,
            maintenance: {
              maintenanceCycle: 100,
              lastMaintenanceDate: '2023-10-01',
              lastMaintenanceType: '100h',
              lastMaintenanceMins: 100 * 60,
              nextMaintenanceDate: null,
              nextMaintenanceType: '50h',
              nextMaintenanceMins: 150 * 60,
              totalPercentageHours: 5,
              reservedHours: 2,
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

  it('updating fuelTypes preserves valid preferredFuelType and clears invalid one', async () => {
    const aircraft = await addAircraft(
      {
        registration: 'OH-FPT',
        displayName: 'Fuel pref test',
        model: 'Jest',
        manufacturer: 'Jest',
        yearOfManufacture: 2020,
        seats: 2,
        usableFuelLitres: 100,
        fuelTypes: ['100LL', 'MOGAS 98E5'],
        preferredFuelType: '100LL',
        active: true,
        hidden: false,
        maintenance: {
          maintenanceCycle: 50,
          lastMaintenanceDate: '2024-01-01',
          lastMaintenanceType: '50h',
          lastMaintenanceMins: 3000,
          nextMaintenanceDate: null,
          nextMaintenanceType: '50h',
          nextMaintenanceMins: 6000,
          totalPercentageHours: 5,
          reservedHours: 2,
        },
        notes: [],
        location: 'test',
        equipment: 'test',
        hourlyRateEur: 100,
        documents: [],
      },
      jwt,
    )

    // Verify preferred fuel type was set
    const inserted = await getAircraftByRegistration(aircraft.registration, false)
    expect(inserted?.preferredFuelType).toEqual('100LL')

    // Update fuelTypes but keep 100LL in the list — preferred should be preserved
    await updateAircraft(aircraft.registration, { fuelTypes: ['MOGAS 98E5', '100LL'] }, jwt)
    const afterValidUpdate = await getAircraftByRegistration(aircraft.registration, false)
    expect(afterValidUpdate?.preferredFuelType).toEqual('100LL')

    // Update fuelTypes to exclude 100LL — preferred should be cleared
    await updateAircraft(aircraft.registration, { fuelTypes: ['MOGAS 98E5'] }, jwt)
    const afterInvalidUpdate = await getAircraftByRegistration(aircraft.registration, false)
    expect(afterInvalidUpdate?.preferredFuelType).toBeNull()

    // Cleanup
    await removeAircraft(aircraft.registration)
  })
})
