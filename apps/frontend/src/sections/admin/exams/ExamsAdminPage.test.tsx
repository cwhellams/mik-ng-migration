import type { Exam, ExamVersion } from '@mik/contracts/exams'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ExamsAdminPage from './ExamsAdminPage'

/**
 * Another of the admin CRUD pages (#1115 §9). Unlike the shop pages this one
 * talks to the API through `examApi`'s shared axios helpers rather than
 * `useApi`'s mutation, so failures arrive as thrown axios errors.
 */
const anExam = (overrides: Partial<Exam> = {}) =>
  ({
    examId: 'exam-1',
    name: 'Air law',
    examType: 'DTO',
    ...overrides,
  }) as Exam

const aVersion = (overrides: Partial<ExamVersion> = {}) =>
  ({
    versionId: 'ver-1',
    examId: 'exam-1',
    versionNumber: 1,
    status: 'DRAFT',
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
    passPercent: 75,
    ...overrides,
  }) as ExamVersion

const examsApi = (exams: Exam[] = [anExam()]) => {
  const state = { writes: [] as { method: string; path: string; body: unknown }[] }

  server.use(
    http.get(apiUrl('v1/exams/admin/exams'), () => HttpResponse.json(exams)),
    http.get(apiUrl('v1/exams/admin/exams/:id/versions'), () => HttpResponse.json([aVersion()])),
    http.post(apiUrl('v1/exams/admin/exams'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(anExam({ examId: 'exam-new' }))
    }),
    http.put(apiUrl('v1/exams/admin/exams/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(anExam())
    }),
  )

  return state
}

const openCreate = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click((await screen.findAllByRole('button', { name: /Create Exam/ }))[0])
  return screen.findByRole('dialog')
}

describe('ExamsAdminPage listing', () => {
  it('lists each exam with its id and type', async () => {
    examsApi()

    renderWithProviders(<ExamsAdminPage />)

    expect(await screen.findByText('Air law')).toBeInTheDocument()
    expect(screen.getByText('exam-1')).toBeInTheDocument()
    expect(screen.getByText('DTO')).toBeInTheDocument()
  })

  it('says so when there are no exams yet, rather than showing an empty table', async () => {
    examsApi([])

    renderWithProviders(<ExamsAdminPage />)

    expect(await screen.findByText('No exams available.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('reports a failed load', async () => {
    server.use(http.get(apiUrl('v1/exams/admin/exams'), () => problemResponse(500, 'Down')))

    renderWithProviders(<ExamsAdminPage />)

    // Asserted on the message rather than the alert role: the empty-state
    // "No exams available." alert renders while the request is still in flight,
    // so a role query would match that first.
    expect(await screen.findByText('Down')).toBeInTheDocument()
  })

  it('shows the empty state while still loading', async () => {
    // Worth pinning: the page cannot tell "no exams" from "not loaded yet", so
    // it briefly claims there are none on every visit.
    examsApi()

    renderWithProviders(<ExamsAdminPage />)

    expect(screen.getByText('No exams available.')).toBeInTheDocument()
    expect(await screen.findByText('Air law')).toBeInTheDocument()
  })
})

describe('ExamsAdminPage creating', () => {
  it('opens an empty dialog', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('')
  })

  it('will not save without a name', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts the new exam with its type', async () => {
    const state = examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Navigation')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: { name: 'Navigation', examType: 'OTHER' },
    })
  })

  it('sends the exam type the admin picked', async () => {
    const state = examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Air law')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'AFM' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ examType: 'AFM' })
  })

  it('reports a rejected save without closing the dialog', async () => {
    examsApi()
    server.use(http.post(apiUrl('v1/exams/admin/exams'), () => problemResponse(409, 'Duplicate')))

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Navigation')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('abandons the entry on cancel', async () => {
    const state = examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await openCreate(user)

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Navigation')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })
})

describe('ExamsAdminPage editing', () => {
  it('opens the dialog pre-filled with the exam', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await user.click(await screen.findByRole('button', { name: /Edit Exam/ }))

    expect(await screen.findByRole('textbox', { name: /Name/ })).toHaveValue('Air law')
  })

  it('puts the change against the exam it was editing', async () => {
    const state = examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await user.click(await screen.findByRole('button', { name: /Edit Exam/ }))

    const name = await screen.findByRole('textbox', { name: /Name/ })
    await user.clear(name)
    await user.type(name, 'Air law and procedures')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'exam-1',
      body: { name: 'Air law and procedures' },
    })
  })

  it('starts a fresh entry afterwards rather than reusing the last one', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)

    await user.click(await screen.findByRole('button', { name: /Edit Exam/ }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openCreate(user)

    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('')
  })
})

describe('ExamsAdminPage versions', () => {
  it('lists an exam’s versions once expanded', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await screen.findByText('Air law')

    await user.click(screen.getAllByRole('button')[1])

    expect(await screen.findByText(/DRAFT/)).toBeInTheDocument()
  })

  it('offers a new-version dialog per exam', async () => {
    examsApi()

    const { user } = renderWithProviders(<ExamsAdminPage />)
    await user.click(await screen.findByRole('button', { name: /New Version/ }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('New Version')
  })
})
