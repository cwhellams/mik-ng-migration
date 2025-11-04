import { conn } from './services/db.ts'
import {
  type FlightLogMigrationRequest,
  FlightType,
} from '../../backend/src/routes/flight-log/models.ts'
import { request } from './services/api.ts'
import dayjs from 'dayjs'
import type {
  AjlbFilter,
  AjlbListResponse,
} from '../../backend/src/routes/ajlb/model.ts'
import type {
  MemberList,
  MemberListFilters,
  MemberListResponse,
} from '../../backend/src/routes/members/models.ts'
import type { Instructor } from './members.ts'

enum TimeSelection {
  NONE = 1,
  FULL = 2,
  PARTIAL = 3,
}

export type Flight = {
  memberId: string | null
  ajlbSeqNo: number
  lento_id: number
  ope: number
  henkilot: number
  registration: string
  kone_id: number
  dep: string
  arr: string
  deptime: Date
  arrtime: Date
  offblock: Date
  onblock: Date
  landings: number
  tyyppi: number
  username: string
  vapaakentta: string | null
  aktiivinen: number
  raportti_id: number | null
  yotiima: number
  mittaritiima: number
  yotiima_sel: number
  mittaritiima_sel: number
  utc: number
  laskutuskentta: string | null
  lasku_id: number | null
  kerhon_piikkiin: number
  simplbooks_id: string | null
  puuttuva_merkinta: number | null
  fuel_remaining: number | null
  g100total: number | null
  lupakirjaoppilas: number
}

// Skip instructors who are not in the members list
const skippedInstructors = [
  999, 30, 31, 32, 35, 36, 39, 41, 46, 79, 52, 53, 56, 71, 76,
]

const skipDuplicateFlights = [10860, 21750, 21241, 21242]

// fix typos in airport codes
const airportMapping: Record<string, string> = {
  EFEF: 'EFJO',
  EHJM: 'EFJM',
  ETU: 'EFTU',
  EUTU: 'EFTU',
  EFH: 'EFHF',
  EFHT: 'EFHF',
  EFTC: 'ENTC',
  EFLR: 'EFLP',
  EFTN: 'EETN',
  LDSV: 'LDSB',
  EFHY: 'EFHV',
  LHDZ: 'LHDC',
  JZKZ: 'LZKZ',
  EFRS: 'EFPR',
  ERPR: 'EFPR',
  ENU: 'EFNU',
  EFP0: 'EFPO',
  ERKA: 'EYKA',
  EFSB: 'ESSB',
  ESU: 'ESSU',
  EFGT: 'ESGT',
  ESDN: 'ESSD',
  EFSD: 'LFSD',
  LPDM: 'LDPM',
  // sailplane ports without ICAO codes
  TUUS: 'ZZZZ',
  PERN: 'ZZZZ',
  GäD: 'ZZZZ',
  KEMI: 'ZZZZ',
  SöD: 'ZZZZ',
  LOHJ: 'ZZZZ',
  MäN: 'MÄN',
}

export const migrateFlights = async (start: string, limit: number) => {
  const books = await request<AjlbFilter, AjlbListResponse>('GET', `v1/ajlb`)

  const currentMembers = await request<MemberListFilters, MemberListResponse>(
    'GET',
    `v1/members`
  )

  const removedMembers = await request<MemberListFilters, MemberListResponse>(
    'GET',
    `v1/members?showRemoved=true`
  )

  const members = [
    ...(currentMembers?.members ?? []),
    ...(removedMembers?.members ?? []),
  ]

  const instructors = await conn.query<Instructor[]>(
    `SELECT * from kirja_opettajat`
  )

  if (!books || !members || !instructors) {
    console.error('No dependencies found, cannot migrate flights')
    return
  }

  const last = await migrateBatch(start, limit, books, members, instructors)
  console.log(
    `Migrated up to flight ID ${last?.lento_id} at ${last?.deptime.toISOString()}`
  )
}

