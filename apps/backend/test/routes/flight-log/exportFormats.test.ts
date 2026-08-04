import { generateCsv } from '../../../src/routes/flight-log/exportFormats.ts'
import {
  FlightLogExportFormat,
  FlightLogStatus,
  FlightType,
  type FlightLogExportEntry,
} from '../../../src/routes/flight-log/models.ts'

// A dual training flight: the student sits in crew slot 1 (the `pic_*` columns)
// and the instructor in crew2, so slot 1 describes neither the exporting pilot
// nor the pilot in command when the instructor exports their own log.
function dualFlight(overrides: Partial<FlightLogExportEntry> = {}): FlightLogExportEntry {
  return {
    acTotalFlightTime: '00:00',
    acTotalFlightMins: null,
    acTotalLandings: null,
    aircraftRegistration: 'OH-P28',
    aircraftModel: 'PA-28',
    ajlbBlankRowsBefore: 0,
    ajlbSeqNo: 4,
    ajlbRowNo: 0,
    arrivalAirport: 'EFHK',
    billableMemberId: 'Jukka1',
    blockMins: 105,
    blockTime: '01:45',
    crew2LastName: 'Nieminen',
    creditedMins: null,
    departureAirport: 'EFHK',
    estimatedCost: null,
    flightId: 'fi_inst1',
    flightMins: 75,
    flightTime: '01:15',
    flightType: FlightType.SCHOOL,
    fuelRemainingLitres: 15,
    fuelUpliftLitres: 40,
    incidentOrObservations: null,
    instrumentFlyingMins: 0,
    invoiceNumber: null,
    isBillableFlight: true,
    isBilled: false,
    isTrainingProgramPilot: null,
    minBillableExceptionReason: null,
    nightFlyingMins: 0,
    numberOfLandings: 1,
    numberOfNightLandings: 0,
    oilUpliftLitres: 1,
    offBlockTimeUtc: '2025-04-02T09:00:00.000Z',
    takeoffTimeUtc: '2025-04-02T09:15:00.000Z',
    landingTimeUtc: '2025-04-02T10:30:00.000Z',
    onBlockTimeUtc: '2025-04-02T10:45:00.000Z',
    personalRemarks: 'Instructor training flight',
    personsOnBoard: 2,
    picLastName: 'Virtanen',
    picRole: 'STU',
    ownRole: 'FI',
    actingPicLastName: 'Nieminen',
    status: FlightLogStatus.NEW,
    totalTimeInService: 0,
    ...overrides,
  }
}

/** Parse a CSV buffer into the first data row keyed by column name */
function firstRow(csv: Buffer, headerLine = 0): Record<string, string> {
  const lines = csv.toString('utf-8').trim().split(/\r?\n/)
  const fields = lines[headerLine].split(',').map((f) => f.replace(/^"|"$/g, ''))
  const values = lines[headerLine + 1].split(',').map((v) => v.replace(/^"|"$/g, ''))
  return Object.fromEntries(fields.map((f, i) => [f, values[i] ?? '']))
}

describe('flight log export formats', () => {
  it('logs the instructor time as PIC and instructor, not as dual received', () => {
    const row = firstRow(generateCsv([dualFlight()], FlightLogExportFormat.MYFLIGHTBOOK))
    expect(row.PIC).toEqual('01:15')
    expect(row.CFI).toEqual('01:15')
    expect(row['Dual Received']).toEqual('')
  })

  it('logs the student time as dual received', () => {
    const row = firstRow(
      generateCsv([dualFlight({ ownRole: 'STU' })], FlightLogExportFormat.MYFLIGHTBOOK),
    )
    expect(row.PIC).toEqual('')
    expect(row.CFI).toEqual('')
    expect(row['Dual Received']).toEqual('01:15')
  })

  it('names the acting pilot in command rather than the crew slot 1 occupant', () => {
    expect(firstRow(generateCsv([dualFlight()], FlightLogExportFormat.CSV)).PIC).toEqual('Nieminen')
    expect(firstRow(generateCsv([dualFlight()], FlightLogExportFormat.LOGTEN))['PIC Name']).toEqual(
      'Nieminen',
    )
    expect(
      firstRow(generateCsv([dualFlight()], FlightLogExportFormat.LOGBOOK_AERO)).pic_name,
    ).toEqual('Nieminen')
    // ForeFlight prefixes the file with a title line and a blank line
    expect(firstRow(generateCsv([dualFlight()], FlightLogExportFormat.FOREFLIGHT), 2).PIC).toEqual(
      'Nieminen',
    )
  })

  it('splits pic and dual time by the exporting pilot own role', () => {
    const instructor = firstRow(generateCsv([dualFlight()], FlightLogExportFormat.LOGBOOK_AERO))
    expect(instructor.pic_time).toEqual('01:15')
    expect(instructor.dual_time).toEqual('')

    const student = firstRow(
      generateCsv([dualFlight({ ownRole: 'STU' })], FlightLogExportFormat.LOGBOOK_AERO),
    )
    expect(student.pic_time).toEqual('')
    expect(student.dual_time).toEqual('01:15')
  })

  it('exports the pilot own crew role in the flylog role column', () => {
    expect(firstRow(generateCsv([dualFlight()], FlightLogExportFormat.FLYLOG)).pic_role).toEqual(
      'FI',
    )
  })
})
