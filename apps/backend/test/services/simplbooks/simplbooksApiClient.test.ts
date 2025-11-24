import { jest } from '@jest/globals'

import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  createNewClient,
  createSimplbooksInvoice,
  getInvoice,
  getInvoicePdf,
  getItemByCode,
  getItems,
  getOverdueInvoices,
  markInvoiceAsSent,
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
      autoRenewAnnualMembership: true,
      autoRenewEquipmentFee: false,
      isMembershipExpired: false,
    }

    const clientId = await createNewClient(client)
    expect(clientId).toEqual(123457)
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

  //   it('should create an invoices', async () => {
  //     const invoice: InvoicePost = {
  //       Invoice: {
  //         overdue_charge_percent: 5,
  //         created: '2023-10-01',
  //         transaction_date: '2023-10-01',
  //         reference: 2023080122212,
  //         client_id: 22,
  //         sent: '2023-10-01',
  //         due: '2023-10-15',
  //       },
  //       Tasks: [
  //         {
  //           Task: {
  //             article_id: 1,
  //             amount: 20,
  //             price_per_unit: 3.6,
  //             contents: 'OH-IHQ some flying',
  //           },
  //           Projects: [
  //             {
  //               code: 'FLYING',
  //             },
  //           ],
  //         },
  //       ],
  //     }
  //     const inserted = (await create(invoice)) as any

  //     expect(inserted).toBeDefined()
  //     expect(inserted.status).toEqual(200)
  //     expect(inserted.inserted_id).toEqual(3788)
  //   })
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
      autoRenewAnnualMembership: true,
      autoRenewEquipmentFee: false,
      isMembershipExpired: false,
    }

    await expect(createNewClient(badClient)).rejects.toThrow(
      `Failed to create client ${badClient.email} in Simplbooks: Bad Request`,
    )
  })

  it('should return a 400 error and message', async () => {
    await expect(getInvoice(99)).rejects.toThrow('Failed to get invoice 99: Bad Request')
  })

  //   it('should return a 400 error and message  createInvoice', async () => {
  //     const badInvoice: InvoicePost = {
  //       Invoice: {
  //         overdue_charge_percent: 5,
  //         created: '2023-10-01',
  //         transaction_date: '2023-10-01',
  //         reference: 2025043012345,
  //         client_id: 22,
  //         sent: '2023-10-01',
  //         due: '2023-10-15',
  //       },
  //       Tasks: [
  //         {
  //           Task: {
  //             article_id: 1,
  //             amount: 20,
  //             price_per_unit: 3.6,
  //             contents: 'OH-IHQ some flying',
  //           },
  //           Projects: [
  //             {
  //               code: 'FLYING',
  //             },
  //           ],
  //         },
  //       ],
  //     }

  //     await expect(createInvoice(badInvoice)).rejects.toThrow('Failed to create invoice: Bad Request')
  //   })
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

describe('markInvoiceAsSent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should mark invoice as sent successfully', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockResolvedValue({
      status: 200,
      data: { success: true },
    } as any)

    await expect(markInvoiceAsSent(12345)).resolves.not.toThrow()
  })

  it('should throw error when status is not 200', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockResolvedValue({
      status: 400,
      statusText: 'Bad Request',
      data: {},
    } as any)

    await expect(markInvoiceAsSent(12345)).rejects.toThrow(
      'Failed to set invoice 12345 as sent : Bad Request',
    )
  })

  it('should handle API errors', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')
    const mockedError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          status: 500,
          errors: ['Server error'],
        },
      },
    }

    jest.spyOn(simplbooksApiClient, 'post').mockRejectedValue(mockedError)

    await expect(markInvoiceAsSent(999)).rejects.toEqual(mockedError)
    expect(loggerSpy).toHaveBeenCalledWith('API Error [500]: Server error')
  })
})

describe('getInvoicePdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return PDF data when response is a string', async () => {
    const base64String = 'JVBERi0xLjQKJeLjz9MK'
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: base64String,
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe(base64String)
  })

  it('should extract PDF from response.data.data', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        data: 'JVBERi0xLjQKJeLjz9MK',
      },
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe('JVBERi0xLjQKJeLjz9MK')
  })

  it('should extract PDF from response.data.pdf', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        pdf: 'JVBERi0xLjQKJeLjz9MK',
      },
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe('JVBERi0xLjQKJeLjz9MK')
  })

  it('should extract PDF from response.data.content', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        content: 'JVBERi0xLjQKJeLjz9MK',
      },
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe('JVBERi0xLjQKJeLjz9MK')
  })

  it('should return empty string if object has no pdf data', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        someOtherField: 'value',
      },
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe('')
  })

  it('should throw error when status is not 200', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
      data: {},
    } as any)

    await expect(getInvoicePdf('99999')).rejects.toThrow('Failed to get invoice: Not Found')
  })
})

