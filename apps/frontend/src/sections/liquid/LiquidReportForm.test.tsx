import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LiquidType, OilSource } from '@mik/contracts/liquid'

import { anAircraft, anOilCanister, theFuelProviders } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { LiquidReportForm } from './LiquidReportForm'

/**
 * The member-facing reporting form.
 *
 * The behaviour under test is the *shape* of the form, which is what the issue
 * actually specifies: what the member is asked for at the home base versus away
 * from it, which fuel types an aircraft offers, and which submissions are held
 * back. The rules themselves are tested in `packages/contracts/test/liquid.test.ts`;
 * this is about whether the form applies them.
 */

const OH_STL = anAircraft({ registration: 'OH-STL', fuelTypes: ['JET A-1'] })
const OH_IHQ = anAircraft({
  registration: 'OH-IHQ',
  fuelTypes: ['MOGAS 98E5', 'MOGAS 95E10', '100LL'],
  preferredFuelType: 'MOGAS 98E5',
})

const posted: unknown[] = []
/** File names uploaded to the new record's own attachments endpoint. */
const postedAttachmentNames: string[][] = []
let attachmentUploadStatus = 201

beforeEach(() => {
  posted.length = 0
  postedAttachmentNames.length = 0
  attachmentUploadStatus = 201
  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json({ aircrafts: [OH_STL, OH_IHQ] })),
    http.get(apiUrl('v1/liquid/providers'), () => HttpResponse.json(theFuelProviders())),
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({
        airfields: [
          { ident: 'EFNU', name: 'Nummela' },
          { ident: 'EFHK', name: 'Helsinki-Vantaa' },
          { ident: 'EEPU', name: 'Pärnu' },
        ],
      }),
    ),
    http.get(apiUrl('v1/liquid/oil-canisters'), () => HttpResponse.json([anOilCanister()])),
    http.post(apiUrl('v1/liquid/records'), async ({ request }) => {
      const body = await request.json()
      posted.push(body)
      return HttpResponse.json(
        { recordId: 'new', lock: { canEdit: true, canDelete: true } },
        {
          status: 201,
        },
      )
    }),
    http.post(apiUrl('v1/liquid/records/new/attachments'), async ({ request }) => {
      // request.formData() can't be used here: the upload carries a jsdom
      // `File`, which undici's FormData parser rejects because it is not
      // undici's own `File` class (see useAircraftDocumentUpload.test.tsx).
      const body = await request.text()
      // The file's own filename does not survive jsdom's FormData through this
      // multipart round trip in the test environment (it comes through as
      // "blob") -- same limitation `useAircraftDocumentUpload.test.tsx` works
      // around. Counting the `files` parts is enough to prove the staged file
      // was actually sent; the real filename is exercised in the backend's own
      // route test (recordAttachments.test.ts), which uses a real multipart client.
      postedAttachmentNames.push([...body.matchAll(/name="files"/g)].map(() => 'files'))
      if (attachmentUploadStatus !== 201) {
        return HttpResponse.json(
          { status: attachmentUploadStatus, detail: 'Could not upload the receipt.' },
          {
            status: attachmentUploadStatus,
            headers: { 'content-type': 'application/problem+json' },
          },
        )
      }
      return HttpResponse.json([], { status: 201 })
    }),
  )
})

const saveButton = () => screen.getByRole('button', { name: 'Save' })
const aircraftSelect = () => screen.getByRole('combobox', { name: 'Aircraft' })
const fuelTypeSelect = () => screen.getByRole('combobox', { name: 'Fuel type' })
const airportField = () => screen.getByRole('combobox', { name: 'Airport' })
const quantityField = () => screen.getByLabelText(/Quantity \(litres\)/)

/** The options in the menu that is currently open, not every option ever rendered. */
const openOptions = async () =>
  within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent)

