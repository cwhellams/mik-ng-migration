import { jest } from '@jest/globals'

import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  createInvoice,
  createNewClient,
  getInvoice,
  searchClient,
  searchInvoices,
  simplbooksApiClient,
} from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import {
  mockSimplbooksFailure,
  mockSimplbooksGet,
  mockSimplbooksPost,
} from '../../__mocks__/simplbooksMock.ts'
import type {
  ClientFilter,
  Invoice,
  InvoiceFilter,
} from '../../../src/services/simplbooks/models.ts'

describe('Simplebooks API Tests Happy Case', () => {
  beforeAll(() => {
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)
  })

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
      isMembershipApproved: false,
      canMakeReservations: true,
      lang: MIKLang.FI,
      memberSince: '2023-01-01',
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: [],
    }

    const clientId = await createNewClient(client)
    expect(clientId).toEqual(123456)
  })

  it('should search for a client', async () => {
    const filter: ClientFilter = {
      id: 1,
      name: 'David Beckham',
      e_mail: 'mickey@mik.fi',
    }

    const data = (await searchClient(filter)) as any

    expect(data).toBeDefined()
    expect(data[0].Client.id).toEqual(1)
  })

  it('should throw for an invalid client search Filter', async () => {
    const filter = {
      find_field: 'invalid_field',
    }

    await expect(searchClient(filter as ClientFilter)).rejects.toThrow()
  })

  it('should get an invoice', async () => {
    const invoice = (await getInvoice(3055)) as any

    expect(invoice.data.Invoice).toBeDefined()
    expect(invoice.data.Invoice.id).toEqual(3055)
  })

  it('should get invoices using filter', async () => {
    const filter: InvoiceFilter = {
      created_from: '01-01-2023',
      created_until: '31-12-2023',
    }
    const invoices = (await searchInvoices(filter)) as any

    expect(invoices).toBeDefined()
    expect(invoices.status).toEqual(200)
    expect(invoices.data[0].invoices.id).toEqual(5787)
  })

  it('should throw for an invalid invoices filter', async () => {
    const filter = {
      donald: 'duck',
    }

    await expect(searchInvoices(filter as ClientFilter)).rejects.toThrow()
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
    const inserted = (await createInvoice(invoice)) as any

    expect(inserted).toBeDefined()
    expect(inserted.status).toEqual(200)
    expect(inserted.inserted_id).toEqual(3788)
  })
})

describe('Simplebooks API Tests Error Case', () => {
  beforeAll(() => {
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksFailure)
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksFailure)
  })

  it('should return 400 creating a new client', async () => {
    const badClient: Member = {
      memberId: 'abc123',
      memberType: MIKMemberTypes.FLYING,
      firstName: 'John',
      lastName: 'Doe',
      streetAddress: '123 Main St',
      townCity: 'Helsinki',
      postcode: '00100',
      email: 'mickey@mik.fi',
      isTrainingProgramPilot: false,
      isMembershipApproved: false,
      canMakeReservations: true,
      lang: MIKLang.EN,
      memberSince: '2023-01-01',
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: [],
    }

    await expect(createNewClient(badClient)).rejects.toThrow('Failed to create client: Bad Request')
  })

  it('should return a 400 error and message', async () => {
    await expect(getInvoice(99)).rejects.toThrow('Failed to get invoice: Bad Request')
  })

  it('should return a 400 error and message  createInvoice', async () => {
    const badInvoice: Invoice = {
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

    await expect(createInvoice(badInvoice)).rejects.toThrow('Failed to create invoice: Bad Request')
  })
})
