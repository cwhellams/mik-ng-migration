import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import {
  OccurrenceCategory,
  OccurrenceStatus,
  type Occurrence,
  type OccurrenceRegistryFilters,
} from '@mik/contracts/occurrences'
import { HELSINKI_TIMEZONE, toHelsinki } from '@mik/contracts/date'

/**
 * The printable occurrence register (#519).
 *
 * Traficom's annual activity report for a training organisation wants every
 * reported occurrence together with how it was handled, as a signed paper
 * attachment substituting page 6 of form LU3172 — so this is a document, not an
 * API feed. It is laid out as one form-style block per occurrence rather than as
 * a table: the fields the authority asks for are mostly narrative (the processed
 * description, the mitigating action, the comment thread) and would be unreadable
 * squeezed into grid cells, unlike the flight-log EASA export next door.
 *
 * `registryRows` is what the register *says*; everything below it is how that
 * gets painted. Keeping the two apart is what makes the content assertable —
 * pdfkit deflates its content streams, so nothing in the finished PDF can be
 * read back without a parser.
 *
 * Labels are English, as in the flight-log export. The register is produced
 * server-side and the backend has no UI-language plumbing outside email
 * templates.
 */

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * `Record` over the enum on purpose: adding a category to `OccurrenceCategory`
 * without naming it here is a compile error rather than a bare code in an
 * authority attachment.
 */
export const CATEGORY_LABELS: Record<OccurrenceCategory, string> = {
  ADRM: 'Aerodrome',
  AMAN: 'Abrupt manoeuvre',
  ARC: 'Abnormal runway contact',
  ATM: 'ATM/CNS',
  BIRD: 'Birdstrike',
  CABIN: 'Cabin safety events',
  CFIT: 'Controlled flight into or toward terrain',
  CTOL: 'Collision with obstacle(s) during take-off and landing',
  EVAC: 'Evacuation',
  'F-NI': 'Fire/smoke (non-impact)',
  'F-POST': 'Fire/smoke (post-impact)',
  FUEL: 'Fuel related',
  GCOL: 'Ground collision',
  GTOW: 'Glider towing related events',
  ICE: 'Icing',
  LALT: 'Low altitude operations',
  'LOC-G': 'Loss of control - ground',
  'LOC-I': 'Loss of control - inflight',
  LOLI: 'Loss of lifting conditions en-route',
  MAC: 'Airprox/ACAS alert/loss of separation/(near) midair collision',
  RAMP: 'Ground handling',
  RE: 'Runway excursion',
  RI: 'Runway incursion - vehicle, aircraft or person',
  'RI-O': 'Runway incursion - other',
  'RI-VA': 'Runway incursion - vehicle or aircraft',
  'SCF-NP': 'System/component failure or malfunction (non-powerplant)',
  'SCF-PP': 'Powerplant failure or malfunction',
  SEC: 'Security related',
  TURB: 'Turbulence encounter',
  UIMC: 'Unintended flight in IMC',
  USOS: 'Undershoot/overshoot',
  WILD: 'Collision with wildlife',
  WSTRW: 'Windshear or thunderstorm',
  OTHR: 'Other',
  UNK: 'Unknown or undetermined',
}

export const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  NEW: 'New',
  RECEIVED: 'Received',
  ANONYMIZING: 'Under review',
  ANONYMIZED: 'Awaiting processing',
  PROCESSED: 'Processed',
  CLOSED: 'Closed',
  DELETED: 'Deleted',
}

/** Club wall-clock time — see `HELSINKI_TIMEZONE`; every date in the print is local. */
const dateTime = (iso: string): string => toHelsinki(iso).format('YYYY-MM-DD HH:mm')
const date = (iso: string): string => toHelsinki(iso).format('YYYY-MM-DD')

/** `Adversity 4, probability 2 — Virtanen, 2026-03-15`, with whatever parts exist. */
const riskLine = (rating: {
  adversity: number
  probability: number
  by?: string
  at?: string
}): string => {
  const rated = `Adversity ${rating.adversity}, probability ${rating.probability}`
  const assessed = [rating.by, rating.at ? date(rating.at) : undefined].filter(Boolean).join(', ')
  return assessed ? `${rated} — ${assessed}` : rated
}

/**
 * The comment thread minus the pure status-change rows: those carry a `status`
 * and no text, and the issue explicitly does not want the status history in the
 * print. A row with both is a real comment that happened to accompany a
 * transition, so it stays.
 */
export const registryComments = (occurrence: Occurrence) =>
  occurrence.comments.filter((c) => !!c.comment)

