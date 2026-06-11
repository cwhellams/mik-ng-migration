/**
 * Flight Invoice Outbox Integration Tests
 *
 * Exercises the full pipeline from outbox insertion through `dispatchOutboxMsg` to
 * final DB state without any real HTTP calls to SimplBooks.
 *
 * Strategy:
 *  - SIMPLBOOKS_DRY_RUN=true skips the SimplBooks API call; all DB operations run normally.
 *  - Aircraft pricing rows are inserted in beforeAll to cover all test dates; the real
 *    `getAircraftPriceForDate` DB function is used (no mock) so prices reflect DB state.
 *  - Real flight log rows are inserted so that `updateFlightLogsWithInvoiceNumber` can be
 *    verified as a side-effect.
 *  - Each test cleans up its own seeded data in afterEach.
 */

import { sql, type SqlBool } from 'kysely'
import { db } from '../../../src/db/connection.ts'
import {
  SimplbooksEventType,
  SimplbooksStatus,
  MIKInvoiceType,
  RecurringFeeType,
  AcctsOutboxSimplbooksSchema,
} from '../../../src/services/simplbooks/models.ts'
import {
  FlightLogStatus,
  FlightType,
  type InvoicableFlight,
} from '../../../src/routes/flight-log/models.ts'
import {
  ART_ENTRY_ERROR_CODE,
  ART_EQUIP_USAGE_FEE_CODE,
} from '../../../src/services/accounting/config.ts'

const { dispatchOutboxMsg } =
  await import('../../../src/services/simplbooks/simplbooksOutboxHandler.ts')
const { insertOutboxItem } = await import('../../../src/db/outbox-simplbooks-queries.ts')

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Aircraft without prepaid packages (matches unit-test pick logic). */
const TEST_AIRCRAFT = 'OH-IHQ'
/** Valid AJLB seq_no for OH-IHQ (FK to flight.aircraft_journey_log_book). */
const TEST_AJLB_SEQ_NO = 2
/** Test member with billing ID – FK-safe in the seeded test DB. */
const TEST_MEMBER_ID = 'Matti1'
/** Fake SimplBooks client ID used in the invoice payload. */
const TEST_BILLING_ID = '123456'
/** Year used for the test flights (Jun 2025). */
const YEAR_2025 = 2025

/**
 * Epoch offset from BASE_TAKEOFF_EPOCH to 2025-07-01 08:00:00 UTC (16 days).
 * Used in Suite 9 to exercise the higher price tier that starts 2025-06-16.
 */
const EPOCH_OFFSET_JUL_2025 = 16 * 24 * 60 * 60 // 1,382,400 s

/** Price per minute (€) for OH-IHQ flights from 2025-06-16 onwards (inserted in beforeAll). */
const PRICE_JUL_2025 = 3.0

/**
 * Base epoch for Jun 15, 2025 08:00:00 UTC.
 * Divisible by 60 (required by check_all_times_in_mins constraint).
 * Well in the past (2026-05-20 is today), satisfying check_epochs_not_future.
 */
const BASE_TAKEOFF_EPOCH = 1749974400 // Jun 15 2025 08:00:00 UTC
const BASE_OFF_BLOCK_EPOCH = BASE_TAKEOFF_EPOCH - 300 // 5-min taxi out (300 ÷ 60 = 5 ✓)
const baseOnBlockEpoch = (flightMins: number) => BASE_TAKEOFF_EPOCH + flightMins * 60 + 300
const baseLandingEpoch = (flightMins: number) => BASE_TAKEOFF_EPOCH + flightMins * 60

/**
 * IDs used for the four shared test articles.
 * Chosen to be far from real IDs and clustered together for easy cleanup.
 */
const TEST_ARTICLE_IDS = [9999, 9998, 9997, 9996] as const

/** Article code for the dedicated package article used in S2-5. */
const TEST_PKG_ARTICLE_CODE = 'TEST_PKG_ART'

// ────────────────────────────────────────────────────────────────────────────
// Suite-level tracking state (reset in beforeEach)
// ────────────────────────────────────────────────────────────────────────────
/** Invoice IDs for all created accts.invoice rows (includes both equip-fee and flight invoices). */
let createdInvoiceIds: string[] = []
/**
 * Invoice IDs created as equipment-fee records only (integer range).
 * Used for member.annual_fees cleanup where invoice_id is an integer column.
 */
let equipmentFeeInvoiceIds: string[] = []
let insertedFlightIds: string[] = []
let insertedOutboxIds: string[] = []
let createdMemberPackageIds: number[] = []
let createdPrepaidProductIds: string[] = []
let testIdCounter = 0 // monotonically incremented to generate unique IDs within a run

