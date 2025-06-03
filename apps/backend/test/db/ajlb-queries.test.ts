import { getAjlbs } from '../../src/db/ajlb-queries.ts'
import type { AjlbFilter } from '../../src/routes/ajlb/model.ts'

describe('Db query ajlb get tests', () => {
  it('should return all ajlbs', async () => {
    const result = await getAjlbs({})
    expect(result).toMatchSnapshot()
  })

  it('should return all current ajlbs', async () => {
    const result = await getAjlbs({ current: true })
    expect(result).toMatchSnapshot()
  })

  it('should return STL ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-STL',
    }

    const result = await getAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('should return IHQ ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-IHQ',
      seqNo: 1,
    }

    const result = await getAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('from date should return expected ajlbs', async () => {
    const filter: AjlbFilter = {
      fromDate: '2025-04-04',
    }

    const result = await getAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('too early date should return an empty array', async () => {
    const filter: AjlbFilter = {
      toDate: '2023-04-04',
    }

    const result = await getAjlbs(filter)
    expect(result).toEqual([])
  })
})
