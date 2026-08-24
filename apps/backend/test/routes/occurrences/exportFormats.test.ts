import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  generateOccurrenceRegistryPdf,
  getRegistryFilename,
  inRegisterOrder,
  periodLabel,
  registryComments,
  registryRows,
  registryTitle,
  scopeLabel,
  type RegistryRow,
} from '../../../src/routes/occurrences/exportFormats.ts'
import { OccurrenceCategory, OccurrenceStatus, type Occurrence } from '@mik/contracts/occurrences'

// A closed DTO report with the full handling record — the shape the annual
// Traficom attachment is actually made of.
const anOccurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  id: 'SMS9_CLOS',
  status: OccurrenceStatus.CLOSED,
  // 07:20Z is 09:20 in Helsinki summer time, which is what the register prints.
  occurrenceDate: '2026-03-14T07:20:00.000Z',
  reportDate: '2026-03-14T09:00:00.000Z',
  headline: 'Bird strike on final approach',
  location: 'EFNU final approach runway 22',
  description: 'A flock of birds hit the propeller on final approach.',
  categories: [OccurrenceCategory.BIRD, OccurrenceCategory.WILD],
  isWeatherRelevant: true,
  animalNumber: '100+',
  animalSize: 'S',
  animalSpecies: 'Seagull',
  aircraftRegistration: 'OH-STL',
  aircraftTechnicalFault: false,
  arrivalAirport: 'EFNU',
  departureAirport: 'EFNU',
  isDtoReport: true,
  linkedReportId: 'SMS9_RECE',
  access: [],
  comments: [
    { at: '2026-03-14T09:00:00.000Z', by: 'Author', status: OccurrenceStatus.NEW, comment: null },
    {
      at: '2026-03-16T09:00:00.000Z',
      by: 'Virtanen',
      status: null,
      comment: 'Propeller inspected, no damage found.',
    },
  ],
  handling: {
    processed: {
      adversity: 4,
      probability: 3,
      forwardedToTraficom: true,
      at: '2026-03-15T09:00:00.000Z',
      by: 'Virtanen',
    },
    closed: {
      adversity: 2,
      probability: 2,
      mitigatingAction: 'Bird scaring routine added to the morning checklist.',
      at: '2026-03-20T09:00:00.000Z',
      by: 'Virtanen',
    },
  },
  attachments: [],
  createdAt: '2026-03-14T09:00:00.000Z',
  createdBy: '-',
  updatedAt: '2026-03-20T09:00:00.000Z',
  updatedBy: 'Virtanen',
  ...overrides,
})

const fieldValue = (rows: RegistryRow[], label: string): string | undefined => {
  const row = rows.find((r) => r.kind === 'field' && r.label === label)
  return row?.kind === 'field' ? row.value : undefined
}

const narrativeText = (rows: RegistryRow[], label: string): string | undefined => {
  const row = rows.find((r) => r.kind === 'narrative' && r.label === label)
  return row?.kind === 'narrative' ? row.text : undefined
}

const labels = (rows: RegistryRow[]) =>
  rows.flatMap((r) => (r.kind === 'field' || r.kind === 'narrative' ? [r.label] : []))

