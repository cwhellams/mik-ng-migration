import type { ClubEvent } from '@mik/contracts/events'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import EventsAdmin from './EventsAdmin'

/**
 * Club event admin (#1115 §9). Two things carry real risk here: an event is
 * split across upcoming/past by comparing its *end* time to now, and the
 * per-language translation blocks are sent as an explicit `null` when removed
 * — anything else would leave a stale Finnish title live on mik.fi.
 */
const HOUR = 60 * 60 * 1000

const anEvent = (overrides: Partial<ClubEvent> = {}) =>
  ({
    eventId: 'evt-1',
    title: 'Spring fly-in',
    description: 'Come and fly',
    location: 'EFHF',
    performer: null,
    imageUrl: null,
    isPublic: false,
    startTime: new Date(Date.now() + 48 * HOUR).toISOString(),
    endTime: new Date(Date.now() + 50 * HOUR).toISOString(),
    translations: {},
    ...overrides,
  }) as ClubEvent

const aPastEvent = (overrides: Partial<ClubEvent> = {}) =>
  anEvent({
    eventId: 'evt-past',
    title: 'Winter hangar talk',
    startTime: new Date(Date.now() - 50 * HOUR).toISOString(),
    endTime: new Date(Date.now() - 48 * HOUR).toISOString(),
    ...overrides,
  })

type Write = { method: string; path: string; body: unknown }

const eventsApi = (events: ClubEvent[] = [anEvent()]) => {
  const state = { writes: [] as Write[] }

  server.use(
    http.get(apiUrl('v1/events'), () => HttpResponse.json({ events })),
    http.post(apiUrl('v1/events/:id/image'), async ({ params }) => {
      state.writes.push({ method: 'IMAGE_POST', path: String(params.id), body: null })
      return HttpResponse.json(anEvent({ imageUrl: 'https://cdn.example/evt.png' }))
    }),
    http.delete(apiUrl('v1/events/:id/image'), ({ params }) => {
      state.writes.push({ method: 'IMAGE_DELETE', path: String(params.id), body: null })
      return HttpResponse.json(anEvent())
    }),
    http.post(apiUrl('v1/events'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(anEvent({ eventId: 'evt-new' }))
    }),
    http.put(apiUrl('v1/events/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(anEvent())
    }),
    http.delete(apiUrl('v1/events/:id'), ({ params }) => {
      state.writes.push({ method: 'DELETE', path: String(params.id), body: null })
      return HttpResponse.json({})
    }),
  )

  return state
}

/** The row wrapper for an event, used to disambiguate its Edit/Delete buttons. */
const rowFor = (title: string) =>
  screen.getByText(title).closest('div')!.parentElement!.parentElement!

const openCreate = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Create Event' }))
  return screen.findByRole('dialog')
}

const openEdit = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  title = 'Spring fly-in',
) => {
  await screen.findByText(title)
  await user.click(within(rowFor(title)).getByRole('button', { name: 'Edit' }))
  return screen.findByRole('dialog')
}

