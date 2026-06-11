import { conn } from './services/db.ts'
import {
  type AircraftListResponse,
  type Aircraft,
  type AircraftFilters,
} from '../../backend/src/routes/aircrafts/models.ts'
import { request } from './services/api.ts'

type Plane = {
  kone_id: number
  nimi: string
  lask_pvm_alku: Date | null
  mik_kone: boolean
}

export const migratePlanes = async () => {
  const planes = await conn.query<Plane[]>(`
    SELECT p.nimi, p.mik_kone
    FROM kirja_koneet p
    WHERE EXISTS (SELECT 1 FROM kirja_kirjat b WHERE b.kone_id = p.kone_id)
    AND p.nimi != 'OH-KAT'
  `)

  for (const plane of planes) {
    const existingPlanes = await request<AircraftFilters, AircraftListResponse>(
      'GET',
      `v1/aircrafts`,
    )
    if (existingPlanes?.aircrafts.some((a) => a.registration == plane.nimi)) {
      continue
    }
    const ac: Partial<Aircraft> = {
      registration: plane.nimi,
      displayName: plane.nimi,
      model: '-',
      manufacturer: '-',
      equipment: '-',
      location: '-',
      yearOfManufacture: 1900,
      seats: 4,
      usableFuelLitres: 99,
      hourlyRateEur: 0,
      fuelTypes: [],
      active: false,
      documents: [],
      notes: [],
      maintenance: {
        maintenanceCycle: 50,

        lastMaintenanceDate: '2000-01-01',
        lastMaintenanceType: '0h',
        lastMaintenanceMins: 1,

        nextMaintenanceDate: null,
        nextMaintenanceType: '50h',
        nextMaintenanceMins: 50,

        totalPercentageHours: 5,
        reservedHours: 3,
      },
    }

    await request('POST', 'v1/aircrafts', ac)
  }
}
