import type { InvoiceMember } from '@mik/contracts/members'
import type { InvoicePostPayload } from '../simplbooks/models.ts'

export const createInvoicePostPayload = (
  member: InvoiceMember,
  withZeroInterest: boolean = false,
): InvoicePostPayload => {
  if (!member.billingId)
    throw new Error('Error creating membership fee invoice, no billing id for member !')
  const client_id = Number.parseInt(member.billingId, 10)
  const invoice: InvoicePostPayload = {
    ...(withZeroInterest && { overdue_charge_percent: 0 }),
    client_id: client_id,
  }

  return invoice
}
