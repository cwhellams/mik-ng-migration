import * as connection from './connection.ts'

export async function getAirfields(query: string): Promise<any> {
  const results = await connection.db.selectFrom('static.airfields').selectAll().execute()

  return results.map(field => ({
    ident: field.ident,
    name: field.name,
    country: field.iso_country,
  }))
}
