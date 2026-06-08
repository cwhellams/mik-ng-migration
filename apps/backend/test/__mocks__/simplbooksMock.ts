import type { AxiosResponse } from 'axios'

const ZERO_DATE = '0000-00-00'

// Counter for generating unique IDs
let invoiceIdCounter = 3788
let clientIdCounter = 123456

export function resetSimplbooksMockCounters() {
  invoiceIdCounter = 3788
  clientIdCounter = 123456
}

export function mockSimplbooksPost(url: string, data?: any): Promise<AxiosResponse> {
  if (url === '/invoices/create') {
    return Promise.resolve({
      data: {
        status: 200,
        duration: 0.0531,
        inserted_id: ++invoiceIdCounter,
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
        inserted_id: ++clientIdCounter,
        response: 'New entry saved.',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }
  if (url === '/client_notes/create') {
    return Promise.resolve({
      data: {
        status: 200,
        duration: 0.0531,
        inserted_id: 1,
        response: 'New entry saved.',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }
  if (url === '/clients/update') {
    return Promise.resolve({
      data: {
        status: 200,
        duration: 0.0531,
        response: 'Entry updated.',
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
      status: 200,
      statusText: 'OK',
      duration: 0.0058,
      headers: {},
      config: {} as any,
      data: {
        status: 200,
        duration: 0.0531,
        inserted_id: 123456,
        data: [
          {
            Article: {
              id: 52,
              code: 'SRH_Paketti_2021',
              ean: '',
              amount: 1,
              price_per_unit: 0,
              sum_with_vat: false,
              sales_vat_type_id: 0,
              purchase_vat_type_id: 0,
              markup_value: 945,
              markup_type: 'fixed',
              is_inventory: false,
              active: true,
              name: 'SRH Paketti 2021',
              contents: '5 tunnin ennakkotuntipaketti koneelle OH-SRH',
              unit: 'kpl',
            },
          },
          {
            Article: {
              id: 53,
              code: 'IHQ_Paketti_2021',
              ean: '',
              amount: 1,
              price_per_unit: 0,
              sum_with_vat: false,
              sales_vat_type_id: 0,
              purchase_vat_type_id: 0,
              markup_value: 645,
              markup_type: 'fixed',
              is_inventory: false,
              active: true,
              name: 'IHQ Paketti 2021',
              contents: '5 tunnin ennakkotuntipaketti koneelle OH-IHQ',
              unit: 'kpl',
            },
          },
          {
            Article: {
              id: 54,
              code: 'JASEN',
              ean: '',
              amount: 1,
              price_per_unit: 0,
              sum_with_vat: false,
              sales_vat_type_id: 0,
              purchase_vat_type_id: 0,
              markup_value: 85,
              markup_type: 'fixed',
              is_inventory: false,
              active: true,
              name: 'MIK Jäsenmaksu',
              contents: '',
              unit: 'kpl',
            },
          },
          {
            Article: {
              id: 55,
              code: 'LIITTYMINEN',
              ean: '',
              amount: 1,
              price_per_unit: 0,
              sum_with_vat: false,
              sales_vat_type_id: 0,
              purchase_vat_type_id: 0,
              markup_value: 125,
              markup_type: 'fixed',
              is_inventory: false,
              active: true,
              name: 'MIK joining fee',
              contents: '',
              unit: 'kpl',
            },
          },
          {
            Article: {
              id: 56,
              code: 'OH-IHQ',
              ean: '',
              amount: 1,
              price_per_unit: 0,
              sum_with_vat: false,
              sales_vat_type_id: 0,
              purchase_vat_type_id: 0,
              markup_value: 3.25,
              markup_type: 'fixed',
              is_inventory: false,
              active: true,
              name: 'OH-IHQ per min',
              contents: '',
              unit: 'kpl',
            },
          },
        ],
      },
    })
  }

  if (url === '/clients/list') {
    // Return the known test client only when searching by the known test email.
    // All other email lookups simulate a new/unknown member (no existing client).
    // Note: axios config is passed as second arg, so filter is nested as data.data
    const hasKnownEmail = data?.data?.e_mail === 'mickey@mik.fi'
    return Promise.resolve({
      data: {
        status: 200,
        data: hasKnownEmail ? [{ Client: { id: 1, name: 'David Beckham' } }] : [],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }

  if (url.startsWith('/invoices/get/')) {
    const invoiceId = url.split('/').pop()

    // Support different invoice states for testing
    // Invoice IDs ending in specific patterns return specific payment states:
    // - ends with '1': paid
    // - ends with '2': unpaid (empty string)
    // - ends with '3': unpaid (zero date)
    const lastDigit = invoiceId?.charAt(invoiceId.length - 1)

    let paidValue = ZERO_DATE
    if (lastDigit === '1') {
      paidValue = '2024-11-27' // Paid invoice
    } else if (lastDigit === '2') {
      paidValue = '' // Unpaid (empty)
    } else if (lastDigit === '3') {
      paidValue = ZERO_DATE // Unpaid (zero date)
    }

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
            paid: paidValue,
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