const migrateBatch = async (
  start: string,
  limit: number,
  { books }: AjlbListResponse,
  members: MemberList[],
  instructors: Instructor[]
): Promise<Flight | undefined> => {
  const flights = await conn.query<Flight[]>(
    `SELECT 
      p.nimi as registration, 
      k.kirja_nro as ajlbSeqNo,
      u.ng_id as memberId,
      f.* 
      from kirja_lennot f
      join kirja_koneet p on p.kone_id = f.kone_id
      left join kirja_kirjat k on k.kone_id = f.kone_id AND f.deptime >= k.avauspv and  f.deptime <= k.sulkupv
      left join mik_ng u on u.username = f.username
      WHERE f.deptime >= ? AND f.aktiivinen = 1
      ORDER BY f.deptime ASC
      LIMIT ?`,
    [dayjs(start).toDate(), limit]
  )

  const ajlbBlankRowsBefore: Record<string, number> = {}

  for (const flight of flights) {
    if (skipDuplicateFlights.includes(flight.lento_id)) {
      console.log(`Skipping ${flight.lento_id}`)
      continue
    }

    const book = books.find(
      (b) =>
        b.aircraftRegistration == flight.registration &&
        dayjs(b.startDate).isBefore(flight.deptime) &&
        (b.endDate == null || dayjs(b.endDate).isAfter(flight.arrtime))
    )
    if (!book) {
      console.warn(
        `No logbook found for flight ${flight.lento_id} with plane ${flight.registration}, deptime=${flight.deptime}, arrtime=${flight.arrtime}`
      )
      continue
    }

    try {
      const success = await migrateFlight(
        flight,
        // newer flights can match ajlbSeqNo from sql query
        flight.ajlbSeqNo ?? book.seqNo,
        members,
        instructors,
        ajlbBlankRowsBefore
      )
      if (success) {
        ajlbBlankRowsBefore[flight.registration] = 0
      }
    } catch (e) {
      console.log(
        `Error migrating flight ${flight.lento_id}, stopping migration to timestamp ${flight.deptime.toISOString()}`
      )
      console.log(flight)
      throw e
    }
  }

  Object.entries(ajlbBlankRowsBefore).forEach(([reg, emptyRows]) => {
    if (emptyRows) {
      console.log(
        `WARNING! Logbook ${reg} has ${emptyRows} empty rows that were not used by any flight`
      )
    }
  })

  return flights.at(-1)
}

const migrateFlight = async (
  flight: Flight,
  ajlbSeqNo: number,
  members: MemberList[],
  instructors: Instructor[],
  ajlbBlankRowsBefore: Record<string, number>
): Promise<boolean> => {
  const flightTimeMins =
    (flight.arrtime.getTime() - flight.deptime.getTime()) / 60000

  const flightType = getFlightType(flight.tyyppi)

  const instructor = !skippedInstructors.includes(flight.ope)
    ? getInstructorId(flight.ope, instructors, members)
    : null

  const member = members.find((m) => m.memberId === flight.memberId)!

  const times = getTimes(flight)

  // add empty rows to the previous flight
  if (
    flight.tyyppi == 15 ||
    (flight.deptime.getTime() == flight.arrtime.getTime() &&
      flight.offblock.getTime() == flight.onblock.getTime())
  ) {
    ajlbBlankRowsBefore[flight.registration] =
      (ajlbBlankRowsBefore[flight.registration] ?? 0) + 1
    console.log(
      `Adding empty row to register ${flight.registration}, total before flight is now ${ajlbBlankRowsBefore[flight.registration]}`
    )
    return false
  }

  // if there is another pilot as crew2
  const crew2 = instructor && instructor.memberId !== flight.memberId

  const flightLog: FlightLogMigrationRequest = {
    aircraftRegistration: flight.registration,
    ajlbBlankRowsBefore: ajlbBlankRowsBefore[flight.registration] ?? 0,
    ajlbSeqNo,
    departureAirport: airportMapping?.[flight.dep] || flight.dep,
    arrivalAirport: airportMapping?.[flight.arr] || flight.arr,
    offBlockTimeEpoch: times.offBlockTimeEpoch.toString(),
    takeoffTimeEpoch: times.takeoffTimeEpoch.toString(),
    landingTimeEpoch: times.landingTimeEpoch.toString(),
    onBlockTimeEpoch: times.onBlockTimeEpoch.toString(),
    billableMemberId: flight.memberId!,
    picMemberId: instructor ? instructor.memberId : member.memberId,
    picRole: instructor ? 'FI' : 'PIC',
    crew2MemberId: crew2 ? flight.memberId : null,
    crew2Role: 'STU',
    crew3MemberId: null,
    crew3Role: null,
    crew4MemberId: null,
    crew4Role: null,

    flightType,

    fuelRemainingLitres: Math.min(
      40,
      Math.max(1, Math.round((flight.fuel_remaining ?? 1) * 3.78541))
    ),
    fuelUpliftLitres: null,
    oilUpliftLitres: null,

    personsOnBoard: flight.henkilot,
    numberOfLandings: flight.landings,
    numberOfNightLandings:
      flight.yotiima_sel == TimeSelection.FULL ? flight.landings : 0,
    instrumentFlyingMins:
      flight.mittaritiima_sel == TimeSelection.FULL
        ? flightTimeMins
        : flight.mittaritiima,
    nightFlyingMins:
      flight.yotiima_sel == TimeSelection.FULL
        ? flightTimeMins
        : flight.yotiima,
    totalTimeInService: flight.g100total,

    billingRemarks: flight.laskutuskentta,
    personalRemarks: flight.vapaakentta,

    invoiceNumber: flight.simplbooks_id ?? flight.lasku_id?.toString() ?? null,
    nonBillingReason: null,
    isBillableFlight: flight.kerhon_piikkiin == 1,
    incidentOrObservations: flight.raportti_id
      ? flight.raportti_id.toString()
      : null,
    isDtoTrainingFlight: flight.lupakirjaoppilas == 1,
  }

  try {
    await request('POST', 'v1/flight-logs', flightLog)
    return true
  } catch (e) {
    console.log(flightLog)
    console.log({
      offBlockTime: new Date(times.offBlockTimeEpoch * 1000).toISOString(),
      takeoffTime: new Date(times.takeoffTimeEpoch * 1000).toISOString(),
      landingTime: new Date(times.landingTimeEpoch * 1000).toISOString(),
      onBlockTime: new Date(times.onBlockTimeEpoch * 1000).toISOString(),
    })
    throw e
  }
}

