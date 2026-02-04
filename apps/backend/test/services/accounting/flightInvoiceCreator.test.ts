import { jest } from '@jest/globals'
import {
  FlightLogStatus,
  FlightType,
  type InvoicableFlight,
} from '../../../src/routes/flight-log/models.ts'
import { db } from '../../../src/db/connection.ts'
import { RecurringFeeType, MIKInvoiceType } from '../../../src/services/simplbooks/models.ts'
import { ART_EQUIP_USAGE_FEE_CODE } from '../../../src/services/accounting/config.ts'

// Mock dependencies
jest.unstable_mockModule('../../../src/db/aircraft-pricing-queries.ts', () => ({
  getAircraftPriceForDate: jest.fn(),
}))

const { getAircraftPriceForDate } = await import('../../../src/db/aircraft-pricing-queries.ts')
const { createFlightInvoicePayload } = await import(
  '../../../src/services/accounting/flightInvoiceCreator.ts'
)

describe('Flight Invoice Creator - Equipment Usage Fee Logic', () => {
  const testMemberId = 'Matti1'
  const testBillingId = '123456'
  const year2025 = 2025
  const year2026 = 2026
  let createdInvoiceIds: string[] = []
  let equipmentFeeArticleId: number
  const testArticleIds = [9999, 9998] // IDs for test articles

  beforeAll(async () => {
    // Insert equipment usage fee article
    await db
      .insertInto('accts.items')
      .values({
        id: testArticleIds[0],
        code: ART_EQUIP_USAGE_FEE_CODE,
        name: 'Kalustomaksun Käyttömaksu',
        item: {
          id: testArticleIds[0],
          code: ART_EQUIP_USAGE_FEE_CODE,
          name: 'Kalustomaksun Käyttömaksu',
          unit: 'min',
          markup_value: 0.15,
          active: true,
          amount: 1,
          ean: '',
          contents:
            'Kalustomaksu maksettu erikseen per vuosi, mutta sen sijasta maksetaan käyttömaksu lentomäärän mukaan',
          price_per_unit: 0.15,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()

    equipmentFeeArticleId = testArticleIds[0]

    // Insert aircraft article for OH-ABC
    await db
      .insertInto('accts.items')
      .values({
        id: testArticleIds[1],
        code: 'OH-ABC',
        name: 'Test Aircraft OH-ABC',
        item: {
          id: testArticleIds[1],
          code: 'OH-ABC',
          name: 'Test Aircraft OH-ABC',
          unit: 'min',
          markup_value: 2.5,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Test aircraft',
          price_per_unit: 2.5,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()

    // Mock aircraft pricing
    const mockedGetAircraftPriceForDate = jest.mocked(getAircraftPriceForDate)
    mockedGetAircraftPriceForDate.mockResolvedValue(2.5) // €2.50 per minute
  })

  afterAll(async () => {
    // Clean up test articles
    await db.deleteFrom('accts.items').where('id', 'in', testArticleIds).execute()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    createdInvoiceIds = []
  })

  afterEach(async () => {
    // Clean up test data
    for (const invoiceId of createdInvoiceIds) {
      await db
        .deleteFrom('member.annual_fees')
        .where('invoice_id', '=', Number(invoiceId))
        .execute()
      await db.deleteFrom('accts.invoice').where('id', '=', invoiceId).execute()
    }
  })

  const createTestFlight = (overrides?: Partial<InvoicableFlight>): InvoicableFlight => ({
    flightId: '1',
    aircraftRegistration: 'OH-ABC',
    departureAirport: 'EFHK',
    arrivalAirport: 'EFTU',
    takeoffTimeUtc: new Date(`${year2025}-06-15T08:00:00Z`).toUTCString(),
    landingTimeUtc: new Date(`${year2025}-06-15T09:30:00Z`).toUTCString(),
    flightTime: '01:30',
    flightMins: 90,
    blockMins: 95,
    blockTime: '01:35',
    flightType: FlightType.DTO,
    isBillableFlight: true,
    billableMemberId: testMemberId,
    billableMemberLastName: 'Pilot',
    billingId: testBillingId,
    isTrainingProgramPilot: false,
    picLastName: 'Instructor',
    status: FlightLogStatus.VALIDATED,
    fuelUpliftLitres: null,
    numberOfLandings: 1,
    personsOnBoard: 2,
    billingRemarks: null,
    ...overrides,
  })

  const createEquipmentFeeRequest = async (year: number, memberId: string): Promise<string> => {
    // Use test invoice IDs in the 999900-999999 range (bigint stored as string)
    const invoiceId: number = 9999 + createdInvoiceIds.length

    await db
      .insertInto('accts.invoice')
      .values({
        id: invoiceId,
        member_id: memberId,
        invoice_type: MIKInvoiceType.EQUIPMENT_FEE,
        description: `Test equipment fee invoice ${year}`,
        pmt_ref: `TSTEQ${year}`,
        paid_at: null,
        due_at: new Date().toISOString(),
        sent_at: null,
        currency: 'EUR',
        total_sum: '135.00',
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .execute()

    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: memberId,
        year: year,
        fee_type: RecurringFeeType.EQUIPMENT_FEE,
        invoice_id: invoiceId,
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .execute()

    createdInvoiceIds.push(invoiceId.toString())
    return invoiceId.toString()
  }

  describe('Equipment usage fee application logic', () => {
    it('should add equipment usage fee when member has NOT requested equipment fee for the year', async () => {
      const flight = createTestFlight()
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)

      // First task is the flight
      expect(invoice.Tasks[0].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[0].Task.amount).toBe(90)
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(2.5)

      // Second task is the equipment usage fee
      expect(invoice.Tasks[1].Task.code).toBe(ART_EQUIP_USAGE_FEE_CODE)
      expect(invoice.Tasks[1].Task.amount).toBe(90)
      expect(invoice.Tasks[1].Task.article_id).toBe(equipmentFeeArticleId)
    })

    it('should NOT add equipment usage fee when member HAS requested equipment fee for the year', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)

      const flight = createTestFlight()
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(1)

      // Only the flight task, no equipment usage fee
      expect(invoice.Tasks[0].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[0].Task.amount).toBe(90)
    })

    it('should handle multiple flights in the same year with equipment fee requested', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)

      const flight1 = createTestFlight({ flightId: '1', flightMins: 60, blockMins: 65 })
      const flight2 = createTestFlight({ flightId: '2', flightMins: 45, blockMins: 50 })
      const payload = { flights: [flight1, flight2] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Only 2 flight tasks, no equipment usage fees
      expect(invoice.Tasks).toHaveLength(2)
      expect(invoice.Tasks[0].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[0].Task.amount).toBe(60)
      expect(invoice.Tasks[1].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[1].Task.amount).toBe(45)
    })

    it('should handle multiple flights in the same year without equipment fee requested', async () => {
      const flight1 = createTestFlight({ flightId: '1', flightMins: 60, blockMins: 65 })
      const flight2 = createTestFlight({ flightId: '2', flightMins: 45, blockMins: 50 })
      const payload = { flights: [flight1, flight2] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // 2 flight tasks + 2 equipment usage fee tasks
      expect(invoice.Tasks).toHaveLength(4)
      expect(invoice.Tasks[0].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[0].Task.amount).toBe(60)
      expect(invoice.Tasks[1].Task.code).toBe(ART_EQUIP_USAGE_FEE_CODE)
      expect(invoice.Tasks[1].Task.amount).toBe(60)
      expect(invoice.Tasks[2].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[2].Task.amount).toBe(45)
      expect(invoice.Tasks[3].Task.code).toBe(ART_EQUIP_USAGE_FEE_CODE)
      expect(invoice.Tasks[3].Task.amount).toBe(45)
    })

    it('should handle flights across different years with different equipment fee request statuses', async () => {
      // Member has requested equipment fee for 2025 but not 2026
      await createEquipmentFeeRequest(year2025, testMemberId)

      const flight2025 = createTestFlight({
        flightId: '1',
        takeoffTimeUtc: new Date(`${year2025}-06-15T08:00:00Z`).toUTCString(),
        landingTimeUtc: new Date(`${year2025}-06-15T09:30:00Z`).toUTCString(),
        flightMins: 60,
        blockMins: 65,
      })
      const flight2026 = createTestFlight({
        flightId: '2',
        takeoffTimeUtc: new Date(`${year2026}-03-20T10:00:00Z`).toUTCString(),
        landingTimeUtc: new Date(`${year2026}-03-20T11:15:00Z`).toUTCString(),
        flightMins: 75,
        blockMins: 80,
      })
      const payload = { flights: [flight2025, flight2026] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // 2 flight tasks + 1 equipment usage fee (only for 2026 flight)
      expect(invoice.Tasks).toHaveLength(3)

      // 2025 flight - no equipment fee
      expect(invoice.Tasks[0].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[0].Task.amount).toBe(60)

      // 2026 flight - with equipment fee
      expect(invoice.Tasks[1].Task.code).toBe('OH-ABC')
      expect(invoice.Tasks[1].Task.amount).toBe(75)
      expect(invoice.Tasks[2].Task.code).toBe(ART_EQUIP_USAGE_FEE_CODE)
      expect(invoice.Tasks[2].Task.amount).toBe(75)
    })

    it('should use block time for training program pilots', async () => {
      const flight = createTestFlight({
        isTrainingProgramPilot: true,
        flightMins: 90,
        blockMins: 100,
      })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)

      // Both flight and equipment fee should use block time (100 mins)
      expect(invoice.Tasks[0].Task.amount).toBe(100)
      expect(invoice.Tasks[1].Task.amount).toBe(100)
    })

    it('should include kalustonkaytto remarks when fee is applied', async () => {
      const flight = createTestFlight()
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Should have additional info with kalustonkaytto fee description
      expect(invoice.Invoice.additional_info).toBeTruthy()
      expect(invoice.Invoice.additional_info).toContain('Kalustomaksu')
    })

    it('should NOT include kalustonkaytto remarks when fee is not applied', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)

      const flight = createTestFlight()
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Should not have kalustonkaytto fee description
      expect(invoice.Invoice.additional_info).toBe('')
    })
  })
})