// ────────────────────────────────────────────────────────────────────────────
describe('Flight Invoice Outbox Integration', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Global setup / teardown
  // ──────────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Enable dry-run mode so no HTTP calls go to SimplBooks
    process.env.SIMPLBOOKS_DRY_RUN = 'true'
    process.env.APP_ENV = 'test'

    // ── Clean up any pre-existing test articles ──────────────────────────
    await db
      .deleteFrom('accts.items')
      .where('code', 'in', [
        ART_EQUIP_USAGE_FEE_CODE,
        ART_ENTRY_ERROR_CODE,
        TEST_AIRCRAFT,
        TEST_PKG_ARTICLE_CODE,
      ])
      .execute()

    // ── Insert equipment usage fee article ───────────────────────────────
    await db
      .insertInto('accts.items')
      .values({
        id: TEST_ARTICLE_IDS[0],
        code: ART_EQUIP_USAGE_FEE_CODE,
        name: 'Kalustomaksun Käyttömaksu',
        item: {
          id: TEST_ARTICLE_IDS[0],
          code: ART_EQUIP_USAGE_FEE_CODE,
          name: 'Kalustomaksun Käyttömaksu',
          unit: 'min',
          markup_value: 0.15,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Kalustomaksu per käyttöminuutti',
          price_per_unit: 0.15,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // ── Insert aircraft article ──────────────────────────────────────────
    await db
      .insertInto('accts.items')
      .values({
        id: TEST_ARTICLE_IDS[1],
        code: TEST_AIRCRAFT,
        name: `Test Aircraft ${TEST_AIRCRAFT}`,
        item: {
          id: TEST_ARTICLE_IDS[1],
          code: TEST_AIRCRAFT,
          name: `Test Aircraft ${TEST_AIRCRAFT}`,
          unit: 'min',
          markup_value: 2.5,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Test aircraft article',
          price_per_unit: 2.5,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // ── Insert VIRHEMERKINTA article ─────────────────────────────────────
    await db
      .insertInto('accts.items')
      .values({
        id: TEST_ARTICLE_IDS[2],
        code: ART_ENTRY_ERROR_CODE,
        name: 'Virhemerkintämaksu',
        item: {
          id: TEST_ARTICLE_IDS[2],
          code: ART_ENTRY_ERROR_CODE,
          name: 'Virhemerkintämaksu',
          unit: 'kpl',
          markup_value: 50,
          active: true,
          amount: 1,
          ean: '',
          contents: 'Virhemerkintä',
          price_per_unit: 50,
          markup_type: 'fixed',
          is_inventory: false,
          sales_vat_type_id: 0,
          purchase_vat_type_id: 0,
        },
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // ── Insert dedicated package article (used by S2-5) ──────────────────
    await db
      .insertInto('accts.items')
      .values({
        id: TEST_ARTICLE_IDS[3],
        code: TEST_PKG_ARTICLE_CODE,
        name: 'Test Package Article',
        item: {
          id: TEST_ARTICLE_IDS[3],
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
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // ── Ensure shop category for prepaid packages exists ─────────────────
    await db
      .insertInto('shop.categories')
      .values({
        category_id: 'FLT_PKG',
        name: { en: 'Flight packages', fi: 'Lentopaketit', sv: 'Flygpaket' },
        description: null,
        created_by: 'Matti1',
        updated_by: 'Matti1',
      })
      .onConflict((oc) => oc.column('category_id').doNothing())
      .execute()

    // ── Insert aircraft pricing records that cover all test dates ────────
    // Two consecutive periods for OH-IHQ, inserted later-first so each satisfies
    // the DB continuity constraint (each period must be adjacent to an existing one).
    // Period 2 is adjacent to the V440 migration record (OH-IHQ from 2025-12-01).
    // Period 1 is adjacent to period 2.
    await db
      .deleteFrom('accts.aircraft_pricing')
      .where('registration', '=', TEST_AIRCRAFT)
      .where('valid_from', 'in', ['2025-06-16', '2024-01-01'])
      .execute()
    // Period 2: 2025-06-16 → 2025-11-30 at 3.00 €/min
    await db
      .insertInto('accts.aircraft_pricing')
      .values({
        registration: TEST_AIRCRAFT,
        valid_from: '2025-06-16',
        valid_to: '2025-11-30',
        price_per_min: '3.00',
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()
    // Period 1: 2024-01-01 → 2025-06-15 at 2.50 €/min
    await db
      .insertInto('accts.aircraft_pricing')
      .values({
        registration: TEST_AIRCRAFT,
        valid_from: '2024-01-01',
        valid_to: '2025-06-15',
        price_per_min: '2.50',
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()
  })

  afterAll(async () => {
    delete process.env.SIMPLBOOKS_DRY_RUN
    delete process.env.APP_ENV

    // Remove test articles
    await db
      .deleteFrom('accts.items')
      .where('id', 'in', [...TEST_ARTICLE_IDS])
      .execute()

    // Remove test aircraft pricing records
    await db
      .deleteFrom('accts.aircraft_pricing')
      .where('registration', '=', TEST_AIRCRAFT)
      .where('valid_from', 'in', ['2025-06-16', '2024-01-01'])
      .execute()

    // Restore the seeded VIRHEMERKINTA article that was present before the test
    await db
      .insertInto('accts.items')
      .values({
        id: 22,
        code: ART_ENTRY_ERROR_CODE,
        name: 'Flight log entry error fee',
        item: { amount: 1, price_per_unit: 10, sum_with_vat: 10, markup_value: 10 },
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
  })

  beforeEach(() => {
    testIdCounter++
    createdInvoiceIds = []
    equipmentFeeInvoiceIds = []
    insertedFlightIds = []
    insertedOutboxIds = []
    createdMemberPackageIds = []
    createdPrepaidProductIds = []
  })

  afterEach(async () => {
    const cleanupErrors: unknown[] = []

    const trySafe = async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        cleanupErrors.push(e)
      }
    }

    // ── 1. Prepaid usage log and member packages ─────────────────────────
    if (createdMemberPackageIds.length > 0) {
      await trySafe(() =>
        db
          .deleteFrom('prepaid.usage_log')
          .where('member_package_id', 'in', createdMemberPackageIds)
          .execute()
          .then(() => undefined),
      )
      await trySafe(() =>
        db
          .deleteFrom('prepaid.member_packages')
          .where('member_package_id', 'in', createdMemberPackageIds)
          .execute()
          .then(() => undefined),
      )
    }

    // ── 2. Prepaid packages and shop products ────────────────────────────
    if (createdPrepaidProductIds.length > 0) {
      await trySafe(() =>
        db
          .deleteFrom('prepaid.packages')
          .where('product_id', 'in', createdPrepaidProductIds)
          .execute()
          .then(() => undefined),
      )
      await trySafe(() =>
        db
          .deleteFrom('shop.products')
          .where('product_id', 'in', createdPrepaidProductIds)
          .execute()
          .then(() => undefined),
      )
    }

    // ── 3. Annual fees (member.annual_fees.invoice_id is INTEGER — only use small IDs) ──
    for (const invoiceId of equipmentFeeInvoiceIds) {
      await trySafe(() =>
        db
          .deleteFrom('member.annual_fees')
          .where('invoice_id', '=', Number(invoiceId))
          .execute()
          .then(() => undefined),
      )
    }

    // ── 4. All accts.invoice rows (supports bigint IDs from dry-run) ─────
    for (const invoiceId of createdInvoiceIds) {
      await trySafe(() =>
        db
          .deleteFrom('accts.invoice')
          .where('id', '=', invoiceId)
          .execute()
          .then(() => undefined),
      )
    }

    // ── 5. SEND_INVOICE_PDF outbox items created during dispatch ─────────
    for (const invoiceId of createdInvoiceIds) {
      await trySafe(() =>
        db
          .deleteFrom('accts.outbox_simplbooks')
          .where('event_type', '=', SimplbooksEventType.SEND_INVOICE_PDF)
          .where(sql<SqlBool>`payload->>'invoiceId' = ${invoiceId}`)
          .execute()
          .then(() => undefined),
      )
    }

    // ── 6. Flight logs ───────────────────────────────────────────────────
    if (insertedFlightIds.length > 0) {
      await trySafe(() =>
        db
          .deleteFrom('flight.logs')
          .where('flight_id', 'in', insertedFlightIds)
          .execute()
          .then(() => undefined),
      )
    }

    // ── 7. FLIGHT_INVOICE outbox rows we inserted ────────────────────────
    if (insertedOutboxIds.length > 0) {
      await trySafe(() =>
        db
          .deleteFrom('accts.outbox_simplbooks')
          .where('id', 'in', insertedOutboxIds)
          .execute()
          .then(() => undefined),
      )
    }

    if (cleanupErrors.length > 0) {
      // Log cleanup errors but don't fail the test — the main assertions already ran
      console.warn(`afterEach cleanup encountered ${cleanupErrors.length} error(s):`, cleanupErrors)
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Fixture helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Create an InvoicableFlight value object with sensible defaults. */
  const makeFlightPayload = (
    flightId: string,
    overrides?: Partial<InvoicableFlight>,
  ): InvoicableFlight =>
    ({
      flightId,
      aircraftRegistration: TEST_AIRCRAFT,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFTU',
      takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
      landingTimeUtc: new Date(baseLandingEpoch(90) * 1000).toISOString(),
      flightTime: '01:30',
      flightMins: 90,
      blockMins: 100,
      blockTime: '01:40',
      flightType: FlightType.DTO,
      isBillableFlight: true,
      billableMemberId: TEST_MEMBER_ID,
      billableMemberLastName: 'Pilot',
      billingId: TEST_BILLING_ID,
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
      validationRemarks: null,
      ...overrides,
    }) as InvoicableFlight

  /**
   * Insert a minimal flight log record into the DB for a test flight.
   * Uses status=VALIDATED with all required ajlb fields so that a later
   * update to INVOICED does not violate the check_verified_values constraint.
   * `epochOffset` shifts all time columns by the given number of seconds (default 0).
   */
  const insertFlightLog = async (
    flightId: string,
    opts: {
      flightMins?: number
      departureAirport?: string
      arrivalAirport?: string
      isBillableFlight?: boolean
      epochOffset?: number
      flightType?: FlightType
    } = {},
  ) => {
    const {
      flightMins = 90,
      departureAirport = 'EFHK',
      arrivalAirport = 'EFTU',
      isBillableFlight = true,
      epochOffset = 0,
      flightType = FlightType.DTO,
    } = opts

    await db
      .insertInto('flight.logs')
      .values({
        flight_id: flightId,
        aircraft_registration: TEST_AIRCRAFT,
        ajlb_seq_no: TEST_AJLB_SEQ_NO,
        ajlb_blank_rows_before: 0,
        ajlb_total_flight_mins: flightMins,
        ajlb_page_number: 82,
        ajlb_row_number: testIdCounter,
        arrival_airport: arrivalAirport,
        departure_airport: departureAirport,
        billable_member_id: TEST_MEMBER_ID,
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
        flight_type: flightType,
        fuel_remaining_litres: '20',
        fuel_uplift_litres: null,
        instrument_flying_mins: 0,
        is_billable_flight: isBillableFlight,
        is_dto_training_flight: false,
        off_block_time_epoch: BASE_OFF_BLOCK_EPOCH + epochOffset,
        takeoff_time_epoch: BASE_TAKEOFF_EPOCH + epochOffset,
        landing_time_epoch: baseLandingEpoch(flightMins) + epochOffset,
        on_block_time_epoch: baseOnBlockEpoch(flightMins) + epochOffset,
        night_flying_mins: 0,
        number_of_landings: 1,
        persons_on_board: 2,
        pic_last_name: 'Instructor',
        pic_member_id: 'Liisa1',
        pic_role: 'FI',
        priv_or_com_flight: 'P',
        status: FlightLogStatus.VALIDATED,
        total_time_in_service: null,
        oil_uplift_litres: null,
        non_billing_reason: isBillableFlight ? null : 'Test non-billable',
        validation_remarks: null,
      })
      .execute()

    insertedFlightIds.push(flightId)
  }

  /**
   * Insert an outbox row for a FLIGHT_INVOICE event and return the full DB row
   * (needed for passing to `dispatchOutboxMsg`).
   */
  const insertFlightOutboxRow = async (flights: InvoicableFlight[]) => {
    await insertOutboxItem(SimplbooksEventType.FLIGHT_INVOICE, { flights })

    const row = await db
      .selectFrom('accts.outbox_simplbooks')
      .selectAll()
      .where('event_type', '=', SimplbooksEventType.FLIGHT_INVOICE)
      .orderBy('created_at_utc', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    insertedOutboxIds.push(row.id)
    return AcctsOutboxSimplbooksSchema.parse(row)
  }

  /**
   * Record an equipment-fee invoice in `accts.invoice` + `member.annual_fees` for the
   * given year, causing `hasRequestedEquipmentFee` to return true for that year.
   * Uses invoice IDs in the 9900-9999 range (far from real IDs).
   */
  const createEquipmentFeeRecord = async (year: number) => {
    const invoiceId = 9900 + createdInvoiceIds.length

    await db
      .insertInto('accts.invoice')
      .values({
        id: invoiceId,
        member_id: TEST_MEMBER_ID,
        invoice_type: MIKInvoiceType.EQUIPMENT_FEE,
        description: `Test equipment fee ${year}`,
        pmt_ref: `TSTEQ${year}`,
        paid_at: null,
        due_at: `${year}-12-31`,
        sent_at: null,
        currency: 'EUR',
        total_sum: '135.00',
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()

    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: TEST_MEMBER_ID,
        year,
        fee_type: RecurringFeeType.EQUIPMENT_FEE,
        invoice_id: invoiceId,
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()

    createdInvoiceIds.push(invoiceId.toString())
    equipmentFeeInvoiceIds.push(invoiceId.toString())
  }

  /**
   * Create a shop product, prepaid package definition, and a member_package for TEST_MEMBER_ID.
   * Tracks created IDs for cleanup in afterEach.
   */
  const createMemberPackage = async ({
    productId: rawProductId,
    minutes,
    perMinRate,
    usedMinutes = 0,
    simplbooksItemId = null,
    expiresAt = '2099-12-31',
  }: {
    productId: string
    minutes: number
    perMinRate: number
    usedMinutes?: number
    simplbooksItemId?: string | null
    expiresAt?: string
  }) => {
    // Truncate to 9 chars (shop.products.product_id is varchar(9))
    const productId = rawProductId.slice(0, 9)

    await db
      .insertInto('shop.products')
      .values({
        product_id: productId,
        category_id: 'FLT_PKG',
        simplbooks_item_id: simplbooksItemId,
        name: { en: productId, fi: productId, sv: productId },
        description: null,
        price: Number((minutes * perMinRate).toFixed(2)),
        stock_quantity: 1,
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()

    // Register for cleanup immediately after insert so afterEach can delete it
    // even if a subsequent insert in this function throws
    createdPrepaidProductIds.push(productId)

    await db
      .insertInto('prepaid.packages')
      .values({
        product_id: productId,
        aircraft_registration: TEST_AIRCRAFT,
        minutes_per_package: minutes,
        per_min_rate: perMinRate,
        total_packages_available: 10,
        max_per_member: 10,
        expires_at: expiresAt,
        created_by: TEST_MEMBER_ID,
        updated_by: TEST_MEMBER_ID,
      })
      .execute()

    const row = await db
      .insertInto('prepaid.member_packages')
      .values({
        member_id: TEST_MEMBER_ID,
        product_id: productId,
        order_id: null,
        total_minutes: minutes,
        used_minutes: usedMinutes,
        expires_at: expiresAt,
      })
      .returning('member_package_id')
      .executeTakeFirstOrThrow()

    createdMemberPackageIds.push(row.member_package_id)

    return { memberPackageId: row.member_package_id }
  }

  /**
   * After `dispatchOutboxMsg` completes, find the most recently created FLIGHT invoice for
   * TEST_MEMBER_ID and register it for cleanup.  Returns the invoice ID.
   */
  const captureFlightInvoiceId = async (): Promise<string> => {
    const invoice = await db
      .selectFrom('accts.invoice')
      .select('id')
      .where('member_id', '=', TEST_MEMBER_ID)
      .where('invoice_type', '=', MIKInvoiceType.FLIGHT)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    createdInvoiceIds.push(invoice.id)
    return invoice.id
  }

  /**
   * Retrieve the dryRunTasks from the SEND_INVOICE_PDF outbox row that was
   * created for the given invoice ID.
   */
  const getDryRunTasks = async (invoiceId: string) => {
    const row = await db
      .selectFrom('accts.outbox_simplbooks')
      .selectAll()
      .where('event_type', '=', SimplbooksEventType.SEND_INVOICE_PDF)
      .where(sql<SqlBool>`payload->>'invoiceId' = ${invoiceId}`)
      .executeTakeFirstOrThrow()

    return (row.payload as { dryRunTasks: unknown[] }).dryRunTasks
  }

  /**
   * Common set of DB assertions run after every dispatch:
   *  - FLIGHT_INVOICE outbox row is SYNCED
   *  - accts.invoice row exists and has the expected invoice_type
   *  - Each supplied flightId has status=INVOICED and invoice_number set
   *  - A SEND_INVOICE_PDF row in PENDING state exists for the invoice
   */
  const assertCommonSideEffects = async (
    outboxId: string,
    invoiceId: string,
    flightIds: string[],
  ) => {
    // 1. Outbox row is SYNCED
    const outboxRow = await db
      .selectFrom('accts.outbox_simplbooks')
      .select('status')
      .where('id', '=', outboxId)
      .executeTakeFirstOrThrow()
    expect(outboxRow.status).toBe(SimplbooksStatus.SYNCED)

    // 2. Invoice row exists with correct type
    const invoiceRow = await db
      .selectFrom('accts.invoice')
      .select(['member_id', 'invoice_type'])
      .where('id', '=', invoiceId)
      .executeTakeFirstOrThrow()
    expect(invoiceRow.member_id).toBe(TEST_MEMBER_ID)
    expect(invoiceRow.invoice_type).toBe(MIKInvoiceType.FLIGHT)

    // 3. Each flight log is INVOICED with the correct invoice number
    for (const flightId of flightIds) {
      const flightRow = await db
        .selectFrom('flight.logs')
        .select(['status', 'invoice_number'])
        .where('flight_id', '=', flightId)
        .executeTakeFirstOrThrow()
      expect(flightRow.status).toBe(FlightLogStatus.INVOICED)
      expect(flightRow.invoice_number).toBe(invoiceId)
    }

    // 4. SEND_INVOICE_PDF row in PENDING state
    const pdfRow = await db
      .selectFrom('accts.outbox_simplbooks')
      .select('status')
      .where('event_type', '=', SimplbooksEventType.SEND_INVOICE_PDF)
      .where(sql<SqlBool>`payload->>'invoiceId' = ${invoiceId}`)
      .executeTakeFirstOrThrow()
    expect(pdfRow.status).toBe(SimplbooksStatus.PENDING)
  }

  // ============================================================================
  // Suite 1 — Billability combinations
  // ============================================================================

  describe('Suite 1 — Billability combinations', () => {
    it('S1-1: fully billable flight without equipment fee — adds kalustonkaytto task', async () => {
      const flightId = `s1-1-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId)
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 2 tasks: flight task + equipment usage fee
      expect(tasks).toHaveLength(2)
      expect(tasks).toMatchSnapshot()
    })

    it('S1-2: fully billable flight with equipment fee paid — no kalustonkaytto task', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s1-2-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId)
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 1 task: only the flight task
      expect(tasks).toHaveLength(1)
      expect(tasks).toMatchSnapshot()
    })

    it('S1-3: non-billable flight — 100% discount, no equipment fee', async () => {
      const flightId = `s1-3-${testIdCounter}`
      await insertFlightLog(flightId, { isBillableFlight: false })

      const flight = makeFlightPayload(flightId, {
        isBillableFlight: false,
        nonBillingReason: 'Test non-billable',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 1 task: flight with 100% discount
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { discount?: number }).discount).toBe(100)
      expect(tasks).toMatchSnapshot()
    })

    it('S1-4: partially billable flight — billed normally, billingRemarks required', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s1-4-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, {
        partiallyBillableFlight: true,
        billingRemarks: 'Engine test; partial billing applies',
        creditedMins: 10,
        creditedNote: 'Engine test; 10 min credited by billing admin',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Partially billable flight: standard task for full 90 min + credit line item for 10 min
      expect(tasks).toHaveLength(2)
      const creditTask = (tasks as Array<{ price_per_unit?: number; amount?: number }>).find(
        (t) => (t.price_per_unit ?? 0) < 0,
      )
      expect(creditTask?.amount).toBe(10)
      expect(creditTask?.price_per_unit).toBeCloseTo(-2.5)
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 2 — Prepaid package scenarios
  // ============================================================================

  describe('Suite 2 — Prepaid package scenarios', () => {
    it('S2-1: fully prepaid — charge at package rate + credit row; usage_log created', async () => {
      await createEquipmentFeeRecord(YEAR_2025)
      const { memberPackageId } = await createMemberPackage({
        productId: 'TP2-1',
        minutes: 90,
        perMinRate: 1.5,
      })

      const flightId = `s2-1-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId)
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 2 tasks: prepaid charge + prepaid credit (no standard task because fully covered)
      expect(tasks).toHaveLength(2)
      expect((tasks[0] as { price_per_unit?: number; amount?: number }).price_per_unit).toBeCloseTo(
        1.5,
      )
      expect((tasks[1] as { price_per_unit?: number; amount?: number }).price_per_unit).toBeCloseTo(
        -1.5,
      )
      expect(tasks).toMatchSnapshot()

      // Verify prepaid usage_log entry was created
      const usageLogs = await db
        .selectFrom('prepaid.usage_log')
        .selectAll()
        .where('member_package_id', '=', memberPackageId)
        .execute()
      expect(usageLogs).toHaveLength(1)
      expect(usageLogs[0].minutes_used).toBe(90)

      // Verify member_packages.used_minutes updated
      const pkg = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', memberPackageId)
        .executeTakeFirstOrThrow()
      expect(pkg.used_minutes).toBe(90)
    })

    it('S2-2: partially prepaid (balance exhausted) — prepaid + credit + standard remainder', async () => {
      await createEquipmentFeeRecord(YEAR_2025)
      const { memberPackageId } = await createMemberPackage({
        productId: 'TP2-2',
        minutes: 40,
        perMinRate: 1.5,
      })

      const flightId = `s2-2-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, { flightMins: 90, blockMins: 95 })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 3 tasks: 40 min prepaid + credit + 50 min standard
      expect(tasks).toHaveLength(3)
      const chargeTasks = (tasks as Array<{ price_per_unit?: number; amount?: number }>).filter(
        (t) => (t.price_per_unit ?? 0) > 0,
      )
      expect(chargeTasks[0].amount).toBe(40)
      expect(chargeTasks[0].price_per_unit).toBeCloseTo(1.5)
      expect(chargeTasks[1].amount).toBe(50)
      expect(chargeTasks[1].price_per_unit).toBeCloseTo(2.5)
      expect(tasks).toMatchSnapshot()

      // Package should be fully drained
      const pkg = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', memberPackageId)
        .executeTakeFirstOrThrow()
      expect(pkg.used_minutes).toBe(40)
    })

    it('S2-3: local short flight with prepaid — top-up mins folded into prepaid', async () => {
      await createEquipmentFeeRecord(YEAR_2025)
      const { memberPackageId } = await createMemberPackage({
        productId: 'TP2-3',
        minutes: 90,
        perMinRate: 1.5,
      })

      const flightId = `s2-3-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 15,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK', // local flight triggers min-billable top-up
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 15,
        blockMins: 20,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(15) * 1000).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Prepaid covers the 20 min (15 + 5 top-up), credit row; no standard task
      expect(tasks).toHaveLength(2) // prepaid charge + credit
      const prepaidCharge = (tasks as Array<{ amount?: number; price_per_unit?: number }>).find(
        (t) => (t.price_per_unit ?? 0) > 0,
      )
      expect(prepaidCharge?.amount).toBe(20) // 15 + 5 top-up
      expect(tasks).toMatchSnapshot()

      // Package used_minutes updated to 20 (15 flight + 5 top-up)
      const pkg = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', memberPackageId)
        .executeTakeFirstOrThrow()
      expect(pkg.used_minutes).toBe(20)
    })

    it('S2-4: multiple packages drained first-to-expire first', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      // First package (expires sooner in the default sort: both 2099 but member_package_id order)
      const { memberPackageId: pkg1Id } = await createMemberPackage({
        productId: 'TP2-4a',
        minutes: 30,
        perMinRate: 1.5,
      })
      // Second package
      const { memberPackageId: pkg2Id } = await createMemberPackage({
        productId: 'TP2-4b',
        minutes: 40,
        perMinRate: 1.5,
      })

      const flightId = `s2-4-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, { flightMins: 60, blockMins: 65 })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Both packages contribute; all 60 min covered by packages
      // Package 1: 30 min prepaid + 30 min credit
      // Package 2: 30 min prepaid + 30 min credit (but groups same rate together)
      // Actually since both packages have same rate, they get grouped: 60 min charge + 60 min credit
      expect(tasks).toHaveLength(2)
      expect(tasks).toMatchSnapshot()

      // First package fully drained (30 min)
      const p1 = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', pkg1Id)
        .executeTakeFirstOrThrow()
      expect(p1.used_minutes).toBe(30)

      // Second package partially drained (30 min of 40)
      const p2 = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', pkg2Id)
        .executeTakeFirstOrThrow()
      expect(p2.used_minutes).toBe(30)

      // Two usage_log entries (one per package)
      const usageLogs = await db
        .selectFrom('prepaid.usage_log')
        .selectAll()
        .where('member_package_id', 'in', [pkg1Id, pkg2Id])
        .execute()
      expect(usageLogs).toHaveLength(2)
    })

    it('S2-5: package with simplbooksItemId — credit row uses package article code', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      // Use a dedicated package article (TEST_PKG_ARTICLE_CODE, id 9996) so the credit line's
      // article_id is demonstrably different from the aircraft article (9998).
      const { memberPackageId } = await createMemberPackage({
        productId: 'TP2-5',
        minutes: 90,
        perMinRate: 1.5,
        simplbooksItemId: TEST_PKG_ARTICLE_CODE,
      })

      const flightId = `s2-5-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId)
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      expect(tasks).toHaveLength(2)

      // Debit line uses aircraft article; credit line uses dedicated package article
      const task0 = tasks[0] as { article_id: number }
      const task1 = tasks[1] as { article_id: number }
      expect(task0.article_id).toBe(TEST_ARTICLE_IDS[1]) // aircraft article
      expect(task1.article_id).toBe(TEST_ARTICLE_IDS[3]) // package article (distinct!)
      expect(tasks).toMatchSnapshot()

      // Package used_minutes updated
      const pkg = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', memberPackageId)
        .executeTakeFirstOrThrow()
      expect(pkg.used_minutes).toBe(90)
    })

    it('S2-6: two flights, two packages different rates, prepaid exhausted — remainder at standard rate; first-to-expire consumed first', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      // Pkg1 expires earlier → consumed first (expires_at ASC ordering)
      const { memberPackageId: pkg1Id } = await createMemberPackage({
        productId: 'TP2-6a',
        minutes: 40,
        perMinRate: 1.0,
        expiresAt: '2026-12-31',
      })
      // Pkg2 expires later → consumed second
      const { memberPackageId: pkg2Id } = await createMemberPackage({
        productId: 'TP2-6b',
        minutes: 30,
        perMinRate: 1.5,
        expiresAt: '2027-12-31',
      })

      // Two flights submitted in one outbox message.
      // Flight 1: 60 min  →  40 min from pkg1 (drains it) + 20 min from pkg2
      // Flight 2: 30 min  →  10 min remaining from pkg2 (drains it) + 20 min standard at 2.5
      const FLIGHT2_OFFSET = 7200 // 2 hours after flight 1
      const flightId1 = `s2-6a-${testIdCounter}`
      const flightId2 = `s2-6b-${testIdCounter}`
      await insertFlightLog(flightId1, { flightMins: 60 })
      await insertFlightLog(flightId2, { flightMins: 30, epochOffset: FLIGHT2_OFFSET })

      const flight1 = makeFlightPayload(flightId1, {
        flightMins: 60,
        blockMins: 65,
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(60) * 1000).toISOString(),
      })
      const flight2 = makeFlightPayload(flightId2, {
        flightId: flightId2,
        flightMins: 30,
        blockMins: 35,
        takeoffTimeUtc: new Date((BASE_TAKEOFF_EPOCH + FLIGHT2_OFFSET) * 1000).toISOString(),
        landingTimeUtc: new Date(
          (BASE_TAKEOFF_EPOCH + FLIGHT2_OFFSET + 30 * 60) * 1000,
        ).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight1, flight2])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId1, flightId2])

      const tasks = await getDryRunTasks(invoiceId)
      // 7 tasks: each flight generates its own per-package tasks (no cross-flight grouping)
      //   flight1: pkg1(40) charge+credit, pkg2(20) charge+credit
      //   flight2: pkg2(10) charge+credit, standard(20)
      expect(tasks).toHaveLength(7)

      const typedTasks = tasks as Array<{ price_per_unit?: number; amount?: number }>

      // Pkg1 (1.0/min): one pair, 40 min from flight 1 only
      const pkg1Charges = typedTasks.filter(
        (t) => (t.price_per_unit ?? 0) > 0 && Math.abs((t.price_per_unit ?? 0) - 1.0) < 0.01,
      )
      const pkg1Credits = typedTasks.filter(
        (t) => (t.price_per_unit ?? 0) < 0 && Math.abs((t.price_per_unit ?? 0) + 1.0) < 0.01,
      )
      expect(pkg1Charges).toHaveLength(1)
      expect(pkg1Charges[0].amount).toBe(40)
      expect(pkg1Credits).toHaveLength(1)
      expect(pkg1Credits[0].amount).toBe(40)

      // Pkg2 (1.5/min): two pairs — 20 min from flight 1, 10 min from flight 2
      const pkg2Charges = typedTasks.filter(
        (t) => (t.price_per_unit ?? 0) > 0 && Math.abs((t.price_per_unit ?? 0) - 1.5) < 0.01,
      )
      const pkg2Credits = typedTasks.filter(
        (t) => (t.price_per_unit ?? 0) < 0 && Math.abs((t.price_per_unit ?? 0) + 1.5) < 0.01,
      )
      expect(pkg2Charges).toHaveLength(2)
      expect(pkg2Credits).toHaveLength(2)
      const pkg2TotalCharged = pkg2Charges.reduce((sum, t) => sum + (t.amount ?? 0), 0)
      expect(pkg2TotalCharged).toBe(30) // 20 + 10

      // Standard remainder (2.5/min): 20 min from flight 2 after prepaid exhausted
      const standardTasks = typedTasks.filter((t) => Math.abs((t.price_per_unit ?? 0) - 2.5) < 0.01)
      expect(standardTasks).toHaveLength(1)
      expect(standardTasks[0].amount).toBe(20)

      expect(tasks).toMatchSnapshot()

      // Pkg1 fully drained
      const p1 = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', pkg1Id)
        .executeTakeFirstOrThrow()
      expect(p1.used_minutes).toBe(40)

      // Pkg2 fully drained
      const p2 = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', pkg2Id)
        .executeTakeFirstOrThrow()
      expect(p2.used_minutes).toBe(30)

      // 3 usage_log entries: flight1→pkg1(40), flight1→pkg2(20), flight2→pkg2(10)
      const usageLogs = await db
        .selectFrom('prepaid.usage_log')
        .selectAll()
        .where('member_package_id', 'in', [pkg1Id, pkg2Id])
        .execute()
      expect(usageLogs).toHaveLength(3)
    })
  })

  // ============================================================================
  // Suite 3 — Training program pilot
  // ============================================================================

  describe('Suite 3 — Training program pilot', () => {
    it('S3-1: training program pilot billed on block time, not flight time', async () => {
      // No equipment fee record → kalustonkaytto applies
      const flightId = `s3-1-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, {
        isTrainingProgramPilot: true,
        flightMins: 90,
        blockMins: 100,
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // 2 tasks; both should use blockMins=100
      expect(tasks).toHaveLength(2)
      const flightTask = (tasks as Array<{ amount?: number; price_per_unit?: number }>).find(
        (t) => (t.price_per_unit ?? 0) > 0 && t.amount === 100,
      )
      expect(flightTask).toBeDefined()
      expect(tasks).toMatchSnapshot()
    })

    it('S3-2: training program pilot with prepaid — block time is allocation basis', async () => {
      await createEquipmentFeeRecord(YEAR_2025)
      const { memberPackageId } = await createMemberPackage({
        productId: 'TP3-2',
        minutes: 100,
        perMinRate: 1.5,
      })

      const flightId = `s3-2-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, {
        isTrainingProgramPilot: true,
        flightMins: 90,
        blockMins: 100,
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Fully covered by prepaid: 2 tasks (charge + credit), both 100 min
      expect(tasks).toHaveLength(2)
      expect(tasks).toMatchSnapshot()

      // Package drained by block time (100 min), not flight time (90 min)
      const pkg = await db
        .selectFrom('prepaid.member_packages')
        .select(['used_minutes'])
        .where('member_package_id', '=', memberPackageId)
        .executeTakeFirstOrThrow()
      expect(pkg.used_minutes).toBe(100)
    })
  })

  // ============================================================================
  // Suite 4 — Minimum billable time
  // ============================================================================

  describe('Suite 4 — Minimum billable time', () => {
    it('S4-1: local flight below 20 min — billed at minimum 20 min', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s4-1-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 15,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 15,
        blockMins: 20,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(15) * 1000).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Actual flight (15 min) + labelled top-up (5 min) as two separate invoice lines
      expect(tasks).toHaveLength(2)
      const typedTasks = tasks as Array<{ amount?: number; contents?: string }>
      const flightTask = typedTasks.find((t) => !(t.contents ?? '').includes('top-up'))
      const topUpTask = typedTasks.find((t) => (t.contents ?? '').includes('top-up'))
      expect(flightTask?.amount).toBe(15)
      expect(topUpTask?.amount).toBe(5)
      expect(topUpTask?.contents).toContain('minimum billable time top-up: 5 min')
      expect(tasks).toMatchSnapshot()
    })

    it('S4-2: cross-country flight below 20 min — no top-up applied', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s4-2-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 15,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 15,
        blockMins: 20,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU', // cross-country → no top-up
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(15) * 1000).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Single task for actual 15 min
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { amount?: number }).amount).toBe(15)
      expect(tasks).toMatchSnapshot()
    })

    it('S4-3: local flight with minBillableExceptionReason — actual minutes billed', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s4-3-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 15,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 15,
        blockMins: 20,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        minBillableExceptionReason: 'Engine failure on runway',
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(15) * 1000).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Exception granted: actual 15 min, no top-up
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { amount?: number }).amount).toBe(15)
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 5 — Entry error fee (VIRHEMERKINTA)
  // ============================================================================

  describe('Suite 5 — Entry error fee (VIRHEMERKINTA)', () => {
    it('S5-1: billable flight with entryErrorFee — VIRHEMERKINTA task appended', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s5-1-${testIdCounter}`
      await insertFlightLog(flightId)

      const flight = makeFlightPayload(flightId, {
        entryErrorFee: true,
        validationRemarks: 'Error in entry',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // flight task + VIRHEMERKINTA task
      expect(tasks).toHaveLength(2)
      const errorFeeTask = (
        tasks as Array<{ article_id?: number; price_per_unit?: number; amount?: number }>
      ).find((t) => t.article_id === TEST_ARTICLE_IDS[2])
      expect(errorFeeTask).toBeDefined()
      expect(errorFeeTask?.amount).toBe(1)
      expect(tasks).toMatchSnapshot()
    })

    it('S5-2: non-billable flight with entryErrorFee — VIRHEMERKINTA NOT added', async () => {
      const flightId = `s5-2-${testIdCounter}`
      await insertFlightLog(flightId, { isBillableFlight: false })

      const flight = makeFlightPayload(flightId, {
        isBillableFlight: false,
        nonBillingReason: 'Instructor flight',
        entryErrorFee: true, // ignored on non-billable flights per business rules
        validationRemarks: 'Error in entry',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Non-billable: only the discounted flight task, no VIRHEMERKINTA
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { discount?: number }).discount).toBe(100)
      const errorFeeTask = (tasks as Array<{ article_id?: number }>).find(
        (t) => t.article_id === TEST_ARTICLE_IDS[2],
      )
      expect(errorFeeTask).toBeUndefined()
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 7 — Test flight
  // ============================================================================

  describe('Suite 7 — Test flight', () => {
    it('S7-1: test flight — zero-value invoice with billing remarks, no equipment fee', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s7-1-${testIdCounter}`
      await insertFlightLog(flightId, {
        isBillableFlight: false,
        flightType: FlightType.TEST_FLIGHT,
      })

      const flight = makeFlightPayload(flightId, {
        flightType: FlightType.TEST_FLIGHT,
        isBillableFlight: false,
        billingRemarks: 'Engine ignition test; 20 min run-up',
        nonBillingReason: 'Test flight - not chargeable',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Test flight: single task with 100% discount (zero value); equipment fee not applied
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { discount?: number }).discount).toBe(100)
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 8 — Ferry flight
  // ============================================================================

  describe('Suite 8 — Ferry flight', () => {
    it('S8-1: ferry flight — zero-value invoice with billing remarks, no equipment fee', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s8-1-${testIdCounter}`
      await insertFlightLog(flightId, {
        isBillableFlight: false,
        flightType: FlightType.FERRY,
      })

      const flight = makeFlightPayload(flightId, {
        flightType: FlightType.FERRY,
        isBillableFlight: false,
        billingRemarks: 'Ferry from EFHK to EFTU for maintenance',
        nonBillingReason: 'Ferry flight - not chargeable',
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Ferry flight: single task with 100% discount (zero value); equipment fee not applied
      expect(tasks).toHaveLength(1)
      expect((tasks[0] as { discount?: number }).discount).toBe(100)
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 6 — Multi-flight outbox dispatch
  // ============================================================================

  describe('Suite 6 — Multi-flight dispatch and DB side-effects', () => {
    it('S6-1: two flights in one outbox message — both logs updated, one invoice', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const FLIGHT2_OFFSET = 7200 // 2 hours after flight 1

      const flightId1 = `s6-1a-${testIdCounter}`
      const flightId2 = `s6-1b-${testIdCounter}`
      await insertFlightLog(flightId1, { flightMins: 60 })
      await insertFlightLog(flightId2, { flightMins: 45, epochOffset: FLIGHT2_OFFSET })

      const flight1 = makeFlightPayload(flightId1, {
        flightMins: 60,
        blockMins: 65,
        takeoffTimeUtc: new Date(BASE_TAKEOFF_EPOCH * 1000).toISOString(),
        landingTimeUtc: new Date(baseLandingEpoch(60) * 1000).toISOString(),
      })
      const flight2 = makeFlightPayload(flightId2, {
        flightId: flightId2,
        flightMins: 45,
        blockMins: 50,
        takeoffTimeUtc: new Date((BASE_TAKEOFF_EPOCH + FLIGHT2_OFFSET) * 1000).toISOString(),
        landingTimeUtc: new Date(
          (BASE_TAKEOFF_EPOCH + FLIGHT2_OFFSET + 45 * 60) * 1000,
        ).toISOString(),
      })

      const outboxRow = await insertFlightOutboxRow([flight1, flight2])
      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId1, flightId2])

      const tasks = await getDryRunTasks(invoiceId)
      // 2 flights, equipment fee paid → 2 flight tasks
      expect(tasks).toHaveLength(2)
      expect(tasks).toMatchSnapshot()
    })
  })

  // ============================================================================
  // Suite 9 — DB-driven aircraft pricing
  // ============================================================================
  //
  // These tests rely on the two pricing periods inserted in beforeAll:
  //   Period 1: 2024-01-01 → 2025-06-15  at €2.50/min
  //   Period 2: 2025-06-16 → 2025-11-30  at €3.00/min  (PRICE_JUL_2025)
  //
  // All other suites use June 2025 flights (period 1, €2.50/min). Suites 9
  // exercise the period-2 price by using July 2025 flight dates to prove
  // that pricing truly comes from the database.
  // ============================================================================

  describe('Suite 9 — DB-driven aircraft pricing', () => {
    it('S9-1: standard flight in July 2025 — billed at the higher DB rate (€3.00/min)', async () => {
      await createEquipmentFeeRecord(YEAR_2025)

      const flightId = `s9-1-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 90,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
        epochOffset: EPOCH_OFFSET_JUL_2025,
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 90,
        blockMins: 100,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
        takeoffTimeUtc: new Date((BASE_TAKEOFF_EPOCH + EPOCH_OFFSET_JUL_2025) * 1000).toISOString(),
        landingTimeUtc: new Date(
          (baseLandingEpoch(90) + EPOCH_OFFSET_JUL_2025) * 1000,
        ).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      expect(tasks).toHaveLength(1)
      const task = tasks[0] as { amount?: number; price_per_unit?: number }
      expect(task.amount).toBe(90)
      expect(task.price_per_unit).toBeCloseTo(PRICE_JUL_2025)
      expect(tasks).toMatchSnapshot()
    })

    it('S9-2: flight with prepaid package in July 2025 — standard remainder at DB rate', async () => {
      // Partial prepaid: package covers 60 min, 90-min flight leaves 30 min at standard rate.
      // The standard 30 min must be billed at €3.00/min (period-2 price from DB).
      await createEquipmentFeeRecord(YEAR_2025)

      const { memberPackageId } = await createMemberPackage({
        productId: `TP9-2-${testIdCounter}`,
        minutes: 60,
        perMinRate: 1.5,
      })

      const flightId = `s9-2-${testIdCounter}`
      await insertFlightLog(flightId, {
        flightMins: 90,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
        epochOffset: EPOCH_OFFSET_JUL_2025,
      })

      const flight = makeFlightPayload(flightId, {
        flightMins: 90,
        blockMins: 100,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFTU',
        takeoffTimeUtc: new Date((BASE_TAKEOFF_EPOCH + EPOCH_OFFSET_JUL_2025) * 1000).toISOString(),
        landingTimeUtc: new Date(
          (baseLandingEpoch(90) + EPOCH_OFFSET_JUL_2025) * 1000,
        ).toISOString(),
      })
      const outboxRow = await insertFlightOutboxRow([flight])

      await dispatchOutboxMsg(outboxRow)

      const invoiceId = await captureFlightInvoiceId()
      await assertCommonSideEffects(outboxRow.id, invoiceId, [flightId])

      const tasks = await getDryRunTasks(invoiceId)
      // Expected tasks: prepaid charge (60 min × 1.5), prepaid credit (60 min × -1.5),
      //                 standard remainder (30 min × 3.0)
      expect(tasks).toHaveLength(3)
      const typedTasks = tasks as Array<{ amount?: number; price_per_unit?: number }>
      const prepaidCharge = typedTasks.find(
        (t) => (t.price_per_unit ?? 0) > 0 && Math.abs((t.price_per_unit ?? 0) - 1.5) < 0.01,
      )
      const prepaidCredit = typedTasks.find((t) => (t.price_per_unit ?? 0) < 0)
      const standardTask = typedTasks.find(
        (t) => Math.abs((t.price_per_unit ?? 0) - PRICE_JUL_2025) < 0.01,
      )

      expect(prepaidCharge?.amount).toBe(60)
      expect(prepaidCredit?.amount).toBe(60)
      expect(standardTask?.amount).toBe(30)
      expect(standardTask?.price_per_unit).toBeCloseTo(PRICE_JUL_2025)

      // Verify package was actually consumed via DB
      const usageLog = await db
        .selectFrom('prepaid.usage_log')
        .selectAll()
        .where('member_package_id', '=', memberPackageId)
        .execute()
      expect(usageLog).toHaveLength(1)
      expect(usageLog[0].minutes_used).toBe(60)

      expect(tasks).toMatchSnapshot()
    })
  })
})
