import type { Syllabus, TrainingProgram } from '@backend/routes/dto/models'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import DtoProgramsAdminPage from './DtoProgramsAdminPage'

/**
 * The DTO training-programme admin page: a list of programmes, each expanding
 * to its syllabi with a draft → submitted → published lifecycle. One of the
 * admin CRUD pages #1115 §9 covers.
 */
const aProgram = (overrides: Partial<TrainingProgram> = {}) =>
  ({
    programId: 'prog-1',
    name: 'PPL(A) syllabus',
    description: 'Private pilot licence training',
    ...overrides,
  }) as TrainingProgram

const aSyllabus = (overrides: Partial<Syllabus> = {}) =>
  ({
    syllabusId: 'syl-1',
    programId: 'prog-1',
    version: 1,
    status: 'DRAFT',
    ...overrides,
  }) as Syllabus

const dtoApi = (programs: TrainingProgram[] = [aProgram()], syllabi: Syllabus[] = [aSyllabus()]) => {
  const state = { writes: [] as { method: string; path: string; body: unknown }[] }

  server.use(
    http.get(apiUrl('v1/dto/programs'), () => HttpResponse.json(programs)),
    http.get(apiUrl('v1/dto/programs/:id/syllabi'), () => HttpResponse.json(syllabi)),
    http.post(apiUrl('v1/dto/programs'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: 'programs', body: await request.json() })
      return HttpResponse.json(aProgram({ programId: 'prog-new' }))
    }),
    http.put(apiUrl('v1/dto/programs/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(aProgram())
    }),
    http.post(apiUrl('v1/dto/programs/:id/syllabi'), async ({ params }) => {
      state.writes.push({ method: 'POST', path: `${params.id}/syllabi`, body: null })
      return HttpResponse.json(aSyllabus({ syllabusId: 'syl-new' }))
    }),
  )

  return state
}

const openDialog = async (user: ReturnType<typeof renderWithProviders>['user'], name: RegExp) => {
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

describe('DtoProgramsAdminPage listing', () => {
  it('lists the training programmes', async () => {
    dtoApi()

    renderWithProviders(<DtoProgramsAdminPage />)

    expect(await screen.findByText('PPL(A) syllabus')).toBeInTheDocument()
  })

  it('says so when no programmes exist yet', async () => {
    dtoApi([])

    renderWithProviders(<DtoProgramsAdminPage />)

    expect(await screen.findByText('No training programs yet.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(http.get(apiUrl('v1/dto/programs'), () => problemResponse(500, 'Down')))

    renderWithProviders(<DtoProgramsAdminPage />)

    expect(await screen.findByText('Down')).toBeInTheDocument()
  })
})

describe('DtoProgramsAdminPage creating', () => {
  it('opens an empty dialog titled for a new programme', async () => {
    dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    expect(screen.getByText('New Training Program')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('')
  })

  it('will not save without a name', async () => {
    dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('treats a name of only spaces as missing', async () => {
    dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)
    await user.type(screen.getByRole('textbox', { name: /Name/ }), '   ')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts the new programme', async () => {
    const state = dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'CPL(A) syllabus')
    await user.type(screen.getByRole('textbox', { name: /Description/ }), 'Commercial licence')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      path: 'programs',
      body: { name: 'CPL(A) syllabus', description: 'Commercial licence' },
    })
  })

  it('omits an empty description rather than sending a blank string', async () => {
    const state = dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'CPL(A) syllabus')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toEqual({ name: 'CPL(A) syllabus' })
  })

  it('reports a rejected save without closing the dialog', async () => {
    dtoApi()
    server.use(http.post(apiUrl('v1/dto/programs'), () => problemResponse(409, 'Already exists')))

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'CPL(A) syllabus')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Failed to save program')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('abandons the entry on cancel', async () => {
    const state = dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await openDialog(user, /New Program/)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'CPL(A) syllabus')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })
})

describe('DtoProgramsAdminPage editing', () => {
  it('opens the dialog pre-filled with the programme', async () => {
    dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await screen.findByText('PPL(A) syllabus')
    await user.click(screen.getByRole('button', { name: 'Edit PPL(A) syllabus' }))

    expect(await screen.findByRole('textbox', { name: /Name/ })).toHaveValue('PPL(A) syllabus')
    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue(
      'Private pilot licence training',
    )
  })

  it('puts the change against the programme it was editing', async () => {
    const state = dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await screen.findByText('PPL(A) syllabus')
    await user.click(screen.getByRole('button', { name: 'Edit PPL(A) syllabus' }))

    const name = await screen.findByRole('textbox', { name: /Name/ })
    await user.clear(name)
    await user.type(name, 'PPL(A) revised')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'prog-1',
      body: { name: 'PPL(A) revised' },
    })
  })
})

describe('DtoProgramsAdminPage syllabi', () => {
  it('lists a programme’s syllabi with their version and status', async () => {
    dtoApi()

    renderWithProviders(<DtoProgramsAdminPage />)

    expect(await screen.findByText(/DRAFT/)).toBeInTheDocument()
  })

  it('creates a new draft syllabus against the programme', async () => {
    const state = dtoApi()

    const { user } = renderWithProviders(<DtoProgramsAdminPage />)
    await screen.findByText(/DRAFT/)
    await user.click(screen.getByRole('button', { name: /New Syllabus|New Draft/ }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'POST', path: 'prog-1/syllabi' })
  })
})
