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

const fuelOilApi = (
  linkedRecords: LiquidRecordWithLock[] = [],
  linkableRecordIds: string[] = ['rec-suggested'],
) => {
  const state = {
    linkCalls: [] as { recordId: string; flightLogId: string }[],
    unlinkCalls: [] as string[],
    // Mutable so a link/unlink can change what the suggestions list serves on
    // the next fetch -- this is what proves suggestions.mutate() actually
    // clears the stale cache instead of just trusting it happened.
    linkable: new Set(linkableRecordIds),
  }

  server.use(
    http.get(apiUrl('v1/liquid/records'), () => HttpResponse.json({ records: linkedRecords })),
    http.get(apiUrl('v1/liquid/records/linkable'), () =>
      HttpResponse.json({
        records: [...state.linkable].map((recordId) => aFuelRecord({ recordId })),
      }),
    ),
    http.post(apiUrl('v1/liquid/records/:recordId/link'), async ({ params, request }) => {
      const { flightLogId } = (await request.json()) as { flightLogId: string }
      state.linkCalls.push({ recordId: String(params.recordId), flightLogId })
      state.linkable.delete(String(params.recordId))
      return HttpResponse.json(aFuelRecord({ recordId: String(params.recordId), flightLogId }))
    }),
    http.post(apiUrl('v1/liquid/records/:recordId/unlink'), ({ params }) => {
      state.unlinkCalls.push(String(params.recordId))
      state.linkable.add(String(params.recordId))
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
  variant,
}: {
  flightId?: string
  defaultValues?: Partial<FlightLogUpsertRequest>
  variant?: 'card' | 'plain'
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
      variant={variant}
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

  it('drops its own card and heading in "plain" variant (the wizard already frames the step)', async () => {
    fuelOilApi()

    renderWithProviders(<Harness variant='plain' />)

    await screen.findByText('Did you add fuel?')
    expect(screen.queryByText('Fuel and Oil Information')).toBeNull()
  })

  it('in "plain" variant, hides Add/Link until the member answers "Yes"', async () => {
    fuelOilApi()

    const { user } = renderWithProviders(<Harness variant='plain' />)
    await screen.findByText('Did you add fuel?')

    expect(screen.queryAllByRole('button', { name: 'Link an existing record' })).toHaveLength(0)

    await user.click(screen.getAllByRole('button', { name: 'Yes' })[0]!)

    expect(screen.getAllByRole('button', { name: 'Link an existing record' })).toHaveLength(1)
  })

  it('in "plain" variant, answering "No" resolves the row with nothing further to do', async () => {
    fuelOilApi()

    const { user } = renderWithProviders(<Harness variant='plain' />)
    await screen.findByText('Did you add fuel?')

    await user.click(screen.getAllByRole('button', { name: 'No' })[0]!)

    expect(screen.queryAllByRole('button', { name: 'Link an existing record' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Add fuel' })).toHaveLength(0)
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

  it('offers "add another"/"link additional" wording once a record is already linked', async () => {
    fuelOilApi([aFuelRecord({ recordId: 'rec-fuel-1', flightLogId: 'fi_inst1' })])

    renderWithProviders(<Harness flightId='fi_inst1' />)
    await screen.findByText(/JET A-1/)

    expect(screen.getByRole('button', { name: 'Add another fuel record' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link an additional record' })).toBeInTheDocument()
  })

  it('shows each record’s date and time, following the timezone setting', async () => {
    fuelOilApi([aFuelRecord({ recordId: 'rec-fuel-1', flightLogId: 'fi_inst1' })])

    renderWithProviders(<Harness flightId='fi_inst1' />)

    expect(await screen.findByText(/JET A-1/)).toBeInTheDocument()
    // FIXTURE_TIMESTAMP is 2025-06-02T09:00:00.000Z; formatDateTime renders it
    // as DD.MM.YYYY HH:mm in whichever timezone the harness defaults to.
    expect(screen.getByText(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('excludes a record just linked from the "link additional" suggestions on reopening the dialog', async () => {
    const state = fuelOilApi(
      [aFuelRecord({ recordId: 'rec-fuel-1', flightLogId: 'fi_inst1' })],
      ['rec-suggested'],
    )

    const { user } = renderWithProviders(<Harness flightId='fi_inst1' />)
    await screen.findByText(/JET A-1/)

    await user.click(screen.getByRole('button', { name: 'Link an additional record' }))
    await user.click(await screen.findByRole('button', { name: 'Link' }))
    await waitFor(() => expect(state.linkCalls).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Link an additional record' }))

    expect(
      await screen.findByText('No unattached records for OH-STL. Add one above.'),
    ).toBeInTheDocument()
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
