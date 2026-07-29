import 'dotenv/config'

import { getAirfields } from '../../src/db/airfields-queries.ts'

describe('Db query Get aircrafts tests', () => {
  it('getAirfields returns all airfields in the db', async () => {
    const result = await getAirfields('')
    expect(result.length).toEqual(103)
    expect(result).toMatchSnapshot()
  })
})
