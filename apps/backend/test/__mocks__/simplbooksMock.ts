import type { AxiosResponse } from 'axios'

const ZERO_DATE = '0000-00-00'

export function mockSimplbooksPost(url: string, data?: any): Promise<AxiosResponse> {
  if (url === '/invoices/create') {
    return Promise.resolve({
      data: {
        status: 200,
        duration: 0.0531,
        inserted_id: 3788,
        response: 'New entry saved.',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }
  if (url === '/clients/create') {
    return Promise.resolve({
      data: {
        status: 200,
        duration: 0.0531,
        inserted_id: 123456,
        response: 'New entry saved.',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }
  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}

export function mockSimplbooksGet(url: string, data?: any): Promise<AxiosResponse> {
  if (url === '/articles/list') {
    return Promise.resolve({
      data: [
        {
          Article: {
            id: 12,
            code: 'OH-IHQ',
            ean: '4740123456789',
            name: 'OH-IHQ Flying',
            contents: 'Test content',
            unit: 'pcs',
            amount: 1,
            price_per_unit: 24.99,
            sum_with_vat: 0,
            markup_value: 0,
            markup_type: 'none',
            is_inventory: true,
            active: true,
            sales_vat_type_id: 2,
            purchase_vat_type_id: 3,
            remnant: {
              '1': 557,
              '2': 12,
              '3': -22,
            },
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      duration: 0.02,
      headers: {},
      config: {} as any,
    })
  }

  if (url === '/clients/list') {
    return Promise.resolve({
      data: [
        {
          Client: {
            id: 1,
            name: 'David Beckham',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }

  if (url.startsWith('/invoices/get/')) {
    const invoiceId = url.split('/').pop()
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,

      data: {
        status: 200,
        duration: 0.0531,
        data: {
          Invoice: {
            id: Number(invoiceId),
            client_id: 123,
            client_name: 'SimplBooks OÜ',
            client_reg_no: '12213296',
            due: '2025-05-01',
          },
          Task: [
            {
              id: 0,
              warehouse_id: 1,
              article_id: 2,
              code: 'OH-STL',
              name: 'Diamond Da40 ground bus',
              contents: 'Nice to look at, never flies',
              unit: 'mins',
              amount: 10,
              price_per_unit: 3.5,
              worker: 'Admin',
              vat: 0,
              vat_type_id: 5,
              discount: 15,
              income_account_id: 3,
            },
          ],
        },
      },
    })
  }

  if (url.endsWith('/invoices/list')) {
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,

      data: {
        status: 200,
        duration: 0.0531,
        data: [
          {
            invoices: {
              id: 5787,
              client_id: 123,
              client_name: 'SimplBooks OÜ',
              paid: ZERO_DATE,
              due: '2023-06-01',
            },
          },
        ],
      },
    })
  }
  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}

export function mockSimplbooksFailure(url: string, data?: any): Promise<AxiosResponse> {
  return Promise.resolve({
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {} as any,
    data: {
      status: 400,
      duration: 0.0531,
      errors: ['Dummy error msg.'],
    },
  })
}
