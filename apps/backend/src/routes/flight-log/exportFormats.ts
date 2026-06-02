import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import PDFDocument from 'pdfkit'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { FlightLogExportFormat, type FlightLogExportEntry } from './models.ts'

const LOGO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/mik-logo-blue.png',
)

export interface PdfMemberInfo {
  firstName: string
  lastName: string
  licenceId?: string
  streetAddress?: string
  townCity?: string
  postcode?: string
}

dayjs.extend(utc)

/** Format minutes as HH:MM */
function minsToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Derive the export filename from format and optional date range */
export function getFilename(
  format: FlightLogExportFormat,
  startDate?: string,
  endDate?: string,
): string {
  const ext = format === FlightLogExportFormat.EASA_PDF ? 'pdf' : 'csv'
  const parts = ['flight-log']
  if (startDate) parts.push(dayjs.utc(startDate).format('YYYY-MM-DD'))
  if (endDate) parts.push(dayjs.utc(endDate).format('YYYY-MM-DD'))
  return `${parts.join('_')}.${ext}`
}

// ---------------------------------------------------------------------------
// CSV serialisers
// ---------------------------------------------------------------------------

function toCsvBuffer(fields: string[], rows: Record<string, string | number | null>[]): Buffer {
  const csv = Papa.unparse({ fields, data: rows })
  return Buffer.from(csv, 'utf-8')
}

function genericCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'Date',
    'Aircraft',
    'Departure',
    'Arrival',
    'Off Block (UTC)',
    'Take Off (UTC)',
    'Landing (UTC)',
    'On Block (UTC)',
    'Flight Time',
    'Block Time',
    'PIC',
    'Night (min)',
    'IFR (min)',
    'Landings',
    'Night Landings',
    'Remarks',
  ]
  const rows = logs.map(l => ({
    Date: dayjs.utc(l.offBlockTimeUtc).format('YYYY-MM-DD'),
    Aircraft: l.aircraftRegistration,
    Departure: l.departureAirport,
    Arrival: l.arrivalAirport,
    'Off Block (UTC)': dayjs.utc(l.offBlockTimeUtc).format('HH:mm'),
    'Take Off (UTC)': dayjs.utc(l.takeoffTimeUtc).format('HH:mm'),
    'Landing (UTC)': dayjs.utc(l.landingTimeUtc).format('HH:mm'),
    'On Block (UTC)': dayjs.utc(l.onBlockTimeUtc).format('HH:mm'),
    'Flight Time': l.flightTime,
    'Block Time': l.blockTime,
    PIC: l.picLastName,
    'Night (min)': l.nightFlyingMins,
    'IFR (min)': l.instrumentFlyingMins,
    Landings: l.numberOfLandings,
    'Night Landings': l.numberOfNightLandings,
    Remarks: l.personalRemarks ?? '',
  }))
  return toCsvBuffer(fields, rows)
}

function foreflightCsv(logs: FlightLogExportEntry[]): Buffer {
  // ForeFlight requires a literal header row, then blank row, then column headers
  const header = 'ForeFlight Logbook Import\n\n'
  const fields = [
    'Date',
    'AircraftID',
    'From',
    'To',
    'Route',
    'TimeOut',
    'TimeIn',
    'TotalTime',
    'PIC',
    'Night',
    'ActualInstrument',
    'Day',
    'NightLdg',
    'Remarks',
  ]
  const rows = logs.map(l => ({
    Date: dayjs.utc(l.offBlockTimeUtc).format('YYYY-MM-DD'),
    AircraftID: l.aircraftRegistration,
    From: l.departureAirport,
    To: l.arrivalAirport,
    Route: '',
    TimeOut: dayjs.utc(l.offBlockTimeUtc).format('HH:mm'),
    TimeIn: dayjs.utc(l.onBlockTimeUtc).format('HH:mm'),
    TotalTime: l.flightTime,
    PIC: l.picLastName,
    Night: minsToHHMM(l.nightFlyingMins),
    ActualInstrument: minsToHHMM(l.instrumentFlyingMins),
    Day: l.numberOfLandings - l.numberOfNightLandings,
    NightLdg: l.numberOfNightLandings,
    Remarks: l.personalRemarks ?? '',
  }))
  return Buffer.from(header + Papa.unparse({ fields, data: rows }), 'utf-8')
}

function myflightbookCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'Date',
    'Tail Number',
    'Approaches',
    'Hold',
    'Landings',
    'FS Night Landings',
    'FS Day Landings',
    'X-Country',
    'Night',
    'IMC',
    'Simulated Instrument',
    'Dual Received',
    'CFI',
    'Total Flight Time',
    'PIC',
    'Route',
    'Comments',
    'Engine Start',
    'Flight Start',
    'Flight End',
    'Engine End',
  ]
  const rows = logs.map(l => {
    const isPIC = l.picRole === 'PIC' || l.picRole === 'FI'
    const isDual = l.picRole === 'STU'
    return {
      Date: dayjs.utc(l.offBlockTimeUtc).format('DD/MM/YYYY'),
      'Tail Number': l.aircraftRegistration,
      Approaches: '',
      Hold: '',
      Landings: l.numberOfLandings,
      'FS Night Landings': l.numberOfNightLandings,
      'FS Day Landings': l.numberOfLandings - l.numberOfNightLandings,
      'X-Country': '',
      Night: minsToHHMM(l.nightFlyingMins),
      IMC: minsToHHMM(l.instrumentFlyingMins),
      'Simulated Instrument': '',
      'Dual Received': isDual ? l.flightTime : '',
      CFI: l.picRole === 'FI' ? l.flightTime : '',
      'Total Flight Time': l.flightTime,
      PIC: isPIC ? l.flightTime : '',
      Route: `${l.departureAirport} ${l.arrivalAirport}`,
      Comments: l.personalRemarks ?? '',
      'Engine Start': l.onBlockTimeUtc,
      'Flight Start': l.onBlockTimeUtc,
      'Flight End': l.onBlockTimeUtc,
      'Engine End': l.onBlockTimeUtc,
    }
  })
  return toCsvBuffer(fields, rows)
}

function crewloungeCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'date',
    'dep',
    'dest',
    'atd',
    'ata',
    'aircraft_type',
    'registration',
    'pic',
    'total_time',
    'night_time',
    'ifr_time',
    'landings_day',
    'landings_night',
    'remarks',
  ]
  const rows = logs.map(l => ({
    date: dayjs.utc(l.offBlockTimeUtc).format('YYYY-MM-DD'),
    dep: l.departureAirport,
    dest: l.arrivalAirport,
    atd: dayjs.utc(l.offBlockTimeUtc).format('HH:mm'),
    ata: dayjs.utc(l.onBlockTimeUtc).format('HH:mm'),
    aircraft_type: l.aircraftModel ?? '',
    registration: l.aircraftRegistration,
    pic: l.picLastName,
    total_time: l.flightTime,
    night_time: minsToHHMM(l.nightFlyingMins),
    ifr_time: minsToHHMM(l.instrumentFlyingMins),
    landings_day: l.numberOfLandings - l.numberOfNightLandings,
    landings_night: l.numberOfNightLandings,
    remarks: l.personalRemarks ?? '',
  }))
  return toCsvBuffer(fields, rows)
}

function logbookAeroCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'date',
    'departure_place',
    'departure_time',
    'arrival_place',
    'arrival_time',
    'aircraft_model',
    'aircraft_reg',
    'total_time',
    'pic_name',
    'night',
    'ifr',
    'pic_time',
    'dual_time',
    'landings_day',
    'landings_night',
    'remarks',
  ]
  const rows = logs.map(l => {
    const isPIC = l.picRole === 'PIC' || l.picRole === 'FI'
    const isDual = l.picRole === 'STU'
    return {
      date: dayjs.utc(l.offBlockTimeUtc).format('DD.MM.YYYY'),
      departure_place: l.departureAirport,
      departure_time: dayjs.utc(l.offBlockTimeUtc).format('HH:mm'),
      arrival_place: l.arrivalAirport,
      arrival_time: dayjs.utc(l.onBlockTimeUtc).format('HH:mm'),
      aircraft_model: l.aircraftModel ?? '',
      aircraft_reg: l.aircraftRegistration,
      total_time: l.flightTime,
      pic_name: l.picLastName,
      night: minsToHHMM(l.nightFlyingMins),
      ifr: minsToHHMM(l.instrumentFlyingMins),
      pic_time: isPIC ? l.flightTime : '',
      dual_time: isDual ? l.flightTime : '',
      landings_day: l.numberOfLandings - l.numberOfNightLandings,
      landings_night: l.numberOfNightLandings,
      remarks: l.personalRemarks ?? '',
    }
  })
  return toCsvBuffer(fields, rows)
}

function logtenCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'Date',
    'Aircraft Ident',
    'Aircraft Type',
    'Route',
    'Duration',
    'Night Duration',
    'Actual Instrument',
    'Day Landings',
    'Night Landings',
    'PIC Name',
    'Remarks',
  ]
  const rows = logs.map(l => ({
    Date: dayjs.utc(l.offBlockTimeUtc).format('YYYY-MM-DD'),
    'Aircraft Ident': l.aircraftRegistration,
    'Aircraft Type': l.aircraftModel ?? '',
    Route: `${l.departureAirport}-${l.arrivalAirport}`,
    Duration: l.flightTime,
    'Night Duration': minsToHHMM(l.nightFlyingMins),
    'Actual Instrument': minsToHHMM(l.instrumentFlyingMins),
    'Day Landings': l.numberOfLandings - l.numberOfNightLandings,
    'Night Landings': l.numberOfNightLandings,
    'PIC Name': l.picLastName,
    Remarks: l.personalRemarks ?? '',
  }))
  return toCsvBuffer(fields, rows)
}

function flylogCsv(logs: FlightLogExportEntry[]): Buffer {
  const fields = [
    'date',
    'aircraft_reg',
    'aircraft_type',
    'dep_icao',
    'arr_icao',
    'off_block',
    'on_block',
    'total_time',
    'pic_lastname',
    'night',
    'ifr',
    'pic_role',
    'landings',
    'night_landings',
    'remarks',
  ]
  const rows = logs.map(l => ({
    date: dayjs.utc(l.offBlockTimeUtc).format('YYYY-MM-DD'),
    aircraft_reg: l.aircraftRegistration,
    aircraft_type: l.aircraftModel ?? '',
    dep_icao: l.departureAirport,
    arr_icao: l.arrivalAirport,
    off_block: dayjs.utc(l.offBlockTimeUtc).format('HH:mm'),
    on_block: dayjs.utc(l.onBlockTimeUtc).format('HH:mm'),
    total_time: l.flightTime,
    pic_lastname: l.picLastName,
    night: minsToHHMM(l.nightFlyingMins),
    ifr: minsToHHMM(l.instrumentFlyingMins),
    pic_role: l.picRole ?? '',
    landings: l.numberOfLandings,
    night_landings: l.numberOfNightLandings,
    remarks: l.personalRemarks ?? '',
  }))
  return toCsvBuffer(fields, rows)
}

export function generateCsv(logs: FlightLogExportEntry[], format: FlightLogExportFormat): Buffer {
  switch (format) {
    case FlightLogExportFormat.FOREFLIGHT:
      return foreflightCsv(logs)
    case FlightLogExportFormat.MYFLIGHTBOOK:
      return myflightbookCsv(logs)
    case FlightLogExportFormat.CREWLOUNGE:
      return crewloungeCsv(logs)
    case FlightLogExportFormat.LOGBOOK_AERO:
      return logbookAeroCsv(logs)
    case FlightLogExportFormat.LOGTEN:
      return logtenCsv(logs)
    case FlightLogExportFormat.FLYLOG:
      return flylogCsv(logs)
    case FlightLogExportFormat.CSV:
    default:
      return genericCsv(logs)
  }
}

