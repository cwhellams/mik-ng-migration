import type { ExamVersionDetail } from '@mik/contracts/exams'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ExamVersionEditorPage from './ExamVersionEditorPage'

/**
 * Covers the ordering half of #855: the fixed-vs-random toggle and the presence of
 * the drag affordances. The drop arithmetic itself lives in `reorder.ts` and is
 * tested there — `@hello-pangea/dnd` needs real layout to complete a drag, which
 * jsdom does not provide.
 */
const VERSION_ID = 'ver-1'

const aChoice = (choiceId: string, text: string, sortOrder: number) => ({
  choiceId,
  questionId: 'q-1',
  isCorrect: sortOrder === 0,
  sortOrder,
  translations: { en: { text } },
})

const aVersion = (overrides: Partial<ExamVersionDetail> = {}) =>
  ({
    versionId: VERSION_ID,
    examId: 'exam-1',
    versionNumber: 1,
    status: 'DRAFT',
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
    passPercent: 75,
    questionCount: null,
    randomizeQuestionOrder: true,
    translations: { en: { title: 'Air law', description: null } },
    questions: [
      {
        questionId: 'q-1',
        versionId: VERSION_ID,
        sortOrder: 0,
        translations: { en: { prompt: 'What is VFR?', reasoning: null } },
        choices: [aChoice('c-1', 'Visual flight rules', 0), aChoice('c-2', 'Very fast run', 1)],
      },
      {
        questionId: 'q-2',
        versionId: VERSION_ID,
        sortOrder: 1,
        translations: { en: { prompt: 'What is IFR?', reasoning: null } },
        choices: [],
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'k1mnimda',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'k1mnimda',
    ...overrides,
  }) as ExamVersionDetail

const editorApi = (version: ExamVersionDetail = aVersion()) => {
  const state = {
    versionUpdates: [] as unknown[],
    choiceUpserts: [] as { sortOrder?: number }[],
  }

  server.use(
    http.get(apiUrl(`v1/exams/admin/versions/${VERSION_ID}`), () => HttpResponse.json(version)),
    http.put(apiUrl(`v1/exams/admin/versions/${VERSION_ID}`), async ({ request }) => {
      state.versionUpdates.push(await request.json())
      return HttpResponse.json(version)
    }),
    http.put(apiUrl('v1/exams/admin/questions/:questionId/choices'), async ({ request }) => {
      state.choiceUpserts.push((await request.json()) as { sortOrder?: number })
      return HttpResponse.json({})
    }),
  )

  return state
}

const renderEditor = (version?: ExamVersionDetail) => {
  const state = editorApi(version)
  const rendered = renderWithProviders(<ExamVersionEditorPage />, {
    route: `/admin/exams/versions/${VERSION_ID}`,
    path: '/admin/exams/versions/:versionId',
    sudo: true,
  })
  return { ...rendered, state }
}

describe('ExamVersionEditorPage — question order settings', () => {
  it('shows the randomize toggle on for a version that shuffles', async () => {
    renderEditor()

    const toggle = await screen.findByRole('switch', {
      name: 'Present questions in random order',
    })
    expect(toggle).toBeChecked()
  })

  it('shows the toggle off for a fixed-order version', async () => {
    renderEditor(aVersion({ randomizeQuestionOrder: false }))

    const toggle = await screen.findByRole('switch', {
      name: 'Present questions in random order',
    })
    expect(toggle).not.toBeChecked()
  })

  it('saves the toggle with the rest of the version settings', async () => {
    const { user, state } = renderEditor()

    await user.click(
      await screen.findByRole('switch', { name: 'Present questions in random order' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save Version Settings' }))

    await waitFor(() => expect(state.versionUpdates).toHaveLength(1))
    expect(state.versionUpdates[0]).toMatchObject({ randomizeQuestionOrder: false })
  })

  it('disables the questions-per-attempt field in fixed order, because it does not apply there', async () => {
    renderEditor(aVersion({ randomizeQuestionOrder: false, questionCount: null }))

    const field = await screen.findByLabelText(/Questions per attempt/)
    expect(field).toBeDisabled()
    expect(
      screen.getByText('Only applies when questions are presented in random order'),
    ).toBeInTheDocument()
  })

  it('enables the questions-per-attempt field again when randomization is turned back on', async () => {
    const { user } = renderEditor(aVersion({ randomizeQuestionOrder: false }))

    expect(await screen.findByLabelText(/Questions per attempt/)).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: 'Present questions in random order' }))

    expect(screen.getByLabelText(/Questions per attempt/)).toBeEnabled()
    expect(screen.getByText('Leave blank to include all questions')).toBeInTheDocument()
  })

  it('hides the version settings entirely for a published version', async () => {
    renderEditor(aVersion({ status: 'PUBLISHED' }))

    expect(await screen.findByText('What is VFR?')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Present questions in random order' })).toBeNull()
  })
})

describe('ExamVersionEditorPage — reordering affordances', () => {
  it('gives every question and choice a drag handle on a DRAFT', async () => {
    renderEditor()

    expect(await screen.findByLabelText('Reorder question 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Reorder question 2')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Reorder choice')).toHaveLength(2)
  })

  it('explains how to reorder once there is more than one question', async () => {
    renderEditor()

    expect(
      await screen.findByText(
        'Drag a question or a choice by its handle to change the order test-takers see.',
      ),
    ).toBeInTheDocument()
  })

  it('offers no reordering on a published version, which the backend would reject', async () => {
    renderEditor(aVersion({ status: 'PUBLISHED' }))

    expect(await screen.findByText('What is VFR?')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reorder question 1')).toBeNull()
    expect(screen.queryByLabelText('Reorder choice')).toBeNull()
  })

  it('still offers the hint to a one-question version whose choices can be reordered', async () => {
    const [withChoices] = aVersion().questions
    renderEditor(aVersion({ questions: [withChoices] }))

    expect(await screen.findByText(/Drag a question or a choice/)).toBeInTheDocument()
  })

  it('keeps the hint away from a version with nothing to reorder', async () => {
    const [, withoutChoices] = aVersion().questions
    renderEditor(aVersion({ questions: [withoutChoices] }))

    expect(await screen.findByText('What is IFR?')).toBeInTheDocument()
    expect(screen.queryByText(/Drag a question or a choice/)).toBeNull()
  })

  // Blocked on jsdom: `@hello-pangea/dnd` measures every draggable with
  // getBoundingClientRect on lift, and jsdom reports 0x0 for all of them, so
  // neither the mouse nor the keyboard sensor ever produces a destination — a
  // keyboard lift + ArrowDown + drop completes with no reorder request sent.
  // The two halves either side of the drag are covered instead: which ids a drop
  // resolves to, and which endpoint they are sent to, are both in reorder.test.ts.
  it.todo('reorders questions by dragging one card past another')
  it.todo('restores the server order and explains itself when a reorder is rejected')

  it('puts a new choice past the highest sort order, not past the count', async () => {
    // Legacy hand-typed values with a gap: a count-derived 2 would collide with
    // the existing 2 and the new choice would land somewhere in the middle.
    const gapped = aVersion()
    gapped.questions[0].choices[0].sortOrder = 0
    gapped.questions[0].choices[1].sortOrder = 2
    const { user, state } = renderEditor(gapped)

    await user.click((await screen.findAllByRole('button', { name: 'Add Choice' }))[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.choiceUpserts).toHaveLength(1))
    expect(state.choiceUpserts[0]).toMatchObject({ sortOrder: 3 })
  })

  it('no longer asks the editor to type a sort order when editing a choice', async () => {
    const { user } = renderEditor()

    // The choice row's own pencil, not the question's: order is set by dragging now.
    // Picked by icon rather than position — dnd gives the drag handle role=button too.
    const row = (await screen.findByText('Visual flight rules')).closest('div')!
    const pencil = within(row)
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-icon="mdi:pencil"]'))
    await user.click(pencil!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Edit Choice')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Sort Order')).toBeNull()
    expect(within(dialog).getByRole('switch', { name: 'Correct answer' })).toBeChecked()
  })
})
