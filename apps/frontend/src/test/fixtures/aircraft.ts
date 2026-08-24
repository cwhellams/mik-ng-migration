import {
  Severity,
  type Aircraft,
  type AircraftListResponse,
  type AircraftStatus,
} from '@mik/contracts/aircrafts'

import { AIRCRAFT_REGISTRATION, auditFields } from '@mik/ui/test/fixtures/cast'

/**
 * `OH-STL` — the club's Diamond DA40, mirroring `sql/schema/static_data/V20__AircraftData.sql`.
 * This is the aircraft the backend suite uses, so bookings, flight logs and
 * invoices in frontend fixtures all hang off the same registration.
 */
export const anAircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  registration: AIRCRAFT_REGISTRATION,
  displayName: 'Diamond DA40',
  model: 'DA40',
  manufacturer: 'Diamond Aircraft',
  yearOfManufacture: 2007,
  seats: 4,
  usableFuelLitres: 147.6,
  fuelTypes: ['JETA-1'],
  preferredFuelType: 'JETA-1',
  active: true,
  hidden: false,

  maintenance: {
    maintenanceCycle: 100,
    lastMaintenanceDate: '2024-11-10',
    lastMaintenanceType: '200h',
    lastMaintenanceMins: 4709 * 60,
    nextMaintenanceDate: null,
    nextMaintenanceType: '100h',
    nextMaintenanceMins: 4778 * 60,
    totalPercentageHours: 10,
    reservedHours: 2,
  },
  documents: [],
  notes: [],

  location: 'EFNU BF-hangar 21',
  equipment: 'IFR',
  hourlyRateEur: 190,
  imageUrl: null,

  ...auditFields(),
  ...overrides,
})

/** The computed status block the aircraft list renders (hours left, warnings). */
export const anAircraftStatus = (overrides: Partial<AircraftStatus> = {}): AircraftStatus => ({
  totalTime: '4750:00',
  lastLandingTimeUtc: '2025-01-01',
  lastLandingAirport: 'EFNU',
  remainingFuelLitres: 120,
  daysUntilNextMaintenance: 30,
  minsUntilNextMaintenance: 28 * 60,
  usableMins: 28 * 60,
  warnings: [],
  cautions: [],
  ...overrides,
})

/** An aircraft carrying a note of the given severity — drives the status chips. */
export const anAircraftWithNote = (
  text: string,
  severity: Severity = Severity.warning,
  overrides: Partial<Aircraft> = {},
): Aircraft => anAircraft({ notes: [{ text, severity }], ...overrides })

export const anAircraftListResponse = (
  aircrafts: Aircraft[] = [anAircraft()],
): AircraftListResponse => ({ aircrafts })
