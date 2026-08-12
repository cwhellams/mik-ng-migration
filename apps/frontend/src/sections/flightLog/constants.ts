import { FlightType } from '@mik/contracts/flight-log'

// Restricted list offered for new entries — the full backend enum has additional
// legacy values (DTO, SAR, XC, AEROBATICS, OTHER) only ever seen on old records.
export const flightTypes: FlightType[] = [
  FlightType.PRIVATE,
  FlightType.SCHOOL,
  FlightType.CHECKFLIGHT,
  FlightType.FERRY,
  FlightType.TEST_FLIGHT,
]