describe('occurrence register content', () => {
  it('prints every field the annual report asks for', () => {
    const rows = registryRows(anOccurrence())

    expect(labels(rows)).toEqual([
      'Date of occurrence',
      'Category(ies)',
      'Aircraft',
      'Location',
      'DTO training flight',
      'Forwarded to Traficom',
      'Description of occurrence',
      'Risk assessment',
      'After mitigation',
      'Mitigating actions taken',
      'Comments',
    ])
  })

  it('states the occurrence date in club local time, not UTC', () => {
    expect(fieldValue(registryRows(anOccurrence()), 'Date of occurrence')).toEqual(
      '2026-03-14 09:20 (Europe/Helsinki)',
    )
  })

  it('names every category rather than printing bare ICAO codes', () => {
    expect(fieldValue(registryRows(anOccurrence()), 'Category(ies)')).toEqual(
      'BIRD — Birdstrike\nWILD — Collision with wildlife',
    )
  })

  it('says an occurrence had no aircraft rather than leaving the field blank', () => {
    expect(
      fieldValue(registryRows(anOccurrence({ aircraftRegistration: null })), 'Aircraft'),
    ).toEqual('Not aircraft related')
  })

  it('records the Traficom forwarding decision as YES or NO', () => {
    expect(fieldValue(registryRows(anOccurrence()), 'Forwarded to Traficom')).toEqual('YES')

    const notForwarded = anOccurrence({
      handling: { processed: { adversity: 2, probability: 2, forwardedToTraficom: false } },
    })
    expect(fieldValue(registryRows(notForwarded), 'Forwarded to Traficom')).toEqual('NO')
  })

  // An anonymized-but-unprocessed report is in the register (the safety manager
  // has access to it) but nobody has answered the Traficom question yet, and
  // printing "NO" in an authority attachment would answer it for them.
  it('does not answer the Traficom question for a report nobody has processed', () => {
    const rows = registryRows(anOccurrence({ status: OccurrenceStatus.ANONYMIZED, handling: {} }))

    expect(fieldValue(rows, 'Forwarded to Traficom')).toEqual('Not yet assessed')
    expect(fieldValue(rows, 'Risk assessment')).toEqual('Not yet processed by the safety manager')
    expect(fieldValue(rows, 'After mitigation')).toEqual('Report not yet closed')
  })

  it('attributes each risk assessment to whoever made it, and when', () => {
    const rows = registryRows(anOccurrence())

    expect(fieldValue(rows, 'Risk assessment')).toEqual(
      'Adversity 4, probability 3 — Virtanen, 2026-03-15',
    )
    expect(fieldValue(rows, 'After mitigation')).toEqual(
      'Adversity 2, probability 2 — Virtanen, 2026-03-20',
    )
  })

  // Ratings written before the by/at fields were recorded still have to print.
  it('prints a rating that carries no assessor or date', () => {
    const rows = registryRows(
      anOccurrence({
        handling: { processed: { adversity: 5, probability: 1, forwardedToTraficom: true } },
      }),
    )

    expect(fieldValue(rows, 'Risk assessment')).toEqual('Adversity 5, probability 1')
  })

  it('omits the mitigating action row for a report that has none', () => {
    const rows = registryRows(anOccurrence({ status: OccurrenceStatus.PROCESSED, handling: {} }))

    expect(labels(rows)).not.toContain('Mitigating actions taken')
  })

  it('prints the whole comment thread, oldest first', () => {
    const rows = registryRows(
      anOccurrence({
        comments: [
          {
            at: '2026-03-16T09:00:00.000Z',
            by: 'Virtanen',
            status: null,
            comment: 'Propeller inspected.',
          },
          {
            at: '2026-03-18T09:00:00.000Z',
            by: 'Nieminen',
            status: null,
            comment: 'Checklist updated.',
          },
        ],
      }),
    )

    expect(narrativeText(rows, 'Comments')).toEqual(
      '2026-03-16  Virtanen: Propeller inspected.\n2026-03-18  Nieminen: Checklist updated.',
    )
  })

  it('says so explicitly when a report was never commented on', () => {
    const rows = registryRows(anOccurrence({ comments: [] }))

    expect(fieldValue(rows, 'Comments')).toEqual('None')
  })
})

describe('registryComments', () => {
  // The issue asks for the comment thread but explicitly not the status history,
  // and a status change is stored as a comment row with no text.
  it('drops the status-change rows and keeps the real comments', () => {
    const occurrence = anOccurrence({
      comments: [
        {
          at: '2026-03-14T09:00:00.000Z',
          by: 'Author',
          status: OccurrenceStatus.NEW,
          comment: null,
        },
        {
          at: '2026-03-15T09:00:00.000Z',
          by: 'Lahtinen',
          status: OccurrenceStatus.ANONYMIZED,
          comment: null,
        },
        {
          at: '2026-03-16T09:00:00.000Z',
          by: 'Virtanen',
          status: null,
          comment: 'Propeller inspected.',
        },
      ],
    })

    expect(registryComments(occurrence).map((c) => c.comment)).toEqual(['Propeller inspected.'])
  })

  // A transition can carry a comment of its own; that is a real comment.
  it('keeps a comment written alongside a status change', () => {
    const occurrence = anOccurrence({
      comments: [
        {
          at: '2026-03-15T09:00:00.000Z',
          by: 'Lahtinen',
          status: OccurrenceStatus.ANONYMIZED,
          comment: 'Names and registration removed.',
        },
      ],
    })

    expect(registryComments(occurrence).map((c) => c.comment)).toEqual([
      'Names and registration removed.',
    ])
  })
})

describe('register header and filename', () => {
  it('names the file after the period and scope it covers', () => {
    expect(
      getRegistryFilename({
        fromDate: '2026-01-01T00:00:00.000Z',
        toDate: '2026-12-31T21:59:59.000Z',
      }),
    ).toEqual('occurrence-register_2026-01-01_2026-12-31.pdf')

    expect(getRegistryFilename({ fromDate: '2026-01-01T00:00:00.000Z', dtoOnly: true })).toEqual(
      'occurrence-register_2026-01-01_dto.pdf',
    )

    expect(getRegistryFilename({})).toEqual('occurrence-register.pdf')
  })

  it('spells out a one-sided or absent period rather than printing a blank range', () => {
    expect(
      periodLabel({ fromDate: '2026-01-01T00:00:00.000Z', toDate: '2026-06-30T20:59:59.000Z' }),
    ).toEqual('2026-01-01 – 2026-06-30')
    expect(periodLabel({ fromDate: '2026-01-01T00:00:00.000Z' })).toEqual('from 2026-01-01')
    expect(periodLabel({ toDate: '2026-06-30T20:59:59.000Z' })).toEqual('until 2026-06-30')
    expect(periodLabel({})).toEqual('all reported occurrences')
  })

  // The reader of a printed register cannot re-check the filters, so the page
  // has to say whether it is the DTO subset or everything.
  it('states the scope on the page', () => {
    expect(scopeLabel({ dtoOnly: true })).toEqual('Scope: DTO training reports only')
    expect(scopeLabel({ dtoOnly: false })).toEqual('Scope: all occurrence reports')
    expect(scopeLabel({})).toEqual('Scope: all occurrence reports')
  })
})

