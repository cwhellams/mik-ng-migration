// SimplBooks API types based on https://app.simplbooks.com/api-documentation/#tag/Clients

export interface SimplBooksClient {
  id: number
  name: string
  reg_no: string | null
  vat_no: string | null
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_county: string | null
  address_country: string | null
  webpage: string | null
  e_mail: string | null
  phone: string | null
  fax: string | null
  account_no: string | null
  bank: string | null
  swift_code: string | null
}

// API wraps each client in a "Client" object
export interface SimplBooksClientWrapper {
  Client: SimplBooksClient
}

export interface SimplBooksListResponse<T> {
  status: number
  duration: number
  data: T[]
}
