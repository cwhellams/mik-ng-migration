import {
  FlightLogStatus,
  FlightType,
  type FlightLog,
  type FlightLogListEntry,
  type FlightLogListResponse,
} from '@mik/contracts/flight-log'

import {
  AIRCRAFT_REGISTRATION,
  auditFields,
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
} from '@mik/ui/test/fixtures/cast'

/** 2025-06-02: off block 09:00Z, takeoff 09:10Z, landing 10:50Z, on block 11:00Z. */
const OFF_BLOCK = Date.UTC(2025, 5, 2, 9, 0, 0)
const TAKEOFF = Date.UTC(2025, 5, 2, 9, 10, 0)
const LANDING = Date.UTC(2025, 5, 2, 10, 50, 0)
const ON_BLOCK = Date.UTC(2025, 5, 2, 11, 0, 0)

const epochSeconds = (ms: number) => String(Math.floor(ms / 1000))

const minutesBetween = (fromMs: number, toMs: number) => Math.floor((toMs - fromMs) / 60_000)

/** Same `HH:MM` formatting as the `epoch_diff_to_hhmm` generated column in Postgres. */
const asHhMm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

const BLOCK_MINS = minutesBetween(OFF_BLOCK, ON_BLOCK)
const FLIGHT_MINS = minutesBetween(TAKEOFF, LANDING)

/**
 * A validated training flight: `Matti1` as PIC on `OH-STL`, `Jukka1` as crew 2,
 * EFNU–EFNU. The derived columns (`blockMins`, `blockTime`, ...) are computed
 * from the timestamps above so the fixture is internally consistent.
 */
export const aFlightLog = (overrides: Partial<FlightLog> = {}): FlightLog => ({
  flightId: 'fi_inst1',
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  status: FlightLogStatus.VALIDATED,
  flightType: FlightType.SCHOOL,
  privOrComFlight: 'P',

  billableMemberId: MEMBER_ID,
  picMemberId: MEMBER_ID,
  picLastName: 'Virtanen',
  picRole: 'STU',
  crew2MemberId: INSTRUCTOR_MEMBER_ID,
  crew2LastName: 'Nieminen',
  crew2Role: 'FI',
  crew3MemberId: null,
  crew3LastName: null,
  crew3Role: null,
  crew4MemberId: null,
  crew4LastName: null,
  crew4Role: null,

  departureAirport: 'EFNU',
  arrivalAirport: 'EFNU',

  offBlockTimeEpoch: epochSeconds(OFF_BLOCK),
  offBlockTimeUtc: new Date(OFF_BLOCK).toISOString(),
  takeoffTimeEpoch: epochSeconds(TAKEOFF),
  takeoffTimeUtc: new Date(TAKEOFF).toISOString(),
  landingTimeEpoch: epochSeconds(LANDING),
  landingTimeUtc: new Date(LANDING).toISOString(),
  onBlockTimeEpoch: epochSeconds(ON_BLOCK),
  onBlockTimeUtc: new Date(ON_BLOCK).toISOString(),
  blockMins: BLOCK_MINS,
  blockTime: asHhMm(BLOCK_MINS),
  flightMins: FLIGHT_MINS,
  flightTime: asHhMm(FLIGHT_MINS),

  numberOfLandings: 3,
  numberOfNightLandings: 0,
  nightFlyingMins: 0,
  instrumentFlyingMins: 0,
  personsOnBoard: 2,

  fuelRemainingLitres: 90,
  fuelUpliftLitres: 40,
  oilUpliftLitres: null,
  totalTimeInService: 4750,

  ajlbSeqNo: 4,
  ajlbPageNo: 12,
  ajlbRowNo: 3,
  ajlbBlankRowsBefore: 0,
  ajlbTotalLandings: 1203,
  acTotalFlightTime: '4750:00',
  acTotalLandings: 3200,

  isBillableFlight: true,
  isBilled: false,
  isDtoTrainingFlight: false,
  partiallyBillableFlight: false,
  entryErrorFee: false,
  entryErrorFeeAppliedByMemberId: null,
  invoiceNumber: null,
  billingRemarks: null,
  nonBillingApprovedByMemberId: null,
  nonBillingReason: null,
  minBillableExceptionReason: null,
  minBillableExceptionApprovedByMemberId: null,
  validationRemarks: null,
  incidentOrObservations: null,
  personalRemarks: null,

  ...auditFields(MEMBER_ID),
  ...overrides,
})

/** The narrower shape `GET /api/v1/flight-logs` returns for list rows. */
export const aFlightLogListEntry = (
  overrides: Partial<FlightLogListEntry> = {},
): FlightLogListEntry => {
  const log = aFlightLog()
  return {
    acTotalFlightTime: log.acTotalFlightTime,
    acTotalLandings: log.acTotalLandings,
    aircraftRegistration: log.aircraftRegistration,
    ajlbBlankRowsBefore: log.ajlbBlankRowsBefore,
    ajlbSeqNo: log.ajlbSeqNo,
    ajlbRowNo: log.ajlbRowNo,
    arrivalAirport: log.arrivalAirport,
    billableMemberId: log.billableMemberId,
    blockMins: log.blockMins,
    blockTime: log.blockTime,
    crew2LastName: log.crew2LastName,
    departureAirport: log.departureAirport,
    flightId: log.flightId,
    flightMins: log.flightMins,
    flightTime: log.flightTime,
    flightType: log.flightType,
    fuelRemainingLitres: log.fuelRemainingLitres,
    fuelUpliftLitres: log.fuelUpliftLitres,
    incidentOrObservations: log.incidentOrObservations,
    instrumentFlyingMins: log.instrumentFlyingMins,
    isBillableFlight: log.isBillableFlight,
    isBilled: log.isBilled,
    invoiceNumber: log.invoiceNumber,
    minBillableExceptionReason: log.minBillableExceptionReason,
    minBillableExceptionApprovedByMemberId: log.minBillableExceptionApprovedByMemberId,
    nightFlyingMins: log.nightFlyingMins,
    numberOfLandings: log.numberOfLandings,
    numberOfNightLandings: log.numberOfNightLandings,
    oilUpliftLitres: log.oilUpliftLitres,
    offBlockTimeUtc: log.offBlockTimeUtc,
    takeoffTimeUtc: log.takeoffTimeUtc,
    landingTimeUtc: log.landingTimeUtc,
    onBlockTimeUtc: log.onBlockTimeUtc,
    personsOnBoard: log.personsOnBoard,
    picLastName: log.picLastName,
    status: log.status,
    totalTimeInService: log.totalTimeInService,

    acTotalFlightMins: 4750 * 60,
    creditedMins: log.blockMins,
    estimatedCost: 380,
    isTrainingProgramPilot: true,
    // The default row is the viewer's own flight, flown as PIC — override `isOwnFlight`
    // to build the crew-only case (someone else is billed) that #1019 introduced.
    myCrewRole: log.picRole,
    isOwnFlight: true,
    ...overrides,
  }
}

export const aFlightLogListResponse = (
  logs: FlightLogListEntry[] = [aFlightLogListEntry()],
  overrides: Partial<FlightLogListResponse> = {},
): FlightLogListResponse => ({
  logs,
  page: 1,
  limit: 50,
  pages: 1,
  rows: logs.length,
  ...overrides,
})