export type RegistryRow =
  /** `Label   value` on one line; the value is short by construction. */
  | { kind: 'field'; label: string; value: string; indent?: number }
  /** A label followed by a paragraph that may be arbitrarily long. */
  | { kind: 'narrative'; label: string; text: string; indent?: number }
  | { kind: 'heading'; label: string }
  | { kind: 'gap' }

/**
 * Everything the register states about one occurrence, in print order.
 *
 * The fields come from the issue's list. Headline, location and status are not
 * on that list but are on the record and on the screen the safety manager reads,
 * and a register of unnamed events is hard to check against anything.
 */
export const registryRows = (occurrence: Occurrence): RegistryRow[] => {
  const { processed, closed } = occurrence.handling
  const comments = registryComments(occurrence)

  return [
    {
      kind: 'field',
      label: 'Date of occurrence',
      value: `${dateTime(occurrence.occurrenceDate)} (${HELSINKI_TIMEZONE})`,
    },
    {
      kind: 'field',
      label: 'Category(ies)',
      value: occurrence.categories.map((c) => `${c} — ${CATEGORY_LABELS[c] ?? c}`).join('\n'),
    },
    {
      kind: 'field',
      label: 'Aircraft',
      value: occurrence.aircraftRegistration ?? 'Not aircraft related',
    },
    { kind: 'field', label: 'Location', value: occurrence.location },
    { kind: 'field', label: 'DTO training flight', value: occurrence.isDtoReport ? 'Yes' : 'No' },
    {
      kind: 'field',
      label: 'Forwarded to Traficom',
      // A report the safety manager has not processed yet has no answer to this
      // question, and printing "NO" would state one.
      value: processed ? (processed.forwardedToTraficom ? 'YES' : 'NO') : 'Not yet assessed',
    },
    { kind: 'gap' },
    { kind: 'narrative', label: 'Description of occurrence', text: occurrence.description },
    { kind: 'heading', label: 'Handling of the report (Safety Management System)' },
    {
      kind: 'field',
      label: 'Risk assessment',
      value: processed ? riskLine(processed) : 'Not yet processed by the safety manager',
      indent: 8,
    },
    {
      kind: 'field',
      label: 'After mitigation',
      value: closed ? riskLine(closed) : 'Report not yet closed',
      indent: 8,
    },
    ...(closed?.mitigatingAction
      ? [
          {
            kind: 'narrative' as const,
            label: 'Mitigating actions taken',
            text: closed.mitigatingAction,
            indent: 8,
          },
        ]
      : []),
    { kind: 'gap' },
    comments.length > 0
      ? {
          kind: 'narrative',
          label: 'Comments',
          text: comments.map((c) => `${date(c.at)}  ${c.by}: ${c.comment}`).join('\n'),
        }
      : { kind: 'field', label: 'Comments', value: 'None' },
  ]
}

/**
 * The heading of one register block. The report id and a readable status are on
 * it because an authority attachment has to be checkable against the system it
 * came from, and a register listing an unprocessed report alongside a closed one
 * has to say which is which.
 */
export const registryTitle = (
  occurrence: Occurrence,
  index: number,
): { heading: string; stamp: string } => ({
  heading: `${index + 1}. ${occurrence.headline}`,
  stamp: `${occurrence.id} — ${STATUS_LABELS[occurrence.status]}`,
})

/** A register reads oldest first, whatever order the query returned. */
export const inRegisterOrder = (occurrences: Occurrence[]): Occurrence[] =>
  [...occurrences].sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))

/** `occurrence-register_2026-01-01_2026-12-31_dto.pdf` */
export function getRegistryFilename(filters: OccurrenceRegistryFilters): string {
  const parts = ['occurrence-register']
  if (filters.fromDate) parts.push(date(filters.fromDate))
  if (filters.toDate) parts.push(date(filters.toDate))
  if (filters.dtoOnly) parts.push('dto')
  return `${parts.join('_')}.pdf`
}

export const periodLabel = (filters: OccurrenceRegistryFilters): string => {
  if (filters.fromDate && filters.toDate) {
    return `${date(filters.fromDate)} – ${date(filters.toDate)}`
  }
  if (filters.fromDate) return `from ${date(filters.fromDate)}`
  if (filters.toDate) return `until ${date(filters.toDate)}`
  return 'all reported occurrences'
}

export const scopeLabel = (filters: OccurrenceRegistryFilters): string =>
  filters.dtoOnly ? 'Scope: DTO training reports only' : 'Scope: all occurrence reports'

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const LOGO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/mik-logo-blue.png',
)

