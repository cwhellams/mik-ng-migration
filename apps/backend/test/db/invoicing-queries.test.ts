import {
  getInvoices,
  getInvoiceItems,
  getAnnualEquipmmentFee,
  hasRequestedEquipmentFee,
  upsertInvoiceItems,
  deleteInvoiceItem,
  getRecurringFeesProcessing,
} from '../../src/db/invoicing-queries.ts'
import type { InvoiceItemQueryParams } from '../../src/routes/invoicing/models.ts'
import {
  MIKInvoiceType,
  RecurringFeeType,
  type ItemListArticle,
} from '../../src/services/simplbooks/models.ts'
import { db } from '../../src/db/connection.ts'
import { ART_EQUIP_FEE_CODE } from '../../src/services/accounting/config.ts'

describe('Invoicing Queries', () => {
  const testMemberId = 'Matti1'
  const adminMemberId = 'k1mnimda'

  describe('getInvoices', () => {
    it('should return all invoices for admin user', async () => {
      const invoices = await getInvoices(adminMemberId, true)
      expect(invoices).toBeDefined()
      expect(Array.isArray(invoices)).toBe(true)
    })

    it('should filter invoices by memberId for non-admin user', async () => {
      const invoices = await getInvoices(testMemberId, false)
      expect(invoices).toBeDefined()
      expect(Array.isArray(invoices)).toBe(true)
      // All returned invoices should belong to the member
      invoices.forEach((invoice) => {
        expect(invoice.member_id).toBe(testMemberId)
      })
    })

    it('should filter invoices by id', async () => {
      const filters: InvoiceItemQueryParams = { id: 1 }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.id).toBe('1')
      })
    })

    it('should filter invoices by startDate', async () => {
      const startDate = '2024-01-01'
      const filters: InvoiceItemQueryParams = { startDate }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        if (invoice.sent_at) {
          expect(new Date(invoice.sent_at).getTime()).toBeGreaterThanOrEqual(
            new Date(startDate).getTime(),
          )
        }
      })
    })

    it('should filter invoices by endDate', async () => {
      const endDate = '2025-12-31'
      const filters: InvoiceItemQueryParams = { endDate }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        if (invoice.sent_at) {
          expect(new Date(invoice.sent_at).getTime()).toBeLessThanOrEqual(
            new Date(endDate).getTime(),
          )
        }
      })
    })

    it('should filter invoices by status=paid', async () => {
      const filters: InvoiceItemQueryParams = { status: 'paid' }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.is_paid).toBe(true)
      })
    })

    it('should filter invoices by status=unpaid', async () => {
      const filters: InvoiceItemQueryParams = { status: 'unpaid' }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.is_paid).toBe(false)
      })
    })

    it('should filter invoices by type', async () => {
      const filters: InvoiceItemQueryParams = { type: MIKInvoiceType.EQUIPMENT_FEE }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.invoice_type).toBe(MIKInvoiceType.EQUIPMENT_FEE)
      })
    })

    it('should filter invoices by pastDue', async () => {
      const filters: InvoiceItemQueryParams = { pastDue: true }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      const now = new Date()
      invoices.forEach((invoice) => {
        expect(new Date(invoice.due_at).getTime()).toBeLessThan(now.getTime())
        expect(invoice.is_paid).toBe(false)
      })
    })

    it('should filter invoices by memberId for admin user when scope=personal', async () => {
      const filters: InvoiceItemQueryParams = { scope: 'personal' }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.member_id).toBe(adminMemberId)
      })
    })

    it('should ignore memberId filter for admin user when scope=personal', async () => {
      const filters: InvoiceItemQueryParams = { scope: 'personal', memberId: testMemberId }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      invoices.forEach((invoice) => {
        expect(invoice.member_id).toBe(adminMemberId)
      })
    })

    it('should apply multiple filters together', async () => {
      const filters: InvoiceItemQueryParams = {
        startDate: '2024-01-01',
        endDate: '2025-12-31',
        status: 'unpaid',
      }
      const invoices = await getInvoices(adminMemberId, true, filters)
      expect(invoices).toBeDefined()
      const startTime = new Date('2024-01-01').getTime()
      const endTime = new Date('2025-12-31').getTime()
      invoices.forEach((invoice) => {
        if (invoice.sent_at) {
          const sentTime = new Date(invoice.sent_at).getTime()
          expect(sentTime).toBeGreaterThanOrEqual(startTime)
          expect(sentTime).toBeLessThanOrEqual(endTime)
        }
        expect(invoice.is_paid).toBe(false)
      })
    })
  })

  describe('getInvoiceItems', () => {
    it('should return all invoice items', async () => {
      const items = await getInvoiceItems()
      expect(items).toBeDefined()
      expect(Array.isArray(items)).toBe(true)
    })
  })

  describe('getAnnualEquipmmentFee', () => {
    it('should return equipment fee when it exists', async () => {
      const equipmentFee = await getAnnualEquipmmentFee()

      if (equipmentFee) {
        expect(equipmentFee).toHaveProperty('code')
        expect(equipmentFee).toHaveProperty('unit')
        expect(equipmentFee).toHaveProperty('markup_value')
        expect(equipmentFee).toHaveProperty('discount_amount')
        expect(equipmentFee.code).toBe(ART_EQUIP_FEE_CODE)
      }
    })

    it('should return undefined when equipment fee does not exist', async () => {
      // Delete the equipment fee if it exists
      await db.deleteFrom('accts.items').where('code', '=', ART_EQUIP_FEE_CODE).execute()

      const equipmentFee = await getAnnualEquipmmentFee()
      expect(equipmentFee).toBeUndefined()

      // Restore the equipment fee for other tests
      await db
        .insertInto('accts.items')
        .values({
          id: 20,
          code: ART_EQUIP_FEE_CODE,
          name: 'Kalustomaksu',
          item: {
            id: 20,
            code: ART_EQUIP_FEE_CODE,
            name: 'Kalustomaksu',
            unit: 'kpl',
            markup_value: 135,
            active: true,
            amount: 1,
            ean: '',
            contents: 'Test equipment fee',
            price_per_unit: 0,
            markup_type: 'fixed',
            is_inventory: false,
            sales_vat_type_id: 0,
            purchase_vat_type_id: 0,
          },
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()
    })
  })

  describe('hasRequestedEquipmentFee', () => {
    const feeYear = 2099
    const feeMemberId = testMemberId
    let createdInvoiceId: string | null = null

    beforeEach(async () => {
      await db
        .deleteFrom('member.annual_fees')
        .where('member_id', '=', feeMemberId)
        .where('year', '=', feeYear)
        .where('fee_type', '=', RecurringFeeType.EQUIPMENT_FEE)
        .execute()
    })

    afterEach(async () => {
      await db
        .deleteFrom('member.annual_fees')
        .where('member_id', '=', feeMemberId)
        .where('year', '=', feeYear)
        .where('fee_type', '=', RecurringFeeType.EQUIPMENT_FEE)
        .execute()

      if (createdInvoiceId) {
        await db.deleteFrom('accts.invoice').where('id', '=', createdInvoiceId).execute()
        createdInvoiceId = null
      }
    })

    it('should return false when no equipment fee request exists', async () => {
      const hasFee = await hasRequestedEquipmentFee(feeYear, feeMemberId)
      expect(hasFee).toBe(false)
    })

    it('should return true when equipment fee request exists', async () => {
      const maxIdResult = await db
        .selectFrom('accts.invoice')
        .select(db.fn.max('id').as('max_id'))
        .executeTakeFirst()

      const nextId = maxIdResult?.max_id ? Number(maxIdResult.max_id) + 1 : 1
      createdInvoiceId = nextId.toString()

      await db
        .insertInto('accts.invoice')
        .values({
          id: createdInvoiceId,
          member_id: feeMemberId,
          invoice_type: MIKInvoiceType.EQUIPMENT_FEE,
          description: 'Test equipment fee invoice',
          pmt_ref: 'TEST-EQUIP-FEE',
          paid_at: null,
          due_at: new Date().toISOString(),
          sent_at: null,
          currency: 'EUR',
          total_sum: '0.00',
          created_by: adminMemberId,
          updated_by: adminMemberId,
        })
        .execute()

      await db
        .insertInto('member.annual_fees')
        .values({
          member_id: feeMemberId,
          year: feeYear,
          fee_type: RecurringFeeType.EQUIPMENT_FEE,
          invoice_id: nextId,
          created_by: adminMemberId,
          updated_by: adminMemberId,
        })
        .execute()

      const hasFee = await hasRequestedEquipmentFee(feeYear, feeMemberId)
      expect(hasFee).toBe(true)
    })
  })

  describe('upsertInvoiceItems', () => {
    const testItems: ItemListArticle[] = [
      {
        id: 999,
        code: 'TEST001',
        name: 'Test Item 1',
        unit: 'kpl',
        markup_value: 100,
        active: true,
        amount: 1,
        ean: '',
        contents: 'Test content',
        price_per_unit: 100,
        markup_type: 'fixed',
        is_inventory: false,
      },
      {
        id: 1000,
        code: 'TEST002',
        name: 'Test Item 2',
        unit: 'kpl',
        markup_value: 200,
        active: true,
        amount: 1,
        ean: '',
        contents: 'Test content 2',
        price_per_unit: 200,
        markup_type: 'fixed',
        is_inventory: false,
      },
    ]

    afterEach(async () => {
      // Clean up test items
      await db.deleteFrom('accts.items').where('id', 'in', [999, 1000]).execute()
    })

    it('should insert new invoice items', async () => {
      await upsertInvoiceItems(testItems)

      const items = await db
        .selectFrom('accts.items')
        .selectAll()
        .where('id', 'in', [999, 1000])
        .execute()

      expect(items).toHaveLength(2)
      expect(items[0].code).toBe('TEST001')
      expect(items[1].code).toBe('TEST002')
    })

    it('should update existing invoice items', async () => {
      // Insert initial items
      await upsertInvoiceItems(testItems)

      // Update the items
      const updatedItems = testItems.map((item) => ({
        ...item,
        name: `${item.name} - Updated`,
      }))

      await upsertInvoiceItems(updatedItems)

      const items = await db
        .selectFrom('accts.items')
        .selectAll()
        .where('id', 'in', [999, 1000])
        .execute()

      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('Test Item 1 - Updated')
      expect(items[1].name).toBe('Test Item 2 - Updated')
    })

    it('should filter out items with missing required fields', async () => {
      const invalidItems: ItemListArticle[] = [
        {
          id: undefined,
          code: 'TEST003',
          name: 'Test Item 3',
        } as any,
        {
          id: 1001,
          code: undefined,
          name: 'Test Item 4',
        } as any,
        {
          id: 1002,
          code: 'TEST005',
          name: undefined,
        } as any,
      ]

      // Should not throw error, just filter out invalid items
      await expect(upsertInvoiceItems(invalidItems)).resolves.not.toThrow()

      const items = await db
        .selectFrom('accts.items')
        .selectAll()
        .where('id', 'in', [1001, 1002])
        .execute()

      expect(items).toHaveLength(0)
    })
  })

  describe('deleteInvoiceItem', () => {
    const testItemId = 9999

    beforeEach(async () => {
      // Insert a test item
      await db
        .insertInto('accts.items')
        .values({
          id: testItemId,
          code: 'TESTDELETE',
          name: 'Test Delete Item',
          item: {
            id: testItemId,
            code: 'TESTDELETE',
            name: 'Test Delete Item',
            unit: 'kpl',
            markup_value: 100,
            active: true,
            amount: 1,
            ean: '',
            contents: 'Test content',
            price_per_unit: 100,
            markup_type: 'fixed',
            is_inventory: false,
            sales_vat_type_id: 0,
            purchase_vat_type_id: 0,
          },
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()
    })

    afterEach(async () => {
      // Clean up
      await db.deleteFrom('accts.items').where('id', '=', testItemId).execute()
    })

    it('should delete an existing invoice item', async () => {
      await deleteInvoiceItem(testItemId)

      const item = await db
        .selectFrom('accts.items')
        .selectAll()
        .where('id', '=', testItemId)
        .executeTakeFirst()

      expect(item).toBeUndefined()
    })

    it('should not throw error when deleting non-existent item', async () => {
      const nonExistentId = 88888

      // The function checks result.length which will be 1 even if no rows deleted
      // So it won't throw an error
      await expect(deleteInvoiceItem(nonExistentId)).resolves.not.toThrow()
    })
  })

  describe('getRecurringFeesProcessing', () => {
    it('should return recurring fees processing records for annual_fee', async () => {
      const records = await getRecurringFeesProcessing('annual_fee')
      expect(records).toBeDefined()
      expect(Array.isArray(records)).toBe(true)
      records.forEach((record) => {
        expect(record.fee_type).toBe('annual_fee')
        expect(record).toHaveProperty('status')
        expect(record).toHaveProperty('year')
        expect(record).toHaveProperty('createdAt')
        expect(record).toHaveProperty('createdBy')
        expect(record).toHaveProperty('updatedAt')
        expect(record).toHaveProperty('updatedBy')
      })
    })

    it('should return recurring fees processing records for equipment_fee', async () => {
      const records = await getRecurringFeesProcessing('equipment_fee')
      expect(records).toBeDefined()
      expect(Array.isArray(records)).toBe(true)
      records.forEach((record) => {
        expect(record.fee_type).toBe('equipment_fee')
      })
    })

    it('should return records ordered by year descending', async () => {
      const records = await getRecurringFeesProcessing('annual_fee')
      if (records.length > 1) {
        for (let i = 0; i < records.length - 1; i++) {
          expect(records[i].year).toBeGreaterThanOrEqual(records[i + 1].year)
        }
      }
    })
  })
})
