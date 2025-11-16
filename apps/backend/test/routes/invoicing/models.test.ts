import { describe, it, expect } from '@jest/globals'
import { InvoiceItemQuerySchema, InvoiceTypeEnum } from '../../../src/routes/invoicing/models.ts'
import { MIKInvoiceType } from '../../../src/services/simplbooks/models.ts'

describe('InvoiceItemQuerySchema', () => {
  it('should parse valid full input', () => {
    const result = InvoiceItemQuerySchema.parse({
      startDate: '2025-06-01',
      endDate: '2025-06-30',
      status: 'paid',
      type: MIKInvoiceType.FLIGHT.toString(),
      pastDue: 'true',
      id: 123,
    })

    expect(result).toEqual({
      startDate: '2025-06-01',
      endDate: '2025-06-30',
      status: 'paid',
      type: InvoiceTypeEnum.enum.FLIGHT.toString(),
      pastDue: true,
      id: 123,
    })
  })

  it('should handle optional fields being omitted', () => {
    const result = InvoiceItemQuerySchema.parse({})
    expect(result).toEqual({})
  })

  it('should reject invalid status', () => {
    expect(() => InvoiceItemQuerySchema.parse({ status: 'pending' })).toThrow()
  })

  it('should reject invalid pastDue value', () => {
    expect(() => InvoiceItemQuerySchema.parse({ pastDue: 'yes' })).toThrow()
  })

  it('should reject invalid date strings', () => {
    expect(() => InvoiceItemQuerySchema.parse({ startDate: 'not-a-date' })).toThrow()
  })

  it('should transform type to uppercase and validate enum', () => {
    const result = InvoiceItemQuerySchema.parse({ type: 'ANNUAL_FEE' })
    expect(result.type).toBe(InvoiceTypeEnum.enum.ANNUAL_FEE.toString())
  })

  it('should reject invalid type not in enum', () => {
    expect(() => InvoiceItemQuerySchema.parse({ type: 'invalidType' })).toThrow()
  })

  it('should reject non-integer id', () => {
    expect(() => InvoiceItemQuerySchema.parse({ id: 1.5 })).toThrow()
  })
})