// ---------------------------------------------------------------------------
// EASA Part-FCL PDF generator
// ---------------------------------------------------------------------------

const PAGE_W = 841.89 // A4 landscape points
const PAGE_H = 595.28
const MARGIN = 20
const INFO_HEADER_H = 52 // logo + member info band at top of every page
const ROW_H = 16
const HEADER_H = 40
const HEADER_TOP_H = 16 // group-label row height
const HEADER_BOT_H = HEADER_H - HEADER_TOP_H // sub-column label row height

interface ColDef {
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
}

/** Describes a column group for the two-row spanning header.
 *  label = '' means the column spans both header rows (no group). */
interface ColGroupDef {
  label: string
  count: number
}

// Sub-column labels (bottom header row for grouped cols; full-height label for ungrouped).
// Order must match COL_GROUP_DEFS exactly.
const COLS: ColDef[] = [
  { label: 'Date', width: 55, align: 'center' },
  { label: 'Place', width: 40, align: 'center' }, // Departure
  { label: 'Time', width: 35, align: 'center' }, // Departure
  { label: 'Place', width: 40, align: 'center' }, // Arrival
  { label: 'Time', width: 35, align: 'center' }, // Arrival
  { label: 'Type', width: 50, align: 'center' }, // Aircraft
  { label: 'Reg.', width: 45, align: 'center' }, // Aircraft
  { label: 'SE', width: 24, align: 'center' },
  { label: 'ME', width: 24, align: 'center' },
  { label: 'PIC', width: 55, align: 'center' },
  { label: 'Total\nTime', width: 38, align: 'center' },
  { label: 'Night', width: 33, align: 'center' },
  { label: 'IFR', width: 33, align: 'center' },
  { label: 'PIC', width: 35, align: 'center' }, // Function
  { label: 'Co-Pilot', width: 38, align: 'center' }, // Function
  { label: 'Dual', width: 35, align: 'center' }, // Function
  { label: 'Instructor', width: 38, align: 'center' }, // Function
  { label: 'Day', width: 28, align: 'center' }, // Landings
  { label: 'Night', width: 32, align: 'center' }, // Landings
  { label: 'Remarks and Endorsements', width: 0, align: 'left' }, // fills remaining
]

const COL_GROUP_DEFS: ColGroupDef[] = [
  { label: '', count: 1 }, // Date
  { label: 'Departure', count: 2 }, // Place, Time
  { label: 'Arrival', count: 2 }, // Place, Time
  { label: 'Aircraft', count: 2 }, // Type, Reg.
  { label: 'Single Pilot', count: 2 }, // SE, ME
  { label: '', count: 1 }, // PIC
  { label: '', count: 1 }, // Total Time
  { label: 'Operational Conditions', count: 2 }, // Night, IFR
  { label: 'Function', count: 4 }, // PIC, Co-Pilot, Dual, Instructor
  { label: 'Landings', count: 2 }, // Day, Night
  { label: '', count: 1 }, // Remarks and Endorsements
]

/** Compute the actual width of the Remarks column */
function resolveColWidths(pageContentW: number): ColDef[] {
  const fixed = COLS.slice(0, -1).reduce((s, c) => s + c.width, 0)
  return COLS.map((c, i) =>
    i === COLS.length - 1 ? { ...c, width: Math.max(pageContentW - fixed, 40) } : c,
  )
}

interface Totals {
  flightMins: number
  nightMins: number
  ifrMins: number
  picMins: number
  dualMins: number
  instructorMins: number
  dayLandings: number
  nightLandings: number
}

