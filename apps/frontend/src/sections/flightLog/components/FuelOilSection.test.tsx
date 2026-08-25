import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { FlightLogUpsertSchema, type FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import type { LiquidRecordWithLock } from '@mik/contracts/liquid'
import { aFlightLog, aFuelRecord, AIRCRAFT_REGISTRATION } from '../../../test/fixtures'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { FuelOilSection } from './FuelOilSection'

/**
 * FuelOilSection unifies what used to be two components (LiquidUpliftField,
 * LiquidRecordsSection) into one card used both for a brand new entry
 * (pending mode, no flightId) and an existing one (live mode, flightId set) —
 * see the wizard/classic-form investigation behind #1119's cleanup.
 */

const validValues = (overrides: Partial<FlightLogUpsertRequest> = {}) =>
  FlightLogUpsertSchema.strip().parse(
    aFlightLog({ fuelUpliftLitres: null, oilUpliftLitres: null, ...overrides }),
  )

const fuelOilApi = (linkedRecords: LiquidRecordWithLock[] = []) => {
  const state = {
    linkCalls: [] as { recordId: string; flightLogId: string }[],
    unlinkCalls: [] as string[],
  }

  server.use(
    http.get(apiUrl('v1/liquid/records'), () => HttpResponse.json({ records: linkedRecords })),
    http.get(apiUrl('v1/liquid/records/linkable'), () =>
      HttpResponse.json({ records: [aFuelRecord({ recordId: 'rec-suggested' })] }),
    ),
    http.post(apiUrl('v1/liquid/records/:recordId/link'), async ({ params, request }) => {
      const { flightLogId } = (await request.json()) as { flightLogId: string }
      state.linkCalls.push({ recordId: String(params.recordId), flightLogId })
      return HttpResponse.json(aFuelRecord({ recordId: String(params.recordId), flightLogId }))
    }),
    http.post(apiUrl('v1/liquid/records/:recordId/unlink'), ({ params }) => {
      state.unlinkCalls.push(String(params.recordId))
      return HttpResponse.json(
        aFuelRecord({ recordId: String(params.recordId), flightLogId: null }),
      )
    }),
  )

  return state
}

function Harness({
  flightId,
  defaultValues,
}: {
  flightId?: string
  defaultValues?: Partial<FlightLogUpsertRequest>
}) {
  const { control } = useForm<FlightLogUpsertRequest>({ defaultValues: validValues(defaultValues) })
  const [pendingFuelRecord, setPendingFuelRecord] = useState<LiquidRecordWithLock>()
  const [pendingOilRecord, setPendingOilRecord] = useState<LiquidRecordWithLock>()

  return (
    <FuelOilSection
      control={control}
      aircraftRegistration={AIRCRAFT_REGISTRATION}
      flightId={flightId}
      pendingFuelRecord={pendingFuelRecord}
      pendingOilRecord={pendingOilRecord}
      onPendingFuelRecordChange={setPendingFuelRecord}
      onPendingOilRecordChange={setPendingOilRecord}
    />
  )
}

describe('FuelOilSection', () => {
  it('offers a checkbox and Add/Link controls for a brand new entry (no flightId)', async () => {
    fuelOilApi()

    renderWithProviders(<Harness />)

    await screen.findByText('Fuel and Oil Information')
    expect(screen.getByRole('checkbox', { name: 'No fuel added' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'No oil added' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Link an existing record' })).toHaveLength(2)
  })

  it('stages a picked record locally without calling the live link API (no flightId yet)', async () => {
    const state = fuelOilApi()

    const { user } = renderWithProviders(<Harness />)
    await screen.findByText('Fuel and Oil Information')

    await user.click(screen.getAllByRole('button', { name: 'Link an existing record' })[0]!)
    await user.click(await screen.findByRole('button', { name: 'Link' }))

    expect(await screen.findByText(/JET A-1/)).toBeInTheDocument()
    expect(state.linkCalls).toHaveLength(0)
  })

  it('shows a legacy litres figure read-only when nothing is linked', async () => {
    fuelOilApi()

    renderWithProviders(<Harness defaultValues={{ fuelUpliftLitres: 40 }} />)

    expect(await screen.findByText(/Fuel Uplift \(litres\): 40 l/)).toBeInTheDocument()
    expect(
      screen.getByText('Recorded before the fuel/oil record system — kept as-is.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'No fuel added' })).toBeNull()
  })

  it('shows an already-linked record live, with no competing checkbox/buttons for that type', async () => {
    fuelOilApi([aFuelRecord({ recordId: 'rec-fuel-1', flightLogId: 'fi_inst1' })])

    renderWithProviders(<Harness flightId='fi_inst1' />)

    expect(await screen.findByText(/JET A-1/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'No fuel added' })).toBeNull()
    // Oil has nothing linked, so it still offers the usual controls.
    expect(screen.getByRole('checkbox', { name: 'No oil added' })).toBeInTheDocument()
  })

  it('unlinks a live record through the real API', async () => {
    const state = fuelOilApi([aFuelRecord({ recordId: 'rec-fuel-1', flightLogId: 'fi_inst1' })])

    const { user } = renderWithProviders(<Harness flightId='fi_inst1' />)
    await screen.findByText(/JET A-1/)

    await user.click(screen.getByRole('button', { name: 'Detach from this flight' }))

    await waitFor(() => expect(state.unlinkCalls).toEqual(['rec-fuel-1']))
  })

  it('links a live pick immediately, not staged locally', async () => {
    const state = fuelOilApi()

    const { user } = renderWithProviders(<Harness flightId='fi_inst1' />)
    await screen.findByText('Fuel and Oil Information')

    await user.click(screen.getAllByRole('button', { name: 'Link an existing record' })[0]!)
    await user.click(await screen.findByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(state.linkCalls).toEqual([{ recordId: 'rec-suggested', flightLogId: 'fi_inst1' }]),
    )
  })
})
