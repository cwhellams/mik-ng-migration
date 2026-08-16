import * as connection from './connection.ts'

export interface Airfield {
  ident: string
  name: string | null
  country: string | null
}

// No filter argument: the caller (GET /flight-log/airfields) has no :registration
// route param, so the string it used to pass was always undefined — and this
// function ignored it regardless. The endpoint returns the whole static list.
export async function getAirfields(): Promise<Airfield[]> {
  const results = await connection.db.selectFrom('static.airfields').selectAll().execute()

  return results.map((field) => ({
    ident: field.ident,
    name: field.name,
    country: field.isoCountry,
  }))
}
