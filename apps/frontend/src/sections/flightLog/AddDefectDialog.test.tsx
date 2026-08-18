import type { Defect } from '@mik/contracts/defects'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AddDefectDialog } from './AddDefectDialog'

const aDefect = (): Defect =>
  ({
    defectId: 'def-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy on landing',
    status: 'ACTIVE',
    flightMins: 285_000,
    rows: 1,
    createdBy: 'Matti1',
    createdAt: '2025-06-02T09:00:00.000Z',
    flightId: null,
    hilId: null,
    resolvedNoteId: null,
    updatedAt: '2025-06-02T09:00:00.000Z',
    updatedBy: 'Matti1',
  }) as unknown as Defect

/** Records every POST so the payload/call-count can be asserted. */
const defectApi = () => {
  const posts: unknown[] = []
  server.use(
    http.post(apiUrl('v1/defects'), async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json(aDefect(), { status: 201 })
    }),
  )
  return posts
}

const renderDialog = (onSuccess = vi.fn()) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <AddDefectDialog
      open
      onClose={onClose}
      onSuccess={onSuccess}
      aircraftRegistration={AIRCRAFT_REGISTRATION}
      ajlbSeqNo={1}
      flightId={null}
    />,
  )
  return { ...rendered, onClose, onSuccess }
}

const fillAndSubmit = async (user: ReturnType<typeof renderDialog>['user']) => {
  await user.type(screen.getByLabelText(/Description/), 'Nose wheel shimmy on landing')
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

describe('AddDefectDialog', () => {
  it('asks for grounding confirmation before creating the defect, without calling the API yet', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()
    await fillAndSubmit(user)

    expect(
      await screen.findByText(/Submitting this action will ground the aircraft/),
    ).toBeInTheDocument()
    expect(posts).toHaveLength(0)
  })

  it('creates the defect only after the grounding confirmation is accepted', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user, onSuccess } = renderDialog()
    await fillAndSubmit(user)

    const confirmDialog = (
      await screen.findByText(/Submitting this action will ground the aircraft/)
    ).closest('[role="dialog"]') as HTMLElement
    await user.click(within(confirmDialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ description: 'Nose wheel shimmy on landing' })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('does not create the defect when the grounding confirmation is cancelled', async () => {
    const posts = defectApi()
    signInAs(aMember())

    const { user, onSuccess } = renderDialog()
    await fillAndSubmit(user)

    const confirmDialog = (
      await screen.findByText(/Submitting this action will ground the aircraft/)
    ).closest('[role="dialog"]') as HTMLElement
    await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        screen.queryByText(/Submitting this action will ground the aircraft/),
      ).not.toBeInTheDocument(),
    )
    expect(posts).toHaveLength(0)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