describe('LiquidReportForm — the home base flow', () => {
  it('starts at the home base, where cost and currency are not asked for at all', async () => {
    // "Members see EFNU and the selected fuel type ... Total cost is not
    // required at EFNU." -- and, since it's never needed there, not shown either.
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('button', { name: 'At EFNU' }))

    expect(screen.getByLabelText('Airport')).toHaveValue('EFNU')
    expect(screen.queryByLabelText(/Total cost/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument()
  })

  it('names the provider the fuel type implies, without asking', async () => {
    // The member never picks a provider at EFNU: it follows from the fuel.
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('button', { name: 'At EFNU' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))

    expect(
      await screen.findByText('Supplied by Lentokoneosakeyhtiö Lokki & Kumppanit'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument()
  })

  it('omits the provider from the payload at the home base', async () => {
    // Sending one would be rejected — the server treats it as an attempt to
    // name a different seller.
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('button', { name: 'At EFNU' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.type(quantityField(), '150')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: 'OH-STL',
      airport: 'EFNU',
      fuelType: 'JET A-1',
      quantityLitres: 150,
    })
    expect((posted[0] as { providerId?: number }).providerId).toBeUndefined()
  })
})

describe('LiquidReportForm — recorded-at timezone', () => {
  // The field used to be a bare <input type="datetime-local">, silently
  // interpreted in whatever zone the browser happened to be in, with no
  // indication of which one. It must instead follow the app's own UTC/local
  // timezone setting and say, in the label itself, which one is active.
  it('labels the recorded-at field with the active timezone', async () => {
    renderWithProviders(<LiquidReportForm />, { timezone: 'utc' })

    expect(await screen.findByRole('group', { name: /Date and time \(UTC\)/ })).toBeInTheDocument()
  })

  it('submits a real timestamp, not a zone-less local string', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />, { timezone: 'utc' })

    await user.click(await screen.findByRole('button', { name: 'At EFNU' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.type(quantityField(), '150')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    })
  })
})

describe('LiquidReportForm — the away flow', () => {
  const goAway = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Somewhere else' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
  }

  it('requires a total cost, and says so', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    expect(screen.getByText('Required away from the home base.')).toBeInTheDocument()
  })

  it('hides the now-stale cost/currency fields again after switching back to EFNU', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.click(screen.getByRole('combobox', { name: 'Currency' }))
    const menu = await screen.findByRole('listbox')
    await user.click(within(menu).getByRole('option', { name: 'SEK' }))
    expect(await screen.findByLabelText(/Exchange rate to EUR/)).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'At EFNU' }))

    expect(screen.queryByLabelText(/Total cost/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Exchange rate to EUR/)).not.toBeInTheDocument()
  })

  it('holds the save back until the total cost is there', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    await user.click(airportField())
    await user.click(await screen.findByRole('option', { name: 'EEPU: Pärnu' }))
    await user.type(quantityField(), '200')

    // The reason is shown rather than the button silently doing nothing.
    expect(await screen.findByText('Choose a provider.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('offers only the providers that travel, not the EFNU ones', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)
    await user.click(airportField())
    await user.click(await screen.findByRole('option', { name: 'EEPU: Pärnu' }))

    await user.click(screen.getByRole('combobox', { name: 'Provider' }))

    expect(await openOptions()).toEqual(['AirBP', 'Kanair', 'Other / own payment'])
  })

  it('marks Jet A-1 bought outside Finland as tax included, with no checkbox to see or change it', async () => {
    // "If an airport's ICAO code does not begin with EF and the fuel type is
    // Jet A-1, mark the record as tax included / fueled abroad." Fully
    // automatic now — a member cannot see or override the club's tax
    // treatment of a given seller, so there is nothing to show them.
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    await user.click(airportField())
    await user.click(await screen.findByRole('option', { name: 'EEPU: Pärnu' }))
    await user.click(screen.getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'AirBP' }))
    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.type(quantityField(), '40')

    expect(screen.queryByRole('checkbox', { name: /tax/i })).not.toBeInTheDocument()

    await user.click(saveButton())
    expect(posted[0]).toMatchObject({ taxIncludedAbroad: true })
  })

  it('leaves the flag clear for a Finnish airport', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    await user.click(airportField())
    await user.click(await screen.findByRole('option', { name: 'EFHK: Helsinki-Vantaa' }))
    await user.click(screen.getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'AirBP' }))
    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.type(quantityField(), '40')

    await user.click(saveButton())
    expect(posted[0]).toMatchObject({ taxIncludedAbroad: false })
  })

  it('asks for an exchange rate once the currency is not EUR', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAway(user)

    expect(screen.queryByLabelText(/Exchange rate to EUR/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Currency' }))
    // Scoped to the open menu: several selects have been opened by now, and MUI
    // keeps a closing menu mounted through its exit transition, so an unscoped
    // query can click a node that is on its way out.
    const menu = await screen.findByRole('listbox')
    await user.click(within(menu).getByRole('option', { name: 'SEK' }))

    expect(await screen.findByLabelText(/Exchange rate to EUR/)).toBeInTheDocument()
  })
})