describe('EventsAdmin listing', () => {
  it('separates upcoming events from past ones', async () => {
    eventsApi([anEvent(), aPastEvent()])

    renderWithProviders(<EventsAdmin />)

    expect(await screen.findByText('Upcoming Events')).toBeInTheDocument()
    expect(screen.getByText('Past Events')).toBeInTheDocument()
    expect(screen.getByText('Spring fly-in')).toBeInTheDocument()
    expect(screen.getByText('Winter hangar talk')).toBeInTheDocument()
  })

  it('counts an event still running as upcoming, going by its end time', async () => {
    eventsApi([
      anEvent({
        startTime: new Date(Date.now() - HOUR).toISOString(),
        endTime: new Date(Date.now() + HOUR).toISOString(),
      }),
    ])

    renderWithProviders(<EventsAdmin />)

    expect(await screen.findByText('Upcoming Events')).toBeInTheDocument()
    expect(screen.queryByText('Past Events')).toBeNull()
  })

  it('marks a past event and a public one', async () => {
    eventsApi([anEvent({ isPublic: true }), aPastEvent()])

    renderWithProviders(<EventsAdmin />)

    expect(await screen.findByText('Public')).toBeInTheDocument()
    expect(screen.getByText('Past')).toBeInTheDocument()
  })

  it('says so when nothing is scheduled', async () => {
    eventsApi([])

    renderWithProviders(<EventsAdmin />)

    expect(await screen.findByText('No events scheduled.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(http.get(apiUrl('v1/events'), () => problemResponse(500, 'Down')))

    renderWithProviders(<EventsAdmin />)

    expect(await screen.findByText(/Down/)).toBeInTheDocument()
  })

  it('shows the location only when the event has one', async () => {
    eventsApi([anEvent(), anEvent({ eventId: 'evt-2', title: 'Online AGM', location: null })])

    renderWithProviders(<EventsAdmin />)
    await screen.findByText('Online AGM')

    expect(screen.getByText('EFHF')).toBeInTheDocument()
    expect(within(rowFor('Online AGM')).queryByText('EFHF')).toBeNull()
  })
})

describe('EventsAdmin creating', () => {
  it('needs a title before it will save', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: /Title \(English\)/ }), 'Autumn fly-in')

    expect(q.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('treats a title of only spaces as missing', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Title \(English\)/ }), '   ')

    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts the event with its times as UTC instants', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Title \(English\)/ }), 'Autumn fly-in')
    await user.type(q.getByRole('textbox', { name: 'Location' }), 'EFHK')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    const body = state.writes[0].body as Record<string, string>
    expect(state.writes[0].method).toBe('POST')
    expect(body.title).toBe('Autumn fly-in')
    expect(body.location).toBe('EFHK')
    expect(body.startTime).toMatch(/Z$/)
    expect(new Date(body.endTime).getTime()).toBeGreaterThan(new Date(body.startTime).getTime())
  })

  it('sends the optional fields as null rather than empty strings', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)

    await user.type(
      within(dialog).getByRole('textbox', { name: /Title \(English\)/ }),
      'Autumn fly-in',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      description: null,
      location: null,
      performer: null,
    })
  })

  it('defaults a new event to private', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)

    expect(within(dialog).getByRole('switch', { name: 'Public event' })).not.toBeChecked()

    await user.type(
      within(dialog).getByRole('textbox', { name: /Title \(English\)/ }),
      'Autumn fly-in',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ isPublic: false })
  })

  it('reports a rejected save without closing the dialog', async () => {
    eventsApi()
    server.use(http.post(apiUrl('v1/events'), () => problemResponse(400, 'Bad')))

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)

    await user.type(
      within(dialog).getByRole('textbox', { name: /Title \(English\)/ }),
      'Autumn fly-in',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Failed to save the event. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('starts a fresh form rather than reusing the last event edited', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    await openEdit(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const dialog = await openCreate(user)

    expect(within(dialog).getByRole('textbox', { name: /Title \(English\)/ })).toHaveValue('')
  })
})

describe('EventsAdmin editing', () => {
  it('pre-fills the dialog from the event', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const q = within(await openEdit(user))

    expect(q.getByRole('textbox', { name: /Title \(English\)/ })).toHaveValue('Spring fly-in')
    expect(q.getByRole('textbox', { name: 'Location' })).toHaveValue('EFHF')
    expect(q.getByRole('textbox', { name: /Description \(English\)/ })).toHaveValue('Come and fly')
  })

  it('puts the change against the event it was editing', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)

    const title = within(dialog).getByRole('textbox', { name: /Title \(English\)/ })
    await user.clear(title)
    await user.type(title, 'Spring fly-in 2027')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'evt-1',
      body: { title: 'Spring fly-in 2027' },
    })
  })

  it('closes once the save goes through', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('EventsAdmin translations', () => {
  const withFinnish = () =>
    anEvent({
      translations: {
        fi: { title: 'Kevätlentonäytös', description: 'Tervetuloa' },
      },
    } as Partial<ClubEvent>)

  it('pre-fills an existing translation block', async () => {
    eventsApi([withFinnish()])

    const { user } = renderWithProviders(<EventsAdmin />)
    const q = within(await openEdit(user))

    expect(q.getByText('Finnish')).toBeInTheDocument()
    expect(q.getByRole('textbox', { name: 'Title' })).toHaveValue('Kevätlentonäytös')
    expect(q.getByRole('textbox', { name: 'Description' })).toHaveValue('Tervetuloa')
  })

  it('offers only the languages not already translated', async () => {
    eventsApi([withFinnish()])

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add translation' }))

    const options = await screen.findAllByRole('menuitem')
    expect(options.map((o) => o.textContent)).toEqual(['Swedish'])
  })

  it('will not save a translation block left without a title', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)
    const q = within(dialog)

    await user.click(q.getByRole('button', { name: 'Add translation' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Finnish' }))

    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: 'Title' }), 'Kevätlentonäytös')

    expect(q.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('sends an added translation with a null description when left blank', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)
    const q = within(dialog)

    await user.click(q.getByRole('button', { name: 'Add translation' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Finnish' }))
    await user.type(q.getByRole('textbox', { name: 'Title' }), 'Kevätlentonäytös')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      translations: { fi: { title: 'Kevätlentonäytös', description: null } },
    })
  })

  it('sends an explicit null so a removed translation is actually deleted', async () => {
    const state = eventsApi([withFinnish()])

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)
    const q = within(dialog)

    await user.click(q.getByRole('button', { name: 'Remove translation' }))
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    // Omitting the key would leave the old Finnish title live on mik.fi.
    expect(
      (state.writes[0].body as { translations: Record<string, unknown> }).translations.fi,
    ).toBeNull()
  })

  it('omits translations entirely when the event never had any', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).not.toHaveProperty('translations')
  })
})