const dateToEpoch = (date: Date, fallback?: Date): number => {
  return Math.floor((date || fallback).getTime() / 1000)
}

const minute = 60
const hour = 60 * minute
const day = 24 * hour
const year = 365 * day

const getTimes = (flight: Flight) => {
  const offBlockTimeEpoch = dateToEpoch(flight.offblock, flight.deptime)
  const takeoffTimeEpoch = dateToEpoch(flight.deptime)
  const landingTimeEpoch = dateToEpoch(flight.arrtime)
  const onBlockTimeEpoch = dateToEpoch(flight.onblock, flight.arrtime)

  // return {
  //   offBlockTimeEpoch,
  //   takeoffTimeEpoch,
  //   landingTimeEpoch,
  //   onBlockTimeEpoch,
  // }

  // block times are not set, use flight time instead (e.g. lento_id 456)
  if (offBlockTimeEpoch == onBlockTimeEpoch) {
    return {
      offBlockTimeEpoch: takeoffTimeEpoch - minute,
      takeoffTimeEpoch,
      landingTimeEpoch,
      onBlockTimeEpoch: landingTimeEpoch + minute,
    }
  }

  // flight times are not set, use block time instead (e.g. lento_id 318)
  if (takeoffTimeEpoch == landingTimeEpoch) {
    return {
      offBlockTimeEpoch,
      takeoffTimeEpoch: offBlockTimeEpoch + minute,
      landingTimeEpoch: onBlockTimeEpoch - minute,
      onBlockTimeEpoch,
    }
  }

  // one hour typo in the landing time (e.g. lento_id 797)
  if (takeoffTimeEpoch > landingTimeEpoch) {
    return {
      offBlockTimeEpoch,
      takeoffTimeEpoch,
      landingTimeEpoch: landingTimeEpoch + hour,
      onBlockTimeEpoch,
    }
  }

  // random typos in block times

  // console.log(
  //   `Flight ${flight.lento_id} block times ${flight.offblock.toISOString()} -> ${flight.deptime.toISOString()}:
  //   offBlockToTakeoff=${offBlockToTakeoff} mins, landingToOnBlock=${landingToOnBlock} mins`
  // )

  return {
    offBlockTimeEpoch: getOffBlockTime(offBlockTimeEpoch, takeoffTimeEpoch),
    takeoffTimeEpoch,
    landingTimeEpoch,
    onBlockTimeEpoch: getOnBlockTime(onBlockTimeEpoch, landingTimeEpoch),
  }
}

// fix random offsets in offblock time
const getOffBlockTime = (offblock: number, takeoff: number): number => {
  const diff = offblock - takeoff

  const valid = (x: number) => x > -hour && x < 0

  if (diff > 0) {
    // off block time is after takeoff

    // block times are offset by +1 year, (e.g. lento_id 505)
    if (valid(diff - year)) {
      return offblock - year
    }

    // block times are offset by tz offset (e.g lento_id 616)
    const tz = -new Date(offblock * 1000).getTimezoneOffset() * minute
    if (valid(diff - tz)) {
      return offblock - tz
    }

    // block times are offset by +1 hour (e.g. lento_id 370)
    if (valid(diff - hour)) {
      return offblock - hour
    }

    console.log(
      `Couldn't fix positive off-block time offset, setting to takeoff - 1 minute ${new Date(offblock * 1000).toISOString()} -> ${new Date(
        (takeoff - minute) * 1000
      ).toISOString()}`
    )

    // as last resort, set to takeoff - 1 minute, (e.g. lento_id 2232)
    return takeoff - minute
  } else if (diff < -hour) {
    // more than 1 hour before takeoff

    // block times are offset by -1 hour (e.g. lento_id 478)
    if (valid(diff + hour)) {
      return offblock + hour
    }

    console.log(
      `Couldn't fix negative off-block time offset, setting to takeoff - 1 minute ${new Date(offblock * 1000).toISOString()} -> ${new Date(
        (takeoff - minute) * 1000
      ).toISOString()}`
    )
    return takeoff - minute
  } else {
    // no blocktime, set to one minute before takeoff (e.g lento 790)
    return offblock - minute
  }
}

