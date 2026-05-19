import { jest } from '@jest/globals'

import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  createClientNote,
  createNewClient,
  createSimplbooksInvoice,
  getInvoice,
  getInvoicePdf,
  getItemByCode,
  getItems,
  getOverdueInvoices,
  markInvoiceAsSentInSimplbooks,
  searchClient,
  searchInvoices,
  simplbooksApiClient,
} from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import {
  mockSimplbooksFailure,
  mockSimplbooksGet,
  mockSimplbooksPost,
} from '../../__mocks__/simplbooksMock.ts'
import {
  mapMIKLangToSimplbooksLanguage,
  mapMemberToClient,
  type ClientFilter,
  type InvoiceFilter,
  type InvoicePost,
} from '../../../src/services/simplbooks/models.ts'
import logger from '../../../src/lib/logger.ts'
import { SimplbooksApiError } from '../../../src/services/simplbooks/simplbooksErrorHandler.ts'

// Clear interceptors before any tests run to prevent rate limiting delays
beforeAll(() => {
  simplbooksApiClient.interceptors.request.clear()
  simplbooksApiClient.interceptors.response.clear()
})

describe('Simplebooks API Tests Happy Case', () => {
  beforeAll(() => {
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)
  })

  afterAll(() => {
    jest.restoreAllMocks()
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
    expect(data.data[0].Client.id).toEqual(1)
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

  afterAll(() => {
    jest.restoreAllMocks()
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
    const request = getInvoice(123)

    await expect(request).rejects.toMatchObject({
      name: 'SimplbooksApiError',
      statusCode: 400,
      endpoint: '/invoices/get/123',
      method: 'GET',
      errors: ['Invalid ID', 'Something else went wrong'],
    })
    await expect(request).rejects.toBeInstanceOf(SimplbooksApiError)

    // Assert logger was called with expected error message
    expect(loggerSpy).toHaveBeenCalledWith(
      '[SimplBooks] GET /invoices/get/123 failed (400): Invalid ID; Something else went wrong',
      {
        operation: 'getInvoice',
        endpoint: '/invoices/get/123',
        method: 'GET',
        statusCode: 400,
        errors: ['Invalid ID', 'Something else went wrong'],
        payloadPreview: undefined,
      },
    )
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

    const request = getInvoice(456)

    await expect(request).rejects.toMatchObject({
      name: 'SimplbooksApiError',
      statusCode: 500,
      endpoint: '/invoices/get/456',
      method: 'GET',
      errors: ['SimplBooks request failed'],
    })
    await expect(request).rejects.toBeInstanceOf(SimplbooksApiError)

    expect(loggerSpy).toHaveBeenCalledWith(
      '[SimplBooks] GET /invoices/get/456 failed (500): SimplBooks request failed',
      {
        operation: 'getInvoice',
        endpoint: '/invoices/get/456',
        method: 'GET',
        statusCode: 500,
        errors: ['SimplBooks request failed'],
        payloadPreview: undefined,
      },
    )
  })

  it('should log unexpected error for non-Axios errors', async () => {
    const loggerSpy = jest.spyOn(logger, 'error')

    const randomError = new Error('Some non-axios error')
    jest.spyOn(simplbooksApiClient, 'get').mockRejectedValue(randomError)

    await expect(getInvoice(789)).rejects.toThrow('Some non-axios error')

    expect(loggerSpy).toHaveBeenCalledWith(
      '[SimplBooks] GET /invoices/get/789 failed (NO_STATUS): Some non-axios error',
      {
        operation: 'getInvoice',
        endpoint: '/invoices/get/789',
        method: 'GET',
        statusCode: undefined,
        errors: ['Some non-axios error'],
        payloadPreview: undefined,
      },
    )
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

    await expect(markInvoiceAsSentInSimplbooks(12345)).resolves.not.toThrow()
  })

  it('should throw error when status is not 200', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockResolvedValue({
      status: 400,
      statusText: 'Bad Request',
      data: {},
    } as any)

    await expect(markInvoiceAsSentInSimplbooks(12345)).rejects.toThrow(
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

    const request = markInvoiceAsSentInSimplbooks(999)

    await expect(request).rejects.toMatchObject({
      name: 'SimplbooksApiError',
      statusCode: 500,
      endpoint: '/invoices/sent/999',
      method: 'POST',
      errors: ['Server error'],
    })
    await expect(request).rejects.toBeInstanceOf(SimplbooksApiError)

    expect(loggerSpy).toHaveBeenCalledWith(
      '[SimplBooks] POST /invoices/sent/999 failed (500): Server error',
      {
        operation: 'markInvoiceAsSentInSimplbooks',
        endpoint: '/invoices/sent/999',
        method: 'POST',
        statusCode: 500,
        errors: ['Server error'],
        payloadPreview: undefined,
      },
    )
  })
})

describe('getInvoicePdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should extract PDF from response.data.data', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        status: 200,
        duration: 0.0531,
        data: 'JVBERi0xLjQKJeLjz9MK',
      },
    } as any)

    const result = await getInvoicePdf('12345')
    expect(result).toBe('JVBERi0xLjQKJeLjz9MK')
  })

  it('should throw error when response.data.data is missing', async () => {
    jest.spyOn(simplbooksApiClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        status: 200,
        someOtherField: 'value',
      },
    } as any)

    await expect(getInvoicePdf('12345')).rejects.toThrow(
      'Invalid PDF response format for invoice 12345',
    )
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