describe('EventsAdmin images', () => {
  const anImage = () => new File(['x'], 'flyer.png', { type: 'image/png' })

  it('rejects a file that is not a supported image', async () => {
    eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)

    // The input's own accept list would drop a PDF before the component ever
    // saw it, so this needs a user-event instance set up to ignore accept —
    // it is a setup option, not a per-call one.
    const lenient = userEvent.setup({ applyAccept: false })
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    await lenient.upload(input, new File(['x'], 'notes.pdf', { type: 'application/pdf' }))

    expect(within(dialog).getByText('Please choose a JPEG, PNG or WebP image.')).toBeInTheDocument()
  })

  it('uploads the picked image against the event once it has been created', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Title \(English\)/ }), 'Autumn fly-in')
    await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, anImage())
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(2))
    // The event has to exist before its image can be attached.
    expect(state.writes[0].method).toBe('POST')
    expect(state.writes[1]).toMatchObject({ method: 'IMAGE_POST', path: 'evt-new' })
  })

  it('deletes the image when an existing one is removed', async () => {
    const state = eventsApi([anEvent({ imageUrl: 'https://cdn.example/old.png' })])

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)
    const q = within(dialog)

    await user.click(q.getByRole('button', { name: 'Remove image' }))
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(2))
    expect(state.writes[1]).toMatchObject({ method: 'IMAGE_DELETE', path: 'evt-1' })
  })

  it('leaves the image alone when it was not touched', async () => {
    const state = eventsApi([anEvent({ imageUrl: 'https://cdn.example/old.png' })])

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openEdit(user)

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].method).toBe('PUT')
  })

  it('reports a failed upload and keeps the dialog open', async () => {
    eventsApi()
    server.use(http.post(apiUrl('v1/events/:id/image'), () => problemResponse(413, 'Too big')))

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Title \(English\)/ }), 'Autumn fly-in')
    await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, anImage())
    await user.click(q.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Failed to upload the image. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('EventsAdmin deleting', () => {
  const openDelete = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await screen.findByText('Spring fly-in')
    await user.click(within(rowFor('Spring fly-in')).getByRole('button', { name: 'Delete' }))
    return screen.findByRole('dialog')
  }

  it('names the event in the confirmation before anything is deleted', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openDelete(user)

    expect(within(dialog).getByText(/"Spring fly-in"/)).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })

  it('deletes the event once confirmed', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openDelete(user)

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'DELETE', path: 'evt-1' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('abandons the delete on cancel', async () => {
    const state = eventsApi()

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openDelete(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })

  it('reports a rejected delete without closing the confirmation', async () => {
    eventsApi()
    server.use(http.delete(apiUrl('v1/events/:id'), () => problemResponse(409, 'Nope')))

    const { user } = renderWithProviders(<EventsAdmin />)
    const dialog = await openDelete(user)

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Failed to delete the event. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
