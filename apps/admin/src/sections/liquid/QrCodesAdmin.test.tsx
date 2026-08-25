import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CreateQrBatchRequest, QrBatch, QrCode } from '@mik/contracts/liquid'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { anAssignedQrCode, aQrBatch, aQrCode } from '../../test/fixtures/liquid'
import QrCodesAdmin from './QrCodesAdmin'

/**
 * The QR console: mint a batch, list its codes, and assign one via the
 * `AssignQrCode` dialog it embeds. Covers minting, the batches/codes lists in
 * their loading/empty/error states, and that assigning a code from the dialog
 * refreshes both lists.
 */

const qrTargets = () =>
  http.get(apiUrl('v1/liquid/qr/targets'), () =>
    HttpResponse.json({
      oilCanisters: [{ targetId: 'canister-1', label: 'MIK A 26/1' }],
      fuelStations: [],
    }),
  )

const qrData = (batches: QrBatch[] = [aQrBatch()], codes: QrCode[] = [aQrCode()]) => {
  const state = {
    batches,
    codes,
    mints: [] as CreateQrBatchRequest[],
  }

  server.use(
    qrTargets(),
    http.get(apiUrl('v1/liquid/qr/batches'), () => HttpResponse.json(state.batches)),
    http.get(apiUrl('v1/liquid/qr'), ({ request }) => {
      const unassignedOnly = new URL(request.url).searchParams.get('unassignedOnly') === 'true'
      const filtered = unassignedOnly ? state.codes.filter((c) => !c.targetType) : state.codes
      return HttpResponse.json(filtered)
    }),
    http.post(apiUrl('v1/liquid/qr/batches'), async ({ request }) => {
      const body = (await request.json()) as CreateQrBatchRequest
      state.mints.push(body)
      const batch = aQrBatch({ batchId: 'new-batch', label: body.label, codeCount: body.count })
      state.batches = [...state.batches, batch]
      return HttpResponse.json({ batch, codes: [] })
    }),
    http.post(apiUrl('v1/liquid/qr/:code/assign'), () => HttpResponse.json(anAssignedQrCode())),
  )

  return state
}

afterEach(() => vi.restoreAllMocks())

describe('QrCodesAdmin listing', () => {
  it('lists a batch with its assigned count', async () => {
    qrData()

    renderWithProviders(<QrCodesAdmin />)

    expect(await screen.findByText('Hangar shelf')).toBeInTheDocument()
    expect(screen.getByText('0 / 12')).toBeInTheDocument()
  })

  it('shows an empty state when no batches exist', async () => {
    qrData([], [])

    renderWithProviders(<QrCodesAdmin />)

    expect(await screen.findByText('No codes have been generated yet.')).toBeInTheDocument()
    expect(await screen.findByText('No codes match.')).toBeInTheDocument()
  })

  it('lists an unassigned code with an Assign action', async () => {
    qrData([aQrBatch()], [aQrCode()])

    renderWithProviders(<QrCodesAdmin />)

    expect(await screen.findByText('MIK-L-7F3KM')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument()
  })

  it('has no Assign action for a code that already points somewhere', async () => {
    qrData([aQrBatch()], [anAssignedQrCode()])

    renderWithProviders(<QrCodesAdmin />)

    await screen.findByText('MIK-L-7F3KM')
    expect(screen.getByText('MIK A 26/1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull()
  })

  it('reports a failed batches load', async () => {
    server.use(
      qrTargets(),
      http.get(apiUrl('v1/liquid/qr/batches'), () => problemResponse(500, 'Database down')),
      http.get(apiUrl('v1/liquid/qr'), () => HttpResponse.json([])),
    )

    renderWithProviders(<QrCodesAdmin />)

    expect(await screen.findByText('Database down')).toBeInTheDocument()
  })
})

describe('QrCodesAdmin minting', () => {
  it('disables Generate until a label and count are entered', async () => {
    qrData()

    renderWithProviders(<QrCodesAdmin />)
    await screen.findByText('Hangar shelf')

    // A default count of 12 is prefilled, so only the label is missing.
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('mints a batch and selects it', async () => {
    const state = qrData()

    const { user } = renderWithProviders(<QrCodesAdmin />)
    await screen.findByText('Hangar shelf')

    await user.type(screen.getByLabelText(/^Batch label/), 'Apron shelf')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(state.mints).toEqual([{ label: 'Apron shelf', count: 12 }]))
    expect(await screen.findByText('Apron shelf')).toBeInTheDocument()
  })

  it('shows the server error on a failed mint', async () => {
    qrData()
    server.use(
      http.post(apiUrl('v1/liquid/qr/batches'), () => problemResponse(400, 'Count too high')),
    )

    const { user } = renderWithProviders(<QrCodesAdmin />)
    await screen.findByText('Hangar shelf')
    await user.type(screen.getByLabelText(/^Batch label/), 'Apron shelf')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByText('Count too high')).toBeInTheDocument()
  })
})

describe('QrCodesAdmin assigning', () => {
  it('opens the AssignQrCode dialog for a code and refreshes the lists on success', async () => {
    qrData([aQrBatch()], [aQrCode()])

    const { user } = renderWithProviders(<QrCodesAdmin />)
    await screen.findByText('MIK-L-7F3KM')
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Assign a QR code')

    await user.click(screen.getByLabelText('Target'))
    await user.click(await screen.findByRole('option', { name: 'MIK A 26/1' }))
    await user.click(screen.getByRole('button', { name: 'Assign permanently' }))

    expect(await screen.findByText('MIK-L-7F3KM now points at MIK A 26/1.')).toBeInTheDocument()
  })
})