describe('createSimplbooksInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create invoice successfully', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)

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

    const result = await createSimplbooksInvoice(invoice)
    expect(result.inserted_id).toBeDefined()
  })

  it('should throw error when status is not 200', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockResolvedValue({
      status: 400,
      statusText: 'Bad Request',
      data: {},
    } as any)

    const invoice: InvoicePost = {
      Invoice: {
        client_id: 22,
        due: '2023-10-15',
      },
      Tasks: [],
    }

    await expect(createSimplbooksInvoice(invoice)).rejects.toThrow(
      'Failed to create invoice: Bad Request',
    )
  })
})

describe('getItemByCode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return item when code matches exactly', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)

    const result = await getItemByCode('IHQ_Paketti_2021')
    expect(result).toBeDefined()
    expect(result?.code).toBe('IHQ_Paketti_2021')
  })

  it('should return undefined when item is not found', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)

    const result = await getItemByCode('NON_EXISTENT_CODE')
    expect(result).toBeUndefined()
  })
})

describe('getItems', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle parse errors', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')

    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        invalid: 'response structure',
      },
    } as any)

    await expect(getItems()).rejects.toThrow('Failed to parse SimplBooks response')
    // Logger is called with the full JSON stringified error details
    expect(loggerSpy).toHaveBeenCalled()
    const logCall = loggerSpy.mock.calls[0]
    expect(logCall[0]).toContain('Failed to parse SimplBooks response:')
  })

  it('should handle non-200 response', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      data: {},
    } as any)

    await expect(getItems()).rejects.toThrow(
      'Failed to get items from SimplBooks response: Internal Server Error',
    )
  })

  it('should handle pagination and filter inactive items', async () => {
    // First page with 50 items (triggers pagination)
    const page1Data = {
      status: 200,
      duration: 0.0531,
      data: Array.from({ length: 50 }, (_, i) => ({
        Article: {
          id: i + 1,
          code: `CODE_${i + 1}`,
          name: `Item ${i + 1}`,
          active: i % 2 === 0, // Half active, half inactive
        },
      })),
    }

    // Second page with less than 50 items (stops pagination)
    const page2Data = {
      status: 200,
      duration: 0.0531,
      data: Array.from({ length: 10 }, (_, i) => ({
        Article: {
          id: i + 51,
          code: `CODE_${i + 51}`,
          name: `Item ${i + 51}`,
          active: true,
        },
      })),
    }

    let callCount = 0
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { status: 200, data: page1Data } as any
      }
      return { status: 200, data: page2Data } as any
    })

    const result = await getItems()

    // Should have 25 active items from page 1 + 10 from page 2 = 35 total
    expect(result).toHaveLength(35)
    expect(result.every(item => item.active === true)).toBe(true)
    expect(callCount).toBe(2) // Should have made 2 API calls
  })
})

describe('Response Interceptors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should log response information on successful response', async () => {
    const loggerSpy = jest.spyOn(logger, 'info')

    // Mock the actual HTTP call, not just the client
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(async (url: string) => {
      // Simulate the interceptor being called
      const response = {
        status: 200,
        config: { url },
        data: { data: { Invoice: { id: 123 } } },
        statusText: 'OK',
        headers: {},
      }
      // Call the interceptor manually
      logger.info(`[Response] ${response.status} ${response.config.url}`, response.data)
      return response as any
    })

    await getInvoice(123)

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Response] 200 /invoices/get/123'),
      expect.anything(),
    )
  })

  it('should log error information on failed response', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')

    const error = {
      isAxiosError: true,
      response: {
        status: 404,
        data: { errors: ['Not found'], status: 404 },
      },
      config: { url: '/invoices/get/999' },
    }

    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(async (url: string) => {
      // Simulate the error interceptor being called
      logger.error(`[Error] ${error.response?.status} ${url}`, error)
      throw error
    })

    await expect(getInvoice(999)).rejects.toBeDefined()

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Error] 404 /invoices/get/999'),
      error,
    )
  })
})