function zeroTotals(): Totals {
  return {
    flightMins: 0,
    nightMins: 0,
    ifrMins: 0,
    picMins: 0,
    dualMins: 0,
    instructorMins: 0,
    dayLandings: 0,
    nightLandings: 0,
  }
}

function addTotals(a: Totals, b: Totals): Totals {
  return {
    flightMins: a.flightMins + b.flightMins,
    nightMins: a.nightMins + b.nightMins,
    ifrMins: a.ifrMins + b.ifrMins,
    picMins: a.picMins + b.picMins,
    dualMins: a.dualMins + b.dualMins,
    instructorMins: a.instructorMins + b.instructorMins,
    dayLandings: a.dayLandings + b.dayLandings,
    nightLandings: a.nightLandings + b.nightLandings,
  }
}

function entryTotals(l: FlightLogExportEntry): Totals {
  const isPIC = l.picRole === 'PIC' || l.picRole === 'FI'
  const isDual = l.picRole === 'STU'
  const isInstructor = l.picRole === 'FI' || l.picRole === 'FE'
  return {
    flightMins: l.flightMins,
    nightMins: l.nightFlyingMins,
    ifrMins: l.instrumentFlyingMins,
    picMins: isPIC ? l.flightMins : 0,
    dualMins: isDual ? l.flightMins : 0,
    instructorMins: isInstructor ? l.flightMins : 0,
    dayLandings: l.numberOfLandings - l.numberOfNightLandings,
    nightLandings: l.numberOfNightLandings,
  }
}

function drawTableHeaders(doc: PDFKit.PDFDocument, cols: ColDef[], x: number, y: number) {
  doc.fontSize(6).font('Helvetica-Bold')
  let cx = x
  let colIdx = 0

  for (const group of COL_GROUP_DEFS) {
    const groupCols = cols.slice(colIdx, colIdx + group.count)
    const groupW = groupCols.reduce((s, c) => s + c.width, 0)

    if (group.label === '') {
      // No group — single column spans the full header height
      const col = groupCols[0]
      doc.rect(cx, y, col.width, HEADER_H).stroke()
      const lines = col.label.split('\n')
      const lineH = 8
      let ly = y + (HEADER_H - lines.length * lineH) / 2
      for (const line of lines) {
        doc.text(line, cx + 1, ly, { width: col.width - 2, align: 'center', lineBreak: false })
        ly += lineH
      }
    } else {
      // Group header spans all sub-columns in the top row
      doc.rect(cx, y, groupW, HEADER_TOP_H).stroke()
      doc.text(group.label, cx + 1, y + (HEADER_TOP_H - 7) / 2, {
        width: groupW - 2,
        align: 'center',
        lineBreak: false,
      })
      // Sub-column labels in the bottom row
      let subX = cx
      for (const col of groupCols) {
        doc.rect(subX, y + HEADER_TOP_H, col.width, HEADER_BOT_H).stroke()
        doc.text(col.label, subX + 1, y + HEADER_TOP_H + (HEADER_BOT_H - 7) / 2, {
          width: col.width - 2,
          align: 'center',
          lineBreak: false,
        })
        subX += col.width
      }
    }

    cx += groupW
    colIdx += group.count
  }

  doc.font('Helvetica')
}

function drawDataRow(
  doc: PDFKit.PDFDocument,
  cols: ColDef[],
  x: number,
  y: number,
  values: (string | number)[],
) {
  doc.fontSize(6)
  let cx = x
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    const val = values[i] ?? ''
    doc.rect(cx, y, col.width, ROW_H).stroke()
    doc.text(String(val), cx + 2, y + 4, {
      width: col.width - 4,
      align: col.align ?? 'left',
      height: ROW_H - 4,
      ellipsis: true,
    })
    cx += col.width
  }
}