/**
 * A pdfkit document, named without writing out the ambient `PDFKit` namespace —
 * which `no-undef` cannot see and reports as an undefined global, as it does on
 * the flight-log export next door.
 */
type PdfDoc = InstanceType<typeof PDFDocument>

// A4 portrait, in points.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 40
/** Reserved band at the top of every page for the club/report header. */
const HEADER_H = 62
/** Reserved band at the bottom of every page for the page number. */
const FOOTER_H = 26

const CONTENT_W = PAGE_W - 2 * MARGIN
const LABEL_W = 128
const VALUE_X = MARGIN + LABEL_W
const VALUE_W = CONTENT_W - LABEL_W
/** Width of the right-hand `<id> — <status>` stamp on a block title. */
const STAMP_W = 140

const BODY_SIZE = 9
const LINE_GAP = 1

/** A block title stranded alone at the foot of a page reads as a lost record. */
const MIN_BLOCK_LEAD = 90
/** Room for a narrative's label plus a couple of lines of its text. */
const MIN_NARRATIVE_LEAD = 34

const bodyBottom = () => PAGE_H - MARGIN - FOOTER_H

/** Start a page unless `needed` points still fit below the cursor. */
const ensureSpace = (doc: PdfDoc, needed: number) => {
  if (doc.y + needed > bodyBottom()) doc.addPage()
}

const drawPageHeader = (doc: PdfDoc, filters: OccurrenceRegistryFilters) => {
  // The header is painted into the reserved top margin, so the flowing body text
  // must find `doc.y`/`doc.x` exactly as it left them.
  const savedX = doc.x
  const savedY = doc.y

  const top = MARGIN
  doc.image(LOGO_PATH, MARGIN, top, { height: 30 })
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('Malmin Ilmailukerho Ry', MARGIN + 66, top + 2, { width: 260, lineBreak: false })
  doc
    .fontSize(7)
    .font('Helvetica')
    .text('mik.fi', MARGIN + 66, top + 17, {
      width: 260,
      lineBreak: false,
      link: 'https://mik.fi/',
      underline: true,
    })

  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('OCCURRENCE REGISTER', MARGIN, top, { width: CONTENT_W, align: 'right' })
  doc
    .fontSize(8)
    .font('Helvetica')
    .text(`Period: ${periodLabel(filters)}`, MARGIN, top + 17, {
      width: CONTENT_W,
      align: 'right',
    })
    .text(scopeLabel(filters), MARGIN, top + 28, { width: CONTENT_W, align: 'right' })

  const ruleY = MARGIN + HEADER_H - 10
  doc
    .moveTo(MARGIN, ruleY)
    .lineTo(MARGIN + CONTENT_W, ruleY)
    .lineWidth(0.75)
    .strokeColor('#333333')
    .stroke()

  doc.x = savedX
  doc.y = savedY
}

/**
 * `Page 1 of 7` on every page, plus the generation stamp. Written after the body
 * because the total is only known once the last block has flowed; that is what
 * `bufferPages` buys.
 */
const stampFooters = (doc: PdfDoc, generatedAt: Date, occurrenceCount: number) => {
  const { start, count } = doc.bufferedPageRange()

  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i)
    // Writing inside the bottom margin would otherwise flow onto a fresh page.
    doc.page.margins.bottom = 0

    const y = PAGE_H - MARGIN - FOOTER_H + 10
    doc
      .moveTo(MARGIN, y - 4)
      .lineTo(MARGIN + CONTENT_W, y - 4)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke()
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        `Generated ${dateTime(generatedAt.toISOString())} (${HELSINKI_TIMEZONE}) — ${occurrenceCount} occurrence(s)`,
        MARGIN,
        y,
        { width: CONTENT_W / 2, lineBreak: false },
      )
      .text(`Page ${i - start + 1} of ${count}`, MARGIN + CONTENT_W / 2, y, {
        width: CONTENT_W / 2,
        align: 'right',
        lineBreak: false,
      })
      .fillColor('black')
  }
}

/**
 * One `Label   value` row. Both columns start on the same baseline and the row
 * advances by the taller of the two, so a wrapping value cannot overlap the next
 * label.
 */
