import { getAllAjlbs, getCurrentAjlbs, getFilteredAjlbs } from '../../src/db/ajlb-queries.ts'
import type { AjlbFilter } from '../../src/routes/ajlb/model.ts'

describe('Db query ajlb get tests', () => {
  it('getAllAjlbs should return all ajlbs', async () => {
    const result = await getAllAjlbs()
    expect(result).toMatchSnapshot()
  })

  it('getCurrentAjlbs should return all current ajlbs', async () => {
    const result = await getCurrentAjlbs()
    expect(result).toMatchSnapshot()
  })

  it('getFilteredAjlbs should return STL ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-STL',
    }

    const result = await getFilteredAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('getFilteredAjlbs should return IHQ ajlbs', async () => {
    const filter: AjlbFilter = {
      aircraftRegistration: 'OH-IHQ',
      seqNo: 1,
    }

    const result = await getFilteredAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('getFilteredAjlbs for date should return expected ajlbs', async () => {
    const filter: AjlbFilter = {
      fromDate: '2025-04-04',
    }

    const result = await getFilteredAjlbs(filter)
    expect(result).toMatchSnapshot()
  })

  it('getFilteredAjlbs for too early date should return an empty array', async () => {
    const filter: AjlbFilter = {
      toDate: '2023-04-04',
    }

    const result = await getFilteredAjlbs(filter)
    expect(result).toEqual([])
  })
})
