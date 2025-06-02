import { jest } from '@jest/globals'

import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  createInvoice,
  createNewClient,
  getInvoice,
  getItemByCode,
  getOverdueInvoices,
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
  InvoiceFilter,
  InvoicePost,
} from '../../../src/services/simplbooks/models.ts'
import logger from '../../../src/lib/logger.ts'

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

  it('should get overdue invoices', async () => {
    const invoices = (await getOverdueInvoices('01-01-2023', '31-12-2023', 1, 50)) as any

    expect(invoices).toBeDefined()
    expect(invoices[0].id).toEqual(5787)
  })

  it('should get an item', async () => {
    const item = await getItemByCode('OH-IHQ')
    expect(item).toBeDefined()
  })

  it('should throw for an invalid invoices filter', async () => {
    const filter = {
      donald: 'duck',
    }

    await expect(searchInvoices(filter as ClientFilter)).rejects.toThrow()
  })

  it('should create an invoices', async () => {
    const invoice: InvoicePost = {
      Invoice: {
        overdue_charge_percent: 5,
        created: '2023-10-01',
        transaction_date: '2023-10-01',
        reference: 2023080122212,
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
    const badInvoice: InvoicePost = {
      Invoice: {
        overdue_charge_percent: 5,
        created: '2023-10-01',
        transaction_date: '2023-10-01',
        reference: 2025043012345,
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

describe('Test error handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should call handleApiError and log the correct error when axios fails with a known response shape', async () => {
    // Arrange: mock logger
    const loggerSpy = jest.spyOn(logger, 'error')

    // Arrange: mock Axios GET to throw an error
    const mockedError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          status: 400,
          errors: ['Invalid ID', 'Something else went wrong'],
        },
      },
    }
    jest.spyOn(simplbooksApiClient, 'get').mockRejectedValue(mockedError)

    // Act & Assert
    await expect(getInvoice(123)).rejects.toEqual(mockedError)

    // Assert logger was called with expected error message
    expect(loggerSpy).toHaveBeenCalledWith('API Error [400]: Invalid ID; Something else went wrong')
  })

  it('should log unexpected response format if errors is not an array', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')

    const mockedError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          status: 500,
          errors: 'Not an array',
        },
      },
    }

    jest.spyOn(simplbooksApiClient, 'get').mockRejectedValue(mockedError)

    await expect(getInvoice(456)).rejects.toEqual(mockedError)

    expect(loggerSpy).toHaveBeenCalledWith(
      'Unexpected error response format:',
      mockedError.response.data,
    )
  })

  it('should log unexpected error for non-Axios errors', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')

    const randomError = new Error('Some non-axios error')
    jest.spyOn(simplbooksApiClient, 'get').mockRejectedValue(randomError)

    await expect(getInvoice(789)).rejects.toThrow('Some non-axios error')

    expect(loggerSpy).toHaveBeenCalledWith('Unexpected error:', randomError)
  })
})