function drawTotalsRow(
  doc: PDFKit.PDFDocument,
  cols: ColDef[],
  x: number,
  y: number,
  label: string,
  totals: Totals,
  firstTotalRow: boolean = false,
) {
  const values: (string | number)[] = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    label, // Date … PIC
    minsToHHMM(totals.flightMins),
    minsToHHMM(totals.nightMins),
    minsToHHMM(totals.ifrMins),
    minsToHHMM(totals.picMins),
    '00:00', // Co-Pilot - Always zero since we don't have any multi pilot planes
    minsToHHMM(totals.dualMins),
    minsToHHMM(totals.instructorMins),
    totals.dayLandings,
    totals.nightLandings,
    '',
  ]
  doc.font('Helvetica-Bold')
  doc.fontSize(6)
  let cx = x
  for (let i = 0; i < cols.length - 1; i++) {
    const col = cols[i]
    const val = values[i] ?? ''
    if (values[i] !== '') {
      doc.rect(cx, y, col.width, ROW_H).stroke()
    }
    doc.text(String(val), cx + 2, y + 4, {
      width: col.width - 4,
      align: col.align ?? 'left',
      height: ROW_H - 4,
      ellipsis: true,
    })
    cx += col.width
  }
  if (firstTotalRow) {
    // Signature box
    doc.rect(cx, y, cols[cols.length - 1].width, ROW_H * 3).stroke()
  }

  doc.font('Helvetica')
}