describe('LiquidReportForm — fuel types are constrained by aircraft', () => {
  it('picks the only fuel type for an aircraft that takes one', async () => {
    // OH-STL takes Jet A-1 and nothing else, so that is not a choice.
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))

    await waitFor(() => expect(fuelTypeSelect()).toHaveTextContent('JET A-1'))
  })

  it('offers only what the aircraft takes', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-IHQ' }))
    await user.click(fuelTypeSelect())

    expect(await openOptions()).toEqual(['MOGAS 98E5', 'MOGAS 95E10', '100LL'])
  })

  it('drops a fuel type the new aircraft cannot take', async () => {
    // Switching from OH-IHQ (100LL) to OH-STL (Jet A-1 only) must not leave
    // 100LL selected — the server would reject it, and the form would look fine.
    const { user } = renderWithProviders(<LiquidReportForm />)

    await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-IHQ' }))
    await user.click(fuelTypeSelect())
    await user.click(await screen.findByRole('option', { name: '100LL' }))

    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))

    await waitFor(() => expect(fuelTypeSelect()).toHaveTextContent('JET A-1'))
  })

  it('cannot pick a fuel type before an aircraft', async () => {
    renderWithProviders(<LiquidReportForm />)
    expect(await screen.findByText('Choose an aircraft first.')).toBeInTheDocument()
  })
})

describe('LiquidReportForm — oil', () => {
  const switchToOil = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Oil' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-IHQ' }))
  }

  it('offers the canisters assigned to that aircraft', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)

    await user.click(await screen.findByRole('combobox', { name: 'Canister' }))
    expect(await screen.findByRole('option', { name: /MIK A 26\/1/ })).toBeInTheDocument()
  })

  it('says the remaining quantity is not checked against what was used', async () => {
    // The issue is explicit that it is informational, and a field that looks
    // validated but isn't invites the member to guess.
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)

    expect(
      await screen.findByText('For information only — it is not checked against what you used.'),
    ).toBeInTheDocument()
  })

  it('asks for make, viscosity and batch when the oil came from elsewhere', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)
    await user.click(screen.getByRole('button', { name: 'Other source' }))

    expect(await screen.findByLabelText(/Make/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Model \/ viscosity/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Batch number/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Canister' })).not.toBeInTheDocument()
  })

  it('does not ask for the remaining amount when the oil came from elsewhere', async () => {
    // There is no club canister to report a level for, so the field — and the
    // "now empty" checkbox, which only makes sense for a club canister — are
    // both irrelevant here rather than just disabled.
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)
    await user.click(screen.getByRole('button', { name: 'Other source' }))

    expect(screen.queryByLabelText(/Remaining in the canister/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('The canister is now empty')).not.toBeInTheDocument()
  })

  it('hides the remaining amount once the canister is marked empty', async () => {
    // Shown side by side, the field invites the member to type how much they
    // *used* into a box asking what's left, right as they say there's nothing
    // left. Hiding it removes the temptation, and clearing it stops a value
    // typed before checking the box from silently riding along regardless.
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)

    await user.click(await screen.findByRole('combobox', { name: 'Canister' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))

    await user.type(screen.getByLabelText(/Remaining in the canister/), '0.5')
    await user.click(screen.getByLabelText('The canister is now empty'))

    expect(screen.queryByLabelText(/Remaining in the canister/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('The canister is now empty'))
    expect(screen.getByLabelText(/Remaining in the canister/)).toHaveValue(null)
  })

  it('holds the save back until the non-club oil is identified', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)
    await user.click(screen.getByRole('button', { name: 'Other source' }))
    await user.type(quantityField(), '0.5')

    expect(
      await screen.findByText('Enter the make, viscosity and batch number.'),
    ).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('records non-club oil once it is identified', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)
    await user.click(screen.getByRole('button', { name: 'Other source' }))
    await user.type(await screen.findByLabelText(/Make/), 'Aeroshell')
    await user.type(screen.getByLabelText(/Model \/ viscosity/), 'W100')
    await user.type(screen.getByLabelText(/Batch number/), 'FIELD-42')
    await user.type(quantityField(), '0.5')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      liquidType: LiquidType.OIL,
      oilSource: OilSource.OTHER,
      oilMake: 'Aeroshell',
      oilModelViscosity: 'W100',
      oilBatchNumber: 'FIELD-42',
      quantityLitres: 0.5,
    })
  })

  it('drops the canister choice when switching to another source, not just its fields', async () => {
    // Regression: only remainingLitres/markCanisterEmpty were cleared on this
    // switch, so a canister picked before switching to "Other source" silently
    // rode along in the submission (the CANISTER-only fields disappeared from
    // view, but oilCanisterId itself stayed set).
    const { user } = renderWithProviders(<LiquidReportForm />)
    await switchToOil(user)
    await user.click(await screen.findByRole('combobox', { name: 'Canister' }))
    await user.click(await screen.findByRole('option', { name: /MIK A 26\/1/ }))

    await user.click(screen.getByRole('button', { name: 'Other source' }))
    await user.type(await screen.findByLabelText(/Make/), 'Aeroshell')
    await user.type(screen.getByLabelText(/Model \/ viscosity/), 'W100')
    await user.type(screen.getByLabelText(/Batch number/), 'FIELD-42')
    await user.type(quantityField(), '0.5')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ oilSource: OilSource.OTHER })
    expect((posted[0] as { oilCanisterId?: string }).oilCanisterId).toBeUndefined()
  })
})

