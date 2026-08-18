import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { hasBlankReportedRemark, submitReportedRemarks } from './reportRemarksApi'

describe('hasBlankReportedRemark', () => {
  it('is false for an empty list', () => {
    expect(hasBlankReportedRemark([])).toBe(false)
  })

  it('is false for untouched and filled-in rows', () => {
    expect(hasBlankReportedRemark(['', 'Oil stain on the ramp'])).toBe(false)
  })

  it('is true for a row that is only whitespace', () => {
    expect(hasBlankReportedRemark(['   '])).toBe(true)
  })
})

describe('submitReportedRemarks', () => {
  it('posts one remark per non-blank, trimmed description', async () => {
    const posted: unknown[] = []
    server.use(
      http.post(apiUrl('v1/remarks'), async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({})
      }),
    )

    await submitReportedRemarks('fi_inst1', ['  Oil stain on the ramp  ', '', '   '])

    expect(posted).toEqual([{ flightId: 'fi_inst1', description: 'Oil stain on the ramp' }])
  })

  it('does nothing when every description is blank', async () => {
    let called = false
    server.use(
      http.post(apiUrl('v1/remarks'), () => {
        called = true
        return HttpResponse.json({})
      }),
    )

    await submitReportedRemarks('fi_inst1', [])

    expect(called).toBe(false)
  })
})
