import dotenv from 'dotenv'

import { getAircraftByRegistration, getAllAircraft } from '../../src/db/aircraft-queries.ts'
import { closeDb } from '../../src/db/connection.ts'

dotenv.config()

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

afterAll(async () => {
  // Close the pool after all tests
  await closeDb()
})
