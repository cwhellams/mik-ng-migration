import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs } from '../../../test/auth'
import { aMember, aMemberListEntry, aMemberListResponse } from '../../../test/fixtures'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { FleetManagerContacts } from './FleetManagerContacts'

const stubMembers = (members = aMemberListResponse().members) => {
  server.use(http.get(apiUrl('v1/members'), () => HttpResponse.json({ members })))
}

describe('FleetManagerContacts', () => {
  it('lists a fleet manager by name with a clickable phone number', async () => {
    signInAs(aMember())
    stubMembers([
      aMemberListEntry({
        memberId: 'plane-captain-1',
        first: 'Pekka',
        last: 'Kalustovastaava',
        phoneNumber: '040 999 8888',
        roles: ['PLANE_CAPTAIN'],
      }),
    ])

    renderWithProviders(<FleetManagerContacts />)

    expect(await screen.findByText('Pekka Kalustovastaava')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '040 999 8888' })).toHaveAttribute(
      'href',
      'tel:0409998888',
    )
  })

  it('lists every fleet manager returned by the API', async () => {
    signInAs(aMember())
    stubMembers([
      aMemberListEntry({
        memberId: 'plane-captain-1',
        first: 'Pekka',
        last: 'Kalustovastaava',
        phoneNumber: '0409998888',
        roles: ['PLANE_CAPTAIN'],
      }),
      aMemberListEntry({
        memberId: 'plane-captain-2',
        first: 'Anna',
        last: 'Ilmailija',
        phoneNumber: '0401112222',
        roles: ['PLANE_CAPTAIN'],
      }),
    ])

    renderWithProviders(<FleetManagerContacts />)

    expect(await screen.findByText('Pekka Kalustovastaava')).toBeInTheDocument()
    expect(screen.getByText('Anna Ilmailija')).toBeInTheDocument()
  })

  it('omits a fleet manager with no phone number on file', async () => {
    signInAs(aMember())
    stubMembers([
      aMemberListEntry({
        memberId: 'plane-captain-1',
        first: 'Pekka',
        last: 'Kalustovastaava',
        phoneNumber: null,
        roles: ['PLANE_CAPTAIN'],
      }),
    ])

    renderWithProviders(<FleetManagerContacts />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Pekka Kalustovastaava')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no fleet managers to show', async () => {
    signInAs(aMember())
    stubMembers([])

    const { container } = renderWithProviders(<FleetManagerContacts />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })
})
