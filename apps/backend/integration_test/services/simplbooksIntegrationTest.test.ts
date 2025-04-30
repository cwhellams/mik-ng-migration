import { MIKMemberTypes, type Member } from '../../src/routes/members/models.ts'
import type { ClientFilter, Invoice, InvoiceFilter } from '../../src/services/simplbooks/models.ts'
import {
  createInvoice,
  createNewClient,
  getInvoice,
  searchClient,
  searchInvoices,
} from '../../src/services/simplbooks/simplbooksApiClient.ts'

describe('Simplebooks API Tests', () => {
  it('should create a new client', async () => {
    const client: Member = {
      memberId: 'abc123',
      memberType: MIKMemberTypes.FLYING,
      firstName: 'John',
      lastName: 'Doe',
      streetAddress: '123 Main St',
      townCity: 'Helsinki',
      postcode: '00100',
      email: 'mickey@mik.fi',
      isTrainingProgramPilot: false,
      canMakeReservations: true,
      memberSince: '2023-01-01',
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: [],
    }

    const clientId = await createNewClient(client)

    expect(clientId).toBeDefined()
    expect(clientId).toBeGreaterThanOrEqual(0)
  })

  it('should search for a client', async () => {
    const filter: ClientFilter = {
      id: 22,
      name: 'John Doe',
      e_mail: 'mickey@mik.fi',
    }

    const data = (await searchClient(filter)) as any

    expect(data).toBeDefined()
    expect(data.status).toEqual(200)
  })

  it('should get an invoice', async () => {
    const data = (await getInvoice(3055)) as any

    expect(data).toBeDefined()
    expect(data.status).toEqual(200)
  })

  it('should get invoices using filter', async () => {
    const filter: InvoiceFilter = {
      created_from: '01-01-2023',
      created_until: '31-12-2023',
    }
    const data = (await searchInvoices(filter)) as any

    expect(data).toBeDefined()
    expect(data.status).toEqual(200)
  })

  it('should create an invoices', async () => {
    const invoice: Invoice = {
      Invoice: {
        overdue_charge_percent: 5,
        created: '2023-10-01',
        transaction_date: '2023-10-01',
        reference: 'Test Invoice',
        client_id: 22,
        sent: '2023-10-01',
        due: '2023-10-15',
      },
      Tasks: [
        {
          Task: {
            article_id: 1,
            amount: 20,
            price_per_unit: 3.6,
            contents: 'OH-IHQ some flying',
          },
          Projects: [
            {
              code: 'FLYING',
            },
          ],
        },
      ],
    }
    const data = (await createInvoice(invoice)) as any

    expect(data).toBeDefined()
    expect(data.status).toEqual(200)
  })
})
