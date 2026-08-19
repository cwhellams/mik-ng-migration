import type { Defect } from '@mik/contracts/defects'
import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { signInAs, signInWithPermissions } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember, MEMBER_ID } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { DefectDialog } from './DefectDialog'

/**
 * One of the few dialogs already using react-hook-form + zodResolver, and the
 * pattern #1115 §9.5 wants the rest to converge on. It is also permission-aware:
 * only a flight log admin or the reporter themselves may edit a defect.
 */
const aDefect = (overrides: Partial<Defect> = {}) =>
  ({
    defectId: 'def-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy on landing',
    status: 'ACTIVE',
    flightMins: 285_000,
    rows: 1,
    createdBy: MEMBER_ID,
    createdAt: '2025-06-02T09:00:00.000Z',
    flightId: null,
    hilId: null,
    resolvedNoteId: null,
    ...overrides,
  }) as unknown as Defect

/** Records every PATCH so the payload can be asserted. */
const defectApi = () => {
  const patches: unknown[] = []
  server.use(
    http.get(apiUrl('v1/aircraft-hil'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/maintenance-notes'), () => HttpResponse.json([])),
    http.patch(apiUrl('v1/defects/:id'), async ({ request }) => {
      patches.push(await request.json())
      return HttpResponse.json(aDefect())
    }),
  )
  return patches
}

const renderDialog = (defect = aDefect(), onChanged = vi.fn()) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <DefectDialog
      defect={defect}
      aircraftRegistration={AIRCRAFT_REGISTRATION}
      open
      onClose={onClose}
      onChanged={onChanged}
    />,
  )
  return { ...rendered, onClose, onChanged }
}

describe('DefectDialog reading', () => {
  it('shows the defect and its status', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog()

    expect(await screen.findByText('Nose wheel shimmy on landing')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it.each([
    ['MOVED_TO_HIL', 'Moved to HIL'],
    ['RESOLVED', 'Resolved'],
  ])('shows a %s defect as %s', async (status, label) => {
    defectApi()
    signInAs(aMember())

    renderDialog(aDefect({ status: status as Defect['status'] }))

    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  it('shows the aircraft total flight time in hours and minutes', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog(aDefect({ flightMins: 125 }))

    expect(await screen.findByText('2:05')).toBeInTheDocument()
  })

  it('closes when asked', async () => {
    defectApi()
    signInAs(aMember())

    const { user, onClose } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('DefectDialog permissions', () => {
  it('lets the member who reported it edit', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog(aDefect({ createdBy: MEMBER_ID }))

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('lets a flight log admin in admin mode edit someone else’s defect', async () => {
    defectApi()
    signInWithPermissions(MIKPermissions.FLIGHTLOG_ADMIN)

    renderWithProviders(
      <DefectDialog
        defect={aDefect({ createdBy: 'Anna1' })}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        open
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
      { sudo: true },
    )

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('does not let an unrelated member edit', async () => {
    defectApi()
    signInAs(aMember())

    renderDialog(aDefect({ createdBy: 'Anna1' }))

    await screen.findByText('Nose wheel shimmy on landing')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})

describe('DefectDialog editing', () => {
  it('reveals the description field on Edit', async () => {
    defectApi()
    signInAs(aMember())

    const { user } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue(
      'Nose wheel shimmy on landing',
    )
  })

  it('patches the edited description', async () => {
    const patches = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const description = screen.getByRole('textbox', { name: /Description/ })
    await user.clear(description)
    await user.type(description, 'Nose wheel replaced')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ description: 'Nose wheel replaced' })
  })

  it('tells the caller the defect changed', async () => {
    defectApi()
    signInAs(aMember())

    const { user, onChanged } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  })

  it('refuses an empty description', async () => {
    const patches = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByRole('textbox', { name: /Description/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(0))
    // Still in edit mode, with the schema's complaint on the field.
    expect(screen.getByRole('textbox', { name: /Description/ })).toBeInTheDocument()
  })

  it('discards the edit on cancel', async () => {
    const patches = defectApi()
    signInAs(aMember())

    const { user } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByRole('textbox', { name: /Description/ }), ' and more')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(patches).toHaveLength(0)
    expect(await screen.findByText('Nose wheel shimmy on landing')).toBeInTheDocument()
  })

  it('reports a rejected save without leaving edit mode', async () => {
    defectApi()
    signInAs(aMember())
    server.use(http.patch(apiUrl('v1/defects/:id'), () => problemResponse(409, 'Already resolved')))

    const { user, onChanged } = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Already resolved')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('offers the logbook row fields only for a pre-flight defect', async () => {
    defectApi()
    signInAs(aMember())

    const { user } = renderDialog(aDefect({ flightId: null }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('spinbutton', { name: /Rows/ })).toBeInTheDocument()
  })

  it('hides them for a defect anchored to a flight', async () => {
    // An in-flight defect is an inline chip on its flight's row, so its
    // placement cannot be moved independently.
    defectApi()
    signInAs(aMember())

    const { user } = renderDialog(aDefect({ flightId: 'fi_inst1' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.queryByRole('spinbutton', { name: /Rows/ })).toBeNull()
  })
})