describe('register blocks', () => {
  it('numbers each block and stamps it with the report id and status', () => {
    expect(registryTitle(anOccurrence(), 0)).toEqual({
      heading: '1. Bird strike on final approach',
      stamp: 'SMS9_CLOS — Closed',
    })
    expect(
      registryTitle(anOccurrence({ id: 'SMS8_ANON', status: OccurrenceStatus.ANONYMIZED }), 6)
        .stamp,
    ).toEqual('SMS8_ANON — Awaiting processing')
  })

  // The query orders by report id, which is its DISTINCT ON key rather than a
  // choice, so the register does its own ordering.
  it('reads oldest occurrence first', () => {
    const ordered = inRegisterOrder([
      anOccurrence({ id: 'SMS3', occurrenceDate: '2026-06-11T05:40:00.000Z' }),
      anOccurrence({ id: 'SMS1', occurrenceDate: '2026-03-14T07:20:00.000Z' }),
      anOccurrence({ id: 'SMS2', occurrenceDate: '2026-05-02T11:05:00.000Z' }),
    ])

    expect(ordered.map((o) => o.id)).toEqual(['SMS1', 'SMS2', 'SMS3'])
  })

  it('leaves the caller’s array alone', () => {
    const unsorted = [
      anOccurrence({ id: 'SMS2', occurrenceDate: '2026-05-02T11:05:00.000Z' }),
      anOccurrence({ id: 'SMS1', occurrenceDate: '2026-03-14T07:20:00.000Z' }),
    ]

    inRegisterOrder(unsorted)

    expect(unsorted.map((o) => o.id)).toEqual(['SMS2', 'SMS1'])
  })
})

describe('label catalogues', () => {
  // The Record type makes a missing key a compile error; these guard against a
  // key present but empty, which it cannot see.
  it('names every occurrence category and status', () => {
    for (const category of Object.values(OccurrenceCategory)) {
      expect(CATEGORY_LABELS[category]).toBeTruthy()
    }
    for (const status of Object.values(OccurrenceStatus)) {
      expect(STATUS_LABELS[status]).toBeTruthy()
    }
  })
})

/**
 * pdfkit deflates its content streams, so the text is not readable back out of
 * the buffer — the content assertions live on `registryRows` above. What is
 * checkable here is that a document is produced at all and that it paginates,
 * which is where the manual cursor arithmetic could go wrong.
 */
const pageCount = (pdf: Buffer): number => {
  const raw = pdf.toString('latin1')
  const pages = raw.split('/Type /Page').length - 1
  const pageTrees = raw.split('/Type /Pages').length - 1
  return pages - pageTrees
}

describe('occurrence register PDF', () => {
  const filters = { fromDate: '2026-01-01T00:00:00.000Z', toDate: '2026-12-31T21:59:59.000Z' }
  const generatedAt = new Date('2026-08-20T09:00:00.000Z')

  it('renders a single-page PDF for a handful of occurrences', async () => {
    const pdf = await generateOccurrenceRegistryPdf(
      [anOccurrence(), anOccurrence({ id: 'SMS8_PROC' })],
      filters,
      generatedAt,
    )

    expect(pdf.subarray(0, 5).toString()).toEqual('%PDF-')
    expect(pageCount(pdf)).toEqual(1)
  })

  // The register is still a valid attachment when a period had no occurrences,
  // and an empty file would look like a failed export.
  it('renders a page saying so when nothing matched the filters', async () => {
    const pdf = await generateOccurrenceRegistryPdf([], filters, generatedAt)

    expect(pdf.subarray(0, 5).toString()).toEqual('%PDF-')
    expect(pageCount(pdf)).toEqual(1)
  })

  it('paginates a register too long for one page', async () => {
    const many = Array.from({ length: 12 }, (_, i) => anOccurrence({ id: `SMS${i}_CLOS` }))

    expect(
      pageCount(await generateOccurrenceRegistryPdf(many, filters, generatedAt)),
    ).toBeGreaterThan(1)
  })

  // A single comment thread can outrun a page on its own, which is the case the
  // manual page-break checks cannot handle and pdfkit's own flow has to.
  it('paginates within one occurrence whose comment thread fills pages', async () => {
    const wordy = anOccurrence({
      comments: Array.from({ length: 6 }, (_, i) => ({
        at: `2026-03-1${i + 1}T09:00:00.000Z`,
        by: 'Virtanen',
        status: null,
        comment: `${'Follow-up action recorded by the safety manager. '.repeat(40)}${i}`,
      })),
    })

    expect(
      pageCount(await generateOccurrenceRegistryPdf([wordy], filters, generatedAt)),
    ).toBeGreaterThan(1)
  })
})