// fix random offsets in block times
const getOnBlockTime = (onblock: number, landing: number): number => {
  const diff = onblock - landing

  const valid = (x: number) => x > 0 && x < 30 * minute

  if (!valid(diff) && diff > 0) {
    // more than 30 minutes after landing

    // block times are offset by +1 year, (e.g. lento_id 505)
    if (valid(diff - year)) {
      return onblock - year
    }

    // block times are offset by +1 day (e.g. lento_id 616)
    if (valid(diff - day)) {
      return onblock - day
    }

    // block times are offset by +1 hour (e.g. lento_id 370)
    if (valid(diff - hour)) {
      return onblock - hour
    }

    // block times are offset by +1 hour (e.g. lento_id 370)
    if (valid(diff - hour)) {
      return onblock - hour
    }

    console.log(
      `Couldn't fix positive on-block time offset, setting to landing + 1 minute ${new Date(onblock * 1000).toISOString()} -> ${new Date(
        (landing + minute) * 1000
      ).toISOString()}`
    )

    // as last resort, set to landing + 1 minute, (e.g. lento_id 1689)
    return landing + minute
  } else if (diff < 0) {
    // onblock time is before landing

    // block times are offset by -1 hour (e.g. lento_id 478)
    if (valid(diff + hour)) {
      return onblock + hour
    }

    // Only some minutes in the wrong side. Maybe landing/onblock were entered in wrong order.
    // Keep the same taxi out time (e.g. lento_id 716)
    if (valid(-diff * 2)) {
      return onblock - diff * 2
    }
    console.log(
      `Couldn't fix negative on-block time offset, setting to landing + 1 minute ${new Date(onblock * 1000).toISOString()} -> ${new Date(
        (landing + minute) * 1000
      ).toISOString()}`
    )
    return landing + minute
  } else {
    // no blocktime, add one minutes offset to on-block time (e.g lento 371)
    return onblock + minute
  }
}

const getInstructorId = (
  ope_id: number,
  instructors: Instructor[],
  members: MemberList[]
): MemberList | undefined => {
  const instructor = instructors.find((i) => i.ope_id === ope_id)
  if (!instructor) {
    throw new Error(`Instructor ${ope_id} not found from instructors list`)
  }
  const instructorMembers = members.filter((m) =>
    m.roles.includes('INSTRUCTOR')
  )

  const name = instructor.nimi.replaceAll('Käho', 'Kähö') // typo fix

  const fullMatch = instructorMembers.find(
    (m) =>
      m.roles.includes('INSTRUCTOR') &&
      name.toLowerCase().includes(m.last.toLowerCase())
  )
  if (fullMatch) {
    return fullMatch
  }

  console.log(
    `Instructor ${JSON.stringify(instructor, null, 2)} not found from members list`
  )
}

const getFlightType = (type: number): FlightType => {
  switch (type) {
    case 1: // Harjoituslento
    case 5: // Yö harjoituslento
      return FlightType.PRIVATE
    case 2: // Koululento
    case 4: // Koulumatkalento
    case 7: // Yö Koululento
    case 8: // Yö Koulumatkalento
    case 11: // Kertauskoululento
      return FlightType.SCHOOL
    case 3: // Matkalento
    case 6: // Yö Matkalento
      return FlightType.XC
    case 9: // Välitarkastuslento
    case 10: // Tarkastuslento
      return FlightType.CHECKFLIGHT

    case 12: // Siirtolento
      return FlightType.FERRY
    case 13: // Taitolento
      return FlightType.AEROBATICS

    case 16: // SAR tehtävä
    case 17: // SAR koulutus
      return FlightType.SAR

    case 18: // Koelento
      return FlightType.TEST_FLIGHT

    // 14: Muu (tarkenna huomautuksiin)
    default:
      return FlightType.OTHER
  }
}
