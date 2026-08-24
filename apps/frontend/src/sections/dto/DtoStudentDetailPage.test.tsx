import type { StudentProgressDetail } from '@mik/ui/api/dtoApi'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import DtoStudentDetailPage from './DtoStudentDetailPage'

/**
 * `dto.detail.verifiedBy` interpolates the verifying instructor's name. Issue
 * #1255: i18next escaped the interpolated value, so an instructor called
 * `O'Brien` was credited as `O&#39;Brien`.
 *
 * The page's payload nests a whole syllabus inside a member assignment; this
 * builds the minimum that reaches the verified-by caption and casts the rest,
 * following the same shortcut the other admin-page suites take.
 */
const MEMBER_SYLLABUS_ID = 'd1b2c3d4-0000-4000-8000-000000000001'
const FLIGHT_ID = 'd1b2c3d4-0000-4000-8000-000000000002'

const detail = (verifierName: string) =>
  ({
    memberSyllabus: {
      memberSyllabusId: MEMBER_SYLLABUS_ID,
      memberName: 'Matti Virtanen',
      syllabusDetail: {
        version: '1.0',
        flights: [{ flightId: FLIGHT_ID, code: 'EX1', name: 'Familiarisation', items: [] }],
      },
    },
    attemptsWithOutcomes: [
      {
        attemptId: 'd1b2c3d4-0000-4000-8000-000000000003',
        syllabusFlightId: FLIGHT_ID,
        verificationResult: 'APPROVED',
        verifiedAt: '2026-05-04T09:00:00.000Z',
        verifiedBy: '1002',
        verifierName,
        requiresReverification: false,
        itemOutcomes: [],
      },
    ],
    hilItems: [],
  }) as unknown as StudentProgressDetail

const dtoApi = (verifierName: string) =>
  server.use(
    http.get(apiUrl(`v1/dto/member-syllabus/${MEMBER_SYLLABUS_ID}/detail`), () =>
      HttpResponse.json(detail(verifierName)),
    ),
  )

const renderPage = () =>
  renderWithProviders(<DtoStudentDetailPage />, {
    route: `/dto/progress/${MEMBER_SYLLABUS_ID}`,
    path: '/dto/progress/:memberSyllabusId',
  })

describe('DtoStudentDetailPage', () => {
  it('credits the verifier without escaping the apostrophe in their name (issue #1255)', async () => {
    dtoApi("Niko O'Brien")

    renderPage()

    expect(await screen.findByText("Verified by Niko O'Brien on 2026-05-04")).toBeInTheDocument()
  })

  it('does not emit an HTML entity for a hyphenated, ampersanded name', async () => {
    dtoApi('Anne-Marie Smith & Jones')

    renderPage()

    const caption = await screen.findByText(/Verified by Anne-Marie Smith & Jones/)
    expect(caption.textContent).not.toContain('&amp;')
  })
})