export function generateEasaPdf(
  logs: FlightLogExportEntry[],
  member: PdfMemberInfo,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const contentW = PAGE_W - 2 * MARGIN
    const cols = resolveColWidths(contentW)
    const usableH = PAGE_H - 2 * MARGIN
    const rowsPerPage = Math.floor((usableH - INFO_HEADER_H - HEADER_H) / ROW_H) - 3 // reserve 3 rows for totals (Page Total + Previous Total + Total Time)
    const totalPages = Math.ceil(Math.max(logs.length, 1) / rowsPerPage)

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    let grandTotal = zeroTotals()
    let pageIndex = 0

    for (let start = 0; start < Math.max(logs.length, 1); start += rowsPerPage) {
      const pageRows = logs.slice(start, start + rowsPerPage)
      if (pageIndex > 0) doc.addPage()
      pageIndex++

      let y = MARGIN

      // ── Info header band ─────────────────────────────────────────────────────
      // Logo (left)
      const logoH = 36
      const logoY = y + (INFO_HEADER_H - logoH) / 2
      doc.image(LOGO_PATH, MARGIN, logoY, { height: logoH })
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Malmin Ilmailukerho Ry', MARGIN + 75, y + 6, { align: 'left', width: contentW })
      doc
        .fontSize(7)
        .font('Helvetica')
        .text('mik.fi', MARGIN + 75, y + 20, {
          align: 'left',
          width: contentW,
          link: 'https://mik.fi/',
          underline: true,
        })

      // Title (centre)
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('PILOT LOGBOOK', MARGIN, y + 8, { align: 'center', width: contentW })
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('EASA Aircrew Regulations Appendix I (Part-FCL) AMC1 FCL.050', MARGIN, y + 25, {
          align: 'center',
          width: contentW,
          link: 'https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no?page=5#_Toc512863430',
        })

      // Member name, address, licence & page number (right)
      const memberName = `${member.firstName} ${member.lastName}`
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(memberName, MARGIN, y + 6, { align: 'right', width: contentW })
      if (!member.licenceId) {
        member.licenceId = 'UNKNOWN'
      }
      doc
        .fontSize(7)
        .font('Helvetica')
        .text(`Licence: ${member.licenceId}`, MARGIN, y + 24, { align: 'right', width: contentW })
      doc
        .fontSize(7)
        .font('Helvetica')
        .text(`Page ${pageIndex} of ${totalPages}`, MARGIN, y + 33, {
          align: 'right',
          width: contentW,
        })

      if (member.streetAddress) {
        doc
          .fontSize(7)
          .font('Helvetica')
          .text(member.streetAddress, MARGIN - 120, y + 6, { align: 'right', width: contentW })
      }
      if (member.townCity) {
        doc
          .fontSize(7)
          .font('Helvetica')
          .text(member.townCity, MARGIN - 120, y + 15, { align: 'right', width: contentW })
      }
      if (member.postcode) {
        doc
          .fontSize(7)
          .font('Helvetica')
          .text(member.postcode, MARGIN - 120, y + 24, { align: 'right', width: contentW })
      }

      // Separator line
      const sepY = y + INFO_HEADER_H - 2
      doc
        .moveTo(MARGIN, sepY)
        .lineTo(MARGIN + contentW, sepY)
        .lineWidth(0.5)
        .strokeColor('#cccccc')
        .stroke()

      y += INFO_HEADER_H

      // Column headers
      drawTableHeaders(doc, cols, MARGIN, y)
      y += HEADER_H

      const pageTotal = zeroTotals()

      for (const log of pageRows) {
        const isPIC = log.picRole === 'PIC' || log.picRole === 'FI'
        const isDual = log.picRole === 'STU'
        const isInstructor = log.picRole === 'FI' || log.picRole === 'FE'
        const et = entryTotals(log)
        Object.assign(pageTotal, addTotals(pageTotal, et))

        const values: (string | number)[] = [
          dayjs.utc(log.offBlockTimeUtc).format('DD/MM/YY'),
          log.departureAirport,
          dayjs.utc(log.offBlockTimeUtc).format('HH:mm'),
          log.arrivalAirport,
          dayjs.utc(log.onBlockTimeUtc).format('HH:mm'),
          log.aircraftModel ?? '',
          log.aircraftRegistration,
          'X', // SE — all MIK aircraft are single-engine
          '', // ME
          log.picLastName,
          log.flightTime,
          minsToHHMM(log.nightFlyingMins),
          minsToHHMM(log.instrumentFlyingMins),
          isPIC ? log.flightTime : '',
          '', // Co-Pilot / PICUS
          isDual ? log.flightTime : '',
          isInstructor ? log.flightTime : '',
          log.numberOfLandings - log.numberOfNightLandings,
          log.numberOfNightLandings,
          log.personalRemarks ?? '',
        ]
        drawDataRow(doc, cols, MARGIN, y, values)
        y += ROW_H
      }

      doc.font('Helvetica-Bold')
      doc.fontSize(6)

      // Page total
      drawTotalsRow(doc, cols, MARGIN, y, 'Page Total', pageTotal, true)
      const col = cols[cols.length - 1]
      doc.text('I certify that the entries in this', MARGIN + 713 + 4, y + 4, {
        width: col.width - 4,
        align: col.align ?? 'left',
        height: ROW_H - 4,
        ellipsis: true,
      })
      doc.text('log are true.', MARGIN + 713 + 4, y + 10, {
        width: col.width - 4,
        align: col.align ?? 'left',
        height: ROW_H - 4,
        ellipsis: true,
      })
      y += ROW_H

      // Previous Total (grand total carried forward from previous pages)
      drawTotalsRow(doc, cols, MARGIN, y, 'Previous Total', grandTotal)
      y += ROW_H

      grandTotal = addTotals(grandTotal, pageTotal)

      // Total Time (grand total so far) — Remarks cell used as signature line
      drawTotalsRow(doc, cols, MARGIN, y, 'Total Time', grandTotal)
      doc.text('_________________________', MARGIN + 713 + 2, y + 4, {
        width: col.width - 4,
        align: col.align ?? 'left',
        height: ROW_H - 4,
        ellipsis: true,
      })
      doc.text('Pilot signature', MARGIN + 713 + 4, y + 10, {
        width: col.width - 4,
        align: col.align ?? 'left',
        height: ROW_H - 4,
        ellipsis: true,
      })

      doc.font('Helvetica')
    }

    doc.end()
  }) // end Promise
}
