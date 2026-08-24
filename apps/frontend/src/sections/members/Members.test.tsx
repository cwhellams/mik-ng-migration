import { MIKPermissions } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { aMemberListEntry, aMemberListResponse } from '../../test/fixtures'
import { signInWithPermissions } from '../../test/auth'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import Members from './Members'

/**
 * `member.selectMember` interpolates a member's full name into the row
 * checkbox's accessible name. Issue #1255: i18next escaped the interpolated
 * value, so a name with an apostrophe became `O&#39;Brien` — which a
 * screen reader would read out character by character.
 */
const membersApi = (first: string, last: string) =>
  server.use(
    http.get(apiUrl('v1/members'), () =>
      HttpResponse.json(aMemberListResponse([aMemberListEntry({ memberId: '9001', first, last })])),
    ),
  )

describe('Members selection', () => {
  it("labels a row checkbox with the member's name, apostrophe unescaped (issue #1255)", async () => {
    // MEMBER_ADMIN is what renders the per-row checkbox at all, and the row must
    // not be the signed-in member's own.
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)
    membersApi('Niko', "O'Brien")

    renderWithProviders(<Members />, { sudo: true })

    expect(await screen.findByRole('checkbox', { name: "Select Niko O'Brien" })).toBeInTheDocument()
  })

  it('does not emit an HTML entity for a name containing a slash or ampersand', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)
    membersApi('Anne-Marie', 'Smith & Jones')

    renderWithProviders(<Members />, { sudo: true })

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Select Anne-Marie Smith & Jones',
    })
    expect(checkbox.getAttribute('aria-label')).not.toContain('&amp;')
  })
})
