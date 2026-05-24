import { jest } from '@jest/globals'
import {
  FlightLogStatus,
  FlightType,
  type InvoicableFlight,
} from '../../../src/routes/flight-log/models.ts'
import { db } from '../../../src/db/connection.ts'
import { RecurringFeeType, MIKInvoiceType } from '../../../src/services/simplbooks/models.ts'
import {
  ART_ENTRY_ERROR_CODE,
  ART_EQUIP_USAGE_FEE_CODE,
} from '../../../src/services/accounting/config.ts'

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
  let testAircraftRegistration = 'OH-IHQ'
  let createdInvoiceIds: string[] = []
  let createdPrepaidProductIds: string[] = []
  let createdMemberPackageIds: number[] = []
  let equipmentFeeArticleId: number
  const testArticleIds = [9999, 9998, 9997, 9996] // IDs for test articles
  const TEST_PKG_ARTICLE_CODE = 'TEST_PKG_ART'

  beforeAll(async () => {
    // Remove any pre-existing articles with these codes so our test IDs are authoritative
    await db
      .selectFrom('flight.aircraft as a')
      .leftJoin('prepaid.packages as p', 'p.aircraft_registration', 'a.registration')
      .select('a.registration as registration')
      .groupBy('a.registration')
      .having(eb => eb.fn.count('p.product_id'), '=', 0)
      .orderBy('a.registration', 'asc')
      .executeTakeFirstOrThrow()
      .then(row => {
        testAircraftRegistration = row.registration
      })

    await db
      .deleteFrom('accts.items')
      .where('code', 'in', [
        ART_EQUIP_USAGE_FEE_CODE,
        ART_ENTRY_ERROR_CODE,
        testAircraftRegistration,
        TEST_PKG_ARTICLE_CODE,
      ])
      .execute()

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

    // Insert aircraft article for the test aircraft
    await db
      .insertInto('accts.items')
      .values({
        id: testArticleIds[1],
        code: testAircraftRegistration,
        name: `Test Aircraft ${testAircraftRegistration}`,
        item: {
          id: testArticleIds[1],
          code: testAircraftRegistration,
          name: `Test Aircraft ${testAircraftRegistration}`,
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

    // Insert VIRHEMERKINTA (entry error fee) article
    await db
      .insertInto('accts.items')
      .values({
        id: testArticleIds[2],
        code: ART_ENTRY_ERROR_CODE,
        name: 'Virhemerkintämaksu',
        item: {
          id: testArticleIds[2],
          code: ART_ENTRY_ERROR_CODE,
          name: 'Virhemerkintämaksu',
          unit: 'kpl',
          markup_value: 50,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Virhemerkintämaksu',
          price_per_unit: 50,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()

    // Insert dedicated package article (used to test simplbooksItemId path)
    await db
      .insertInto('accts.items')
      .values({
        id: testArticleIds[3],
        code: TEST_PKG_ARTICLE_CODE,
        name: 'Test Package Article',
        item: {
          id: testArticleIds[3],
          code: TEST_PKG_ARTICLE_CODE,
          name: 'Test Package Article',
          unit: 'min',
          markup_value: 1.5,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Dedicated article for prepaid package credit',
          price_per_unit: 1.5,
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

    await db
      .insertInto('shop.categories')
      .values({
        category_id: 'FLT_PKG',
        name: { en: 'Flight packages', fi: 'Lentopaketit', sv: 'Flygpaket' },
        description: null,
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .onConflict(oc => oc.column('category_id').doNothing())
      .execute()
  })

  afterAll(async () => {
    // Clean up test articles
    await db.deleteFrom('accts.items').where('id', 'in', testArticleIds).execute()
    // Restore the original VIRHEMERKINTA row that was deleted in beforeAll
    await db
      .insertInto('accts.items')
      .values({
        id: 22,
        code: ART_ENTRY_ERROR_CODE,
        name: 'Flight log entry error fee',
        item: { amount: 1, price_per_unit: 10, sum_with_vat: 10, markup_value: 10 },
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()
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

    if (createdMemberPackageIds.length > 0) {
      await db
        .deleteFrom('prepaid.usage_log')
        .where('member_package_id', 'in', createdMemberPackageIds)
        .execute()
      await db
        .deleteFrom('prepaid.member_packages')
        .where('member_package_id', 'in', createdMemberPackageIds)
        .execute()
    }

    if (createdPrepaidProductIds.length > 0) {
      await db
        .deleteFrom('prepaid.packages')
        .where('product_id', 'in', createdPrepaidProductIds)
        .execute()
      await db
        .deleteFrom('shop.products')
        .where('product_id', 'in', createdPrepaidProductIds)
        .execute()
    }

    createdMemberPackageIds = []
    createdPrepaidProductIds = []
  })

  const createTestFlight = (overrides?: Partial<InvoicableFlight>): InvoicableFlight =>
    ({
      flightId: '1',
      aircraftRegistration: testAircraftRegistration,
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
      nonBillingReason: null,
      minBillableExceptionReason: null,
      partiallyBillableFlight: false,
      entryErrorFee: false,
      creditedMins: null,
      creditedNote: null,
      ...overrides,
    }) as InvoicableFlight

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

  const createMemberPackage = async ({
    productId,
    minutes,
    perMinRate,
    usedMinutes = 0,
    simplbooksItemId = null,
    aircraftRegistration = testAircraftRegistration,
  }: {
    productId: string
    minutes: number
    perMinRate: number
    usedMinutes?: number
    simplbooksItemId?: string | null
    aircraftRegistration?: string
  }) => {
    const actualProductId = `${productId}${Date.now().toString().slice(-2)}`.slice(0, 9)

    await db
      .insertInto('shop.products')
      .values({
        product_id: actualProductId,
        category_id: 'FLT_PKG',
        simplbooks_item_id: simplbooksItemId,
        name: { en: actualProductId, fi: actualProductId, sv: actualProductId },
        description: null,
        price: Number((minutes * perMinRate).toFixed(2)),
        stock_quantity: 1,
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .execute()

    await db
      .insertInto('prepaid.packages')
      .values({
        product_id: actualProductId,
        aircraft_registration: aircraftRegistration,
        minutes_per_package: minutes,
        per_min_rate: perMinRate,
        total_packages_available: 1,
        max_per_member: 1,
        expires_at: '2099-12-31',
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .execute()

    const row = await db
      .insertInto('prepaid.member_packages')
      .values({
        member_id: testMemberId,
        product_id: actualProductId,
        order_id: null,
        total_minutes: minutes,
        used_minutes: usedMinutes,
        expires_at: '2099-12-31',
      })
      .returning('member_package_id')
      .executeTakeFirstOrThrow()

    createdPrepaidProductIds.push(actualProductId)
    createdMemberPackageIds.push(row.member_package_id)
  }

  describe('Equipment usage fee application logic', () => {
    it('should add equipment usage fee when member has NOT requested equipment fee for the year', async () => {
      const flight = createTestFlight()
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)

      // First task is the flight
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
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
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
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
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
      expect(invoice.Tasks[0].Task.amount).toBe(60)
      expect(invoice.Tasks[1].Task.code).toBe(testAircraftRegistration)
      expect(invoice.Tasks[1].Task.amount).toBe(45)
    })

    it('should handle multiple flights in the same year without equipment fee requested', async () => {
      const flight1 = createTestFlight({ flightId: '1', flightMins: 60, blockMins: 65 })
      const flight2 = createTestFlight({ flightId: '2', flightMins: 45, blockMins: 50 })
      const payload = { flights: [flight1, flight2] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // 2 flight tasks + 2 equipment usage fee tasks
      expect(invoice.Tasks).toHaveLength(4)
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
      expect(invoice.Tasks[0].Task.amount).toBe(60)
      expect(invoice.Tasks[1].Task.code).toBe(ART_EQUIP_USAGE_FEE_CODE)
      expect(invoice.Tasks[1].Task.amount).toBe(60)
      expect(invoice.Tasks[2].Task.code).toBe(testAircraftRegistration)
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
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
      expect(invoice.Tasks[0].Task.amount).toBe(60)

      // 2026 flight - with equipment fee
      expect(invoice.Tasks[1].Task.code).toBe(testAircraftRegistration)
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

  describe('Non-billable flights', () => {
    it('should apply 100% discount and skip equipment fee for non-billable flight', async () => {
      const flight = createTestFlight({ isBillableFlight: false })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(1)
      expect(invoice.Tasks[0].Task.discount).toBe(100)
      expect(invoice.Tasks[0].Task.code).toBe(testAircraftRegistration)
    })

    it('should not include kalustonkaytto remarks for non-billable flight', async () => {
      const flight = createTestFlight({ isBillableFlight: false })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Invoice.additional_info).toBe('')
    })

    it('should not apply top-up task for non-billable short flight', async () => {
      const flight = createTestFlight({ isBillableFlight: false, flightMins: 10, blockMins: 12 })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Only the flight task — no top-up (billable guard) and no equipment fee
      expect(invoice.Tasks).toHaveLength(1)
      expect(invoice.Tasks[0].Task.discount).toBe(100)
    })
  })

  describe('Minimum billable time top-up', () => {
    it('should bill a local flight below minimum billable minutes at the minimum billable time', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId) // suppress equipment fee for clarity
      const flight = createTestFlight({
        flightMins: 15,
        blockMins: 18,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
      })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Actual flight time shown as a separate line + top-up as a clearly-labelled second line
      expect(invoice.Tasks).toHaveLength(2)
      expect(invoice.Tasks[0].Task.amount).toBe(15)
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(2.5)
      expect(invoice.Tasks[1].Task.amount).toBe(5)
      expect(invoice.Tasks[1].Task.price_per_unit).toBe(2.5)
      expect(invoice.Tasks[1].Task.contents).toContain('minimum billable time top-up: 5 min')
    })

    it('should not add a top-up task for a local flight that meets minimum billable minutes', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({
        flightMins: 20,
        blockMins: 22,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
      })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(1)
    })

    it('should NOT add a top-up task for a cross-country flight below minimum billable minutes', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId) // suppress equipment fee for clarity
      const flight = createTestFlight({
        flightMins: 15,
        blockMins: 18,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
      })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Only the primary flight task — no top-up for cross-country flights
      expect(invoice.Tasks).toHaveLength(1)
      expect(invoice.Tasks[0].Task.amount).toBe(15)
    })

    it('should bill actual minutes (no top-up) for a local flight with minimum billable exception', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({
        flightMins: 15,
        blockMins: 18,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        minBillableExceptionReason: 'Engine failure on runway',
      })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // Exception granted: bill actual 15 mins, no top-up
      expect(invoice.Tasks).toHaveLength(1)
      expect(invoice.Tasks[0].Task.amount).toBe(15)
    })
  })

  describe('Credited minutes', () => {
    it('should throw when credited minutes exceed flight mins (non-training pilot)', async () => {
      const flight = createTestFlight({ flightMins: 90, blockMins: 95, creditedMins: 91 })
      const payload = { flights: [flight] }

      await expect(createFlightInvoicePayload(payload, testMemberId)).rejects.toThrow(
        `Credited minutes (91) cannot exceed billable minutes (90) for flight ${flight.flightId}`,
      )
    })

    it('should throw when credited minutes exceed block mins (training program pilot)', async () => {
      const flight = createTestFlight({
        isTrainingProgramPilot: true,
        flightMins: 90,
        blockMins: 95,
        creditedMins: 96,
      })
      const payload = { flights: [flight] }

      await expect(createFlightInvoicePayload(payload, testMemberId)).rejects.toThrow(
        `Credited minutes (96) cannot exceed billable minutes (95) for flight ${flight.flightId}`,
      )
    })

    it('should not throw when credited minutes equal billable minutes', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({ flightMins: 90, blockMins: 95, creditedMins: 90 })
      const payload = { flights: [flight] }

      await expect(createFlightInvoicePayload(payload, testMemberId)).resolves.toBeDefined()
    })

    it('should add a credit task when flight has credited minutes', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({ flightMins: 90, blockMins: 95, creditedMins: 10 })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)
      // Primary flight task
      expect(invoice.Tasks[0].Task.amount).toBe(90)
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(2.5)
      // Credit task — negative price, amount = creditedMins
      expect(invoice.Tasks[1].Task.amount).toBe(10)
      expect(invoice.Tasks[1].Task.price_per_unit).toBe(-2.5)
      expect(invoice.Tasks[1].Task.contents).toContain('credit for 10 min')
    })

    it('should reduce equipment fee amount by credited minutes', async () => {
      const flight = createTestFlight({ flightMins: 90, blockMins: 95, creditedMins: 10 })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      // flight task + credit task + equipment fee (reduced)
      expect(invoice.Tasks).toHaveLength(3)
      const equipmentFeeTask = invoice.Tasks.find(t => t.Task.code === ART_EQUIP_USAGE_FEE_CODE)
      expect(equipmentFeeTask?.Task.amount).toBe(80) // 90 - 10
    })
  })

  describe('Prepaid package allocation', () => {
    it('should invoice package-covered minutes at package rate and add an offsetting credit row', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      await createMemberPackage({
        productId: 'TPKG001',
        minutes: 90,
        perMinRate: 1.5,
      })

      const flight = createTestFlight({ flightMins: 90, blockMins: 95 })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)
      expect(invoice.Tasks[0].Task.amount).toBe(90)
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(1.5)
      expect(invoice.Tasks[0].Task.contents).toContain('prepaid package rate')
      expect(invoice.Tasks[1].Task.amount).toBe(90)
      expect(invoice.Tasks[1].Task.price_per_unit).toBe(-1.5)
      expect(invoice.Tasks[1].Task.contents).toContain('prepaid package credit')
    })

    it('should allocate limited prepaid minutes from oldest to newest flights and split the remainder to standard pricing', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      await createMemberPackage({
        productId: 'TPKG002',
        minutes: 60,
        perMinRate: 1.5,
      })

      const firstFlight = createTestFlight({
        flightId: 'F1',
        takeoffTimeUtc: new Date(`${year2025}-06-15T08:00:00Z`).toUTCString(),
        landingTimeUtc: new Date(`${year2025}-06-15T08:40:00Z`).toUTCString(),
        flightMins: 40,
        blockMins: 45,
      })
      const secondFlight = createTestFlight({
        flightId: 'F2',
        takeoffTimeUtc: new Date(`${year2025}-06-15T09:00:00Z`).toUTCString(),
        landingTimeUtc: new Date(`${year2025}-06-15T09:40:00Z`).toUTCString(),
        flightMins: 40,
        blockMins: 45,
      })

      const invoice = await createFlightInvoicePayload(
        { flights: [firstFlight, secondFlight] },
        testMemberId,
      )

      expect(invoice.Tasks).toHaveLength(5)
      expect(invoice.Tasks[0].Task.amount).toBe(40)
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(1.5)
      expect(invoice.Tasks[1].Task.amount).toBe(40)
      expect(invoice.Tasks[1].Task.price_per_unit).toBe(-1.5)
      expect(invoice.Tasks[2].Task.amount).toBe(20)
      expect(invoice.Tasks[2].Task.price_per_unit).toBe(1.5)
      expect(invoice.Tasks[3].Task.amount).toBe(20)
      expect(invoice.Tasks[3].Task.price_per_unit).toBe(-1.5)
      expect(invoice.Tasks[4].Task.amount).toBe(20)
      expect(invoice.Tasks[4].Task.price_per_unit).toBe(2.5)
    })

    it('credit row should use package-specific article when simplbooksItemId is set', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      await createMemberPackage({
        productId: 'TPKG_PKG',
        minutes: 90,
        perMinRate: 1.5,
        simplbooksItemId: TEST_PKG_ARTICLE_CODE,
      })

      const flight = createTestFlight({ flightMins: 90, blockMins: 95 })
      const invoice = await createFlightInvoicePayload({ flights: [flight] }, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)
      // Debit line: uses aircraft article
      expect(invoice.Tasks[0].Task.article_id).toBe(testArticleIds[1])
      expect(invoice.Tasks[0].Task.price_per_unit).toBe(1.5)
      // Credit line: uses the package's dedicated article, not the aircraft article
      expect(invoice.Tasks[1].Task.article_id).toBe(testArticleIds[3])
      expect(invoice.Tasks[1].Task.price_per_unit).toBe(-1.5)
    })
  })

  describe('Entry error fee (VIRHEMERKINTA)', () => {
    it('should add entry error fee task when entryErrorFee is true on a billable flight', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({ entryErrorFee: true })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(2)
      const errorFeeTask = invoice.Tasks.find(t => t.Task.code === ART_ENTRY_ERROR_CODE)
      expect(errorFeeTask).toBeDefined()
      expect(errorFeeTask?.Task.article_id).toBe(testArticleIds[2])
      expect(errorFeeTask?.Task.price_per_unit).toBe(50)
      expect(errorFeeTask?.Task.amount).toBe(1)
    })

    it('should NOT add entry error fee task for a non-billable flight', async () => {
      const flight = createTestFlight({ entryErrorFee: true, isBillableFlight: false })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Tasks).toHaveLength(1)
      expect(invoice.Tasks[0].Task.discount).toBe(100)
      const errorFeeTask = invoice.Tasks.find(t => t.Task.code === ART_ENTRY_ERROR_CODE)
      expect(errorFeeTask).toBeUndefined()
    })
  })

  describe('Invoice metadata', () => {
    it('should include flight billing remarks in additional_info', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({ billingRemarks: 'Special handling required' })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Invoice.additional_info).toContain('Special handling required')
    })

    it('should throw when billing ID is missing', async () => {
      const flight = createTestFlight({ billingId: null })
      const payload = { flights: [flight] }

      await expect(createFlightInvoicePayload(payload, testMemberId)).rejects.toThrow(
        `Cannot create invoice: billable member has no billing ID for member ${testMemberId}`,
      )
    })

    it('should throw TypeError when billing ID is not a valid number', async () => {
      const flight = createTestFlight({ billingId: 'not-a-number' })
      const payload = { flights: [flight] }

      await expect(createFlightInvoicePayload(payload, testMemberId)).rejects.toThrow(TypeError)
    })

    it('should set client_id from billing ID', async () => {
      await createEquipmentFeeRequest(year2025, testMemberId)
      const flight = createTestFlight({ billingId: '42' })
      const payload = { flights: [flight] }

      const invoice = await createFlightInvoicePayload(payload, testMemberId)

      expect(invoice.Invoice.client_id).toBe(42)
    })
  })
})