describe('LiquidReportForm — deep links and scans', () => {
  it('fills the form in from a scanned pump and says what was scanned', async () => {
    renderWithProviders(
      <LiquidReportForm
        prefill={{
          liquidType: LiquidType.FUEL,
          airport: 'EFNU',
          fuelType: 'JET A-1',
          label: 'EFNU · JET A-1',
        }}
        qrCode='MIK-L-7F3KM'
      />,
    )

    expect(await screen.findByText('Scanned: EFNU · JET A-1')).toBeInTheDocument()
    expect(screen.getByLabelText('Airport')).toHaveValue('EFNU')
    // Regression: a shared pump's QR code knows the fuel type before it knows
    // the aircraft, and the field used to look blank/disabled until the member
    // also picked a plane — hiding a value the scan had already provided.
    expect(fuelTypeSelect()).toHaveTextContent('JET A-1')
  })

  it('shows the fuel type a shared pump scanned even before an aircraft is chosen', async () => {
    const { user } = renderWithProviders(
      <LiquidReportForm
        prefill={{
          liquidType: LiquidType.FUEL,
          airport: 'EFNU',
          fuelType: 'JET A-1',
          label: 'EFNU · JET A-1',
        }}
      />,
    )

    await waitFor(() => expect(fuelTypeSelect()).toHaveTextContent('JET A-1'))

    // Once the member picks an aircraft that doesn't take it, it has to go —
    // the same "cannot take" rule a manually chosen fuel type already follows.
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-IHQ' }))
    await waitFor(() => expect(fuelTypeSelect()).not.toHaveTextContent('JET A-1'))
  })

  it('records which code was scanned, so provenance is answerable later', async () => {
    const { user } = renderWithProviders(
      <LiquidReportForm
        prefill={{
          liquidType: LiquidType.FUEL,
          aircraftRegistration: 'OH-STL',
          airport: 'EFNU',
          fuelType: 'JET A-1',
          label: 'OH-STL · EFNU · JET A-1',
        }}
        qrCode='MIK-L-7F3KM'
      />,
    )

    await user.type(await screen.findByLabelText(/Quantity \(litres\)/), '150')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ qrCode: 'MIK-L-7F3KM', source: 'QR' })
  })

  it('reads the same context out of a `?ac=&apt=&fuel=` deep link', async () => {
    renderWithProviders(<LiquidReportForm />, {
      route: '/liquid/new?ac=OH-STL&apt=EFNU&fuel=JET%20A-1',
    })

    expect(await screen.findByText('Scanned: OH-STL · EFNU · JET A-1')).toBeInTheDocument()
  })

  it('attaches the record to the flight it was reported from', async () => {
    const onSaved = vi.fn()
    const { user } = renderWithProviders(
      <LiquidReportForm
        prefill={{
          liquidType: LiquidType.FUEL,
          aircraftRegistration: 'OH-STL',
          airport: 'EFNU',
          fuelType: 'JET A-1',
          label: 'OH-STL',
        }}
        flightLogId='mikify'
        onSaved={onSaved}
      />,
    )

    await user.type(await screen.findByLabelText(/Quantity \(litres\)/), '150')
    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ flightLogId: 'mikify', source: 'FLIGHT_LOG' })
    expect(onSaved).toHaveBeenCalled()
  })
})