const drawField = (doc: PdfDoc, label: string, value: string, indent = 0) => {
  doc.fontSize(BODY_SIZE)
  const labelW = LABEL_W - 8 - indent

  // Measure both columns before deciding anything: the page-break check needs the
  // height of the taller one, or a row whose *label* is the tall half starts near
  // the bottom of the page and runs into the footer. `heightOfString` reads the
  // document's current font, so each column is measured in the face it is drawn
  // in — measuring the bold label in the regular face under-reports a wrapped
  // one — and with the same `lineGap` the text is drawn with.
  const labelH = doc
    .font('Helvetica-Bold')
    .heightOfString(label, { width: labelW, lineGap: LINE_GAP })
  const valueH = doc.font('Helvetica').heightOfString(value, { width: VALUE_W, lineGap: LINE_GAP })
  const rowH = Math.max(labelH, valueH)
  ensureSpace(doc, rowH)

  const y = doc.y
  doc.font('Helvetica-Bold').text(label, MARGIN + indent, y, { width: labelW, lineGap: LINE_GAP })
  doc.font('Helvetica').text(value, VALUE_X, y, { width: VALUE_W, lineGap: LINE_GAP })

  doc.x = MARGIN
  doc.y = y + rowH
}

/**
 * A label on its own line followed by a flowed paragraph. Descriptions run to
 * 5000 characters and a comment thread has no bound at all, so these are left to
 * pdfkit's own pagination — the `pageAdded` handler redraws the header on any
 * page it decides to add mid-paragraph.
 */
const drawNarrative = (doc: PdfDoc, label: string, text: string, indent = 0) => {
  doc.fontSize(BODY_SIZE)
  ensureSpace(doc, MIN_NARRATIVE_LEAD)

  doc.font('Helvetica-Bold').text(label, MARGIN + indent, doc.y, { width: CONTENT_W - indent })
  doc.font('Helvetica').text(text, MARGIN + indent + 8, doc.y + 1, {
    width: CONTENT_W - indent - 8,
    lineGap: LINE_GAP,
    align: 'left',
  })
  doc.x = MARGIN
  doc.moveDown(0.3)
}

const drawBlockTitle = (doc: PdfDoc, occurrence: Occurrence, index: number) => {
  const { heading, stamp } = registryTitle(occurrence, index)
  const titleY = doc.y
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(heading, MARGIN, titleY, {
      width: CONTENT_W - STAMP_W,
      lineGap: LINE_GAP,
    })
  const titleH = doc.y - titleY
  doc
    .fontSize(8)
    .font('Helvetica')
    .text(stamp, MARGIN + CONTENT_W - STAMP_W, titleY + 1, {
      width: STAMP_W,
      align: 'right',
      lineBreak: false,
    })

  doc.y = titleY + Math.max(titleH, 12) + 2
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_W, doc.y)
    .lineWidth(0.5)
    .strokeColor('#999999')
    .stroke()
  doc.y += 4
  doc.x = MARGIN
}

const drawOccurrence = (doc: PdfDoc, occurrence: Occurrence, index: number) => {
  ensureSpace(doc, MIN_BLOCK_LEAD)
  drawBlockTitle(doc, occurrence, index)

  for (const row of registryRows(occurrence)) {
    switch (row.kind) {
      case 'field':
        drawField(doc, row.label, row.value, row.indent)
        break
      case 'narrative':
        drawNarrative(doc, row.label, row.text, row.indent)
        break
      case 'heading':
        doc.fontSize(BODY_SIZE)
        ensureSpace(doc, MIN_NARRATIVE_LEAD)
        doc.font('Helvetica-Bold').text(row.label, MARGIN, doc.y, { width: CONTENT_W })
        doc.y += 2
        break
      case 'gap':
        doc.moveDown(0.3)
        break
    }
  }

  doc.moveDown(0.8)
}

/**
 * Renders the register to a PDF buffer. `occurrences` is printed in the order
 * given, so the caller decides the ordering (chronological, for a register).
 */
export function generateOccurrenceRegistryPdf(
  occurrences: Occurrence[],
  filters: OccurrenceRegistryFilters,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      // The first page is added manually so the `pageAdded` handler below is
      // already attached when it happens, and buffering lets the footers be
      // stamped with a page total that is only known at the end.
      autoFirstPage: false,
      bufferPages: true,
      margins: {
        top: MARGIN + HEADER_H,
        bottom: MARGIN + FOOTER_H,
        left: MARGIN,
        right: MARGIN,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.on('pageAdded', () => drawPageHeader(doc, filters))
    doc.addPage()

    if (occurrences.length === 0) {
      doc
        .fontSize(BODY_SIZE)
        .font('Helvetica')
        .text('No occurrence reports in the selected period.', MARGIN, doc.y, { width: CONTENT_W })
    } else {
      occurrences.forEach((occurrence, index) => drawOccurrence(doc, occurrence, index))
    }

    stampFooters(doc, generatedAt, occurrences.length)

    doc.end()
  })
}
