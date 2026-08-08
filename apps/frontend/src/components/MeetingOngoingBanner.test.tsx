import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { MeetingOngoingBanner } from './MeetingOngoingBanner'

const activeMeeting = (body: Record<string, unknown> | null) =>
  server.use(http.get(apiUrl('v1/meetings/active'), () => HttpResponse.json(body)))

describe('MeetingOngoingBanner', () => {
  it('announces a meeting that is under way', async () => {
    activeMeeting({ meetingId: '1', title: 'Spring general meeting', status: 'ONGOING' })

    renderWithProviders(<MeetingOngoingBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Spring general meeting is ongoing')
  })

  it('links straight into the meeting', async () => {
    activeMeeting({ meetingId: '1', title: 'Spring general meeting', status: 'ONGOING' })

    renderWithProviders(<MeetingOngoingBanner />)

    expect(await screen.findByRole('link', { name: 'Open meeting' })).toHaveAttribute(
      'href',
      '/club/meetings',
    )
  })

  it.each(['SCHEDULED', 'CLOSED'])('stays hidden for a %s meeting', async (status) => {
    activeMeeting({ meetingId: '1', title: 'Spring general meeting', status })

    renderWithProviders(<MeetingOngoingBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('stays hidden when there is no meeting at all', async () => {
    activeMeeting(null)

    renderWithProviders(<MeetingOngoingBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('stays hidden when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/meetings/active'), () => problemResponse(500, 'Down')))

    renderWithProviders(<MeetingOngoingBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