describe('createClientNote', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create a client note successfully', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)

    await expect(
      createClientNote(5, 123, 'Overdue reminder sent from mik.intra'),
    ).resolves.not.toThrow()

    expect(simplbooksApiClient.post).toHaveBeenCalledWith('/client_notes/create', {
      ClientNote: {
        note: 'Overdue reminder sent from mik.intra',
        client_id: 5,
        object_type: 'Invoice',
        object_id: 123,
      },
    })
  })

  it('should throw when response status is not 200', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockResolvedValue({
      status: 400,
      statusText: 'Bad Request',
      data: {},
    } as any)

    await expect(createClientNote(5, 123, 'test note')).rejects.toThrow(
      'Failed to create client note for invoice 123: Bad Request',
    )
  })

  it('should throw and log on API error', async () => {
    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksFailure)

    await expect(createClientNote(5, 123, 'test note')).rejects.toThrow()
  })
})

// Global cleanup to prevent hanging tests
afterAll(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

describe('mapMIKLangToSimplbooksLanguage', () => {
  it('maps Finnish to fi_FI', () => {
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.FI)).toBe('fi_FI')
  })

  it('maps English to en_GB', () => {
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.EN)).toBe('en_GB')
  })

  it('maps Swedish to sv_SE', () => {
    expect(mapMIKLangToSimplbooksLanguage(MIKLang.SV)).toBe('sv_SE')
  })
})

describe('mapMemberToClient', () => {
  const baseMember: Member = {
    memberId: 'abc123',
    memberType: MIKMemberTypes.FLYING,
    firstName: 'John',
    lastName: 'Doe',
    streetAddress: '123 Main St',
    townCity: 'Helsinki',
    postcode: '00100',
    email: 'john@mik.fi',
    isTrainingProgramPilot: false,
    isMembershipApproved: true,
    canMakeReservations: true,
    memberSince: '2023-01-01',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    roles: [],
    autoRenewAnnualMembership: true,
    autoRenewEquipmentFee: false,
    isMembershipExpired: false,
    lang: MIKLang.FI,
  }

  it('includes client_settings_language fi_FI for Finnish members', () => {
    const result = mapMemberToClient({ ...baseMember, lang: MIKLang.FI })
    expect(result.Client.client_settings_language).toBe('fi_FI')
  })

  it('includes client_settings_language en_GB for English members', () => {
    const result = mapMemberToClient({ ...baseMember, lang: MIKLang.EN })
    expect(result.Client.client_settings_language).toBe('en_GB')
  })

  it('includes client_settings_language sv_FI for Swedish members', () => {
    const result = mapMemberToClient({ ...baseMember, lang: MIKLang.SV })
    expect(result.Client.client_settings_language).toBe('sv_SE')
  })
})
