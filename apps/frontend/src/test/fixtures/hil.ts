import type {
  AircraftHilDetail,
  AircraftHilExtension,
  AircraftHilOverview,
  HilLinkedDefect,
} from '@mik/contracts/aircraft-hil'
import { AIRCRAFT_REGISTRATION, auditFields } from '@mik/ui/test/fixtures/cast'

/**
 * Hold Item List fixtures. Aircraft-specific, so they live in this app rather
 * than in @mik/ui — the admin app has no fly page.
 */
export const aHilLinkedDefect = (overrides: Partial<HilLinkedDefect> = {}): HilLinkedDefect => ({
  defectId: 'a1b2c3d4-0000-4000-8000-000000000001',
  ajlbSeqNo: 12,
  flightId: null,
  description: 'Nav light U/S',
  status: 'ACTIVE',
  flightMins: 4200,
  ...overrides,
})

export const aHilExtension = (
  overrides: Partial<AircraftHilExtension> = {},
): AircraftHilExtension => ({
  extensionId: 'b1b2c3d4-0000-4000-8000-000000000001',
  hilId: 'c1b2c3d4-0000-4000-8000-000000000001',
  extensionDate: '2026-02-01T00:00:00.000Z',
  name: "Niko O'Brien",
  extensionDue: '2026-03-01T00:00:00.000Z',
  ...auditFields(),
  ...overrides,
})

export const aHilDetail = (overrides: Partial<AircraftHilDetail> = {}): AircraftHilDetail => ({
  hilId: 'c1b2c3d4-0000-4000-8000-000000000001',
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  hilNumber: 3,
  sourceRef: null,
  defectCat: 'B',
  description: 'Nav light deferred',
  restrictions: 'Day VFR only',
  openDate: '2026-01-15T00:00:00.000Z',
  name: 'Matti Meikäläinen',
  dueDate: '2026-02-15T00:00:00.000Z',
  resolvedNoteId: null,
  effectiveDueDate: '2026-02-15T00:00:00.000Z',
  isOverdue: false,
  extensions: [],
  defects: [aHilLinkedDefect()],
  ...auditFields(),
  ...overrides,
})

export const aHilOverview = (
  overrides: Partial<AircraftHilOverview> = {},
): AircraftHilOverview => ({
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  isGrounded: false,
  openDefectCount: 0,
  openDefects: [],
  overdueHilCount: 0,
  hil: [aHilDetail()],
  ...overrides,
})