describe('LiquidReportForm — receipt capture', () => {
  // A receipt only makes sense for a purchase that is the member's own money —
  // AirBP/Kanair are club fuel cards, billed to the club directly.
  const goAwayWithProvider = async (
    user: ReturnType<typeof renderWithProviders>['user'],
    providerName: string,
  ) => {
    await user.click(await screen.findByRole('button', { name: 'Somewhere else' }))
    await user.click(aircraftSelect())
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.click(airportField())
    await user.click(await screen.findByRole('option', { name: 'EEPU: Pärnu' }))
    await user.click(screen.getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: providerName }))
  }

  it('does not offer a receipt for a club fuel card provider', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'AirBP')

    expect(screen.queryByText(/Receipt \(optional\)/)).not.toBeInTheDocument()
  })

  it('offers an optional receipt for a self-paid provider', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'Other / own payment')

    expect(await screen.findByText(/Receipt \(optional\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
  })

  it('hides the receipt field again after switching to a club fuel card provider', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'Other / own payment')
    expect(await screen.findByText(/Receipt \(optional\)/)).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'AirBP' }))

    expect(screen.queryByText(/Receipt \(optional\)/)).not.toBeInTheDocument()
  })

  it('lets the member remove a staged file before saving', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'Other / own payment')

    const [attachInput] = document.querySelectorAll('input[type="file"]')
    await user.upload(
      attachInput as HTMLInputElement,
      new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByText('receipt.jpg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove receipt.jpg' }))
    expect(screen.queryByText('receipt.jpg')).not.toBeInTheDocument()
  })

  it('saves the record and does not require a receipt — it is optional', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'Other / own payment')
    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.type(quantityField(), '40')

    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(postedAttachmentNames).toHaveLength(0)
  })

  it('uploads a staged receipt once the record is saved', async () => {
    const { user } = renderWithProviders(<LiquidReportForm />)
    await goAwayWithProvider(user, 'Other / own payment')
    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.type(quantityField(), '40')

    const [attachInput] = document.querySelectorAll('input[type="file"]')
    await user.upload(
      attachInput as HTMLInputElement,
      new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }),
    )

    await user.click(saveButton())

    await waitFor(() => expect(posted).toHaveLength(1))
    await waitFor(() => expect(postedAttachmentNames).toHaveLength(1))
    expect(postedAttachmentNames[0]).toHaveLength(1)
  })

  it('lets the member continue without the receipt when the upload fails', async () => {
    attachmentUploadStatus = 500
    const onSaved = vi.fn()
    const { user } = renderWithProviders(<LiquidReportForm onSaved={onSaved} />)
    await goAwayWithProvider(user, 'Other / own payment')
    await user.type(screen.getByLabelText(/Total cost/), '100')
    await user.type(quantityField(), '40')

    const [attachInput] = document.querySelectorAll('input[type="file"]')
    await user.upload(
      attachInput as HTMLInputElement,
      new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }),
    )
    await user.click(saveButton())

    // The record itself saved -- only the receipt failed -- so the member is
    // not sent away silently and isn't asked to resubmit the whole record.
    expect(await screen.findByText('Could not upload the receipt.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Continue without receipt' }))
    expect(onSaved).toHaveBeenCalled()
  })
})

describe('LiquidReportForm — failures', () => {
  it('shows the server’s reason rather than a generic failure', async () => {
    server.use(
      http.post(apiUrl('v1/liquid/records'), () =>
        HttpResponse.json(
          { status: 400, detail: 'OH-STL does not take 100LL. Allowed: JET A-1.' },
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    )

    const { user } = renderWithProviders(<LiquidReportForm />)
    await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))
    await user.click(screen.getByRole('button', { name: 'At EFNU' }))
    await user.type(quantityField(), '150')
    await user.click(saveButton())

    expect(
      await screen.findByText('OH-STL does not take 100LL. Allowed: JET A-1.'),
    ).toBeInTheDocument()
  })
})
