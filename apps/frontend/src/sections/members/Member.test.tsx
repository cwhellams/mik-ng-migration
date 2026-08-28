import { useEffect } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { MIKMemberTypes, MIKPermissions } from '@mik/contracts/members'
import { renderAs, authScenarios } from '../../test/auth'
import {
  aFlightLogListEntry,
  aFlightLogListResponse,
  aMember,
  aRoleWithPermissions,
  FIXTURE_TIMESTAMP,
} from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import MemberProfile from './Member'

// See AvatarUpload.test.tsx: the real Cropper needs image decoding jsdom doesn't do.
// Firing onCropComplete from an effect (not render) avoids a setState-in-render loop.
vi.mock('react-easy-crop', () => {
  const CropperStub = ({
    onCropComplete,
  }: {
    onCropComplete: (a: unknown, b: unknown) => void
  }) => {
    useEffect(() => {
      onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid='cropper-stub' />
  }
  return { default: CropperStub }
})

// jsdom has no real canvas/Image decoding, so the real cropImage util would hang.
vi.mock('./components/cropImage', () => ({
  getCroppedImageBlob: vi.fn(async () => new Blob(['cropped'], { type: 'image/jpeg' })),
}))

const removedMember = aMember({
  memberId: 'Removed1',
  memberType: MIKMemberTypes.REMOVED,
  roles: [],
})

/** An admin who only holds MEMBER_ADMIN — keeps AdminBookingsCard from mounting and needing its own mock. */
const membersAdmin = aMember({
  memberId: 'MembersAdmin1',
  roles: [aRoleWithPermissions(MIKPermissions.MEMBER_ADMIN)],
})

const mockMemberEndpoints = () => {
  server.use(
    http.get(apiUrl(`v1/members/${removedMember.memberId}`), () =>
      HttpResponse.json(removedMember),
    ),
    http.get(apiUrl('v1/members/mailing-lists'), () => HttpResponse.json([])),
    http.get(apiUrl(`v1/members/${removedMember.memberId}/invoices`), () =>
      HttpResponse.json({ invoices: [] }),
    ),
    http.get(apiUrl(`v1/members/${removedMember.memberId}/flights`), () =>
      HttpResponse.json({ logs: [] }),
    ),
    http.get(apiUrl(`v1/members/${removedMember.memberId}/reservation-efficiency`), () =>
      HttpResponse.json({
        memberId: removedMember.memberId,
        from: FIXTURE_TIMESTAMP,
        to: FIXTURE_TIMESTAMP,
        summary: {
          bookingCount: 0,
          cancelledCount: 0,
          underusedCount: 0,
          noShowCount: 0,
          totalReservedMins: 0,
          totalFlightMins: 0,
          memberEfficiencyPct: 0,
          clubEfficiencyPct: 0,
        },
        entries: [],
      }),
    ),
  )
}

const renderProfile = () =>
  renderAs({ name: 'members admin', member: membersAdmin, sudo: true }, <MemberProfile />, {
    route: `/club/members/${removedMember.memberId}`,
    path: '/club/members/:memberId',
  })

describe('Member profile restore', () => {
  it('shows a Restore Member button for a removed member, not Deactivate', async () => {
    mockMemberEndpoints()

    renderProfile()

    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate Member' })).not.toBeInTheDocument()
  })

  it('restores the member and shows the credited-fee and roles warnings', async () => {
    mockMemberEndpoints()
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () =>
        HttpResponse.json({ member: removedMember, hadCreditedFee: true }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(screen.getByText(/annual\/joining fee was credited/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/roles were cleared/i)).toBeInTheDocument()
  })

  it('omits the credited-fee warning when the fee was not credited', async () => {
    mockMemberEndpoints()
    server.use(
      http.post(apiUrl(`v1/members/${removedMember.memberId}/restore`), () =>
        HttpResponse.json({ member: removedMember, hadCreditedFee: false }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(screen.getByText(/roles were cleared/i)).toBeInTheDocument())
    expect(screen.queryByText(/annual\/joining fee was credited/i)).not.toBeInTheDocument()
  })
})

describe('Own profile avatar upload', () => {
  const renderOwnProfile = (member = aMember({ avatarUrl: undefined })) =>
    renderAs({ ...authScenarios.user, member }, <MemberProfile />, {
      route: '/club/members/me',
      path: '/club/members/:memberId',
    })

  const mockOwnProfileEndpoints = () => {
    server.use(
      http.get(apiUrl('v1/members/mailing-lists'), () => HttpResponse.json([])),
      http.get(apiUrl('v1/members/me/passkeys'), () => HttpResponse.json({ passkeys: [] })),
    )
  }

  it('shows the avatar upload controls only on your own profile, not when viewing another member', async () => {
    mockOwnProfileEndpoints()
    renderOwnProfile()

    expect(await screen.findByRole('button', { name: /change photo/i })).toBeInTheDocument()
  })

  it('hides the avatar upload controls when viewing another member', async () => {
    mockMemberEndpoints()

    renderProfile()

    await screen.findByText(removedMember.firstName!)
    expect(screen.queryByRole('button', { name: /change photo/i })).not.toBeInTheDocument()
  })

  it('shows Remove photo once the member already has an avatar', async () => {
    mockOwnProfileEndpoints()
    renderOwnProfile(aMember({ avatarUrl: 'https://spaces.example.com/member-avatars/a.jpg' }))

    expect(await screen.findByRole('button', { name: /remove photo/i })).toBeInTheDocument()
  })

  it('saves the crop by POSTing a multipart file to v1/members/me/avatar', async () => {
    mockOwnProfileEndpoints()
    const me = aMember({ avatarUrl: undefined })
    let uploadCount = 0
    server.use(
      http.post(apiUrl('v1/members/me/avatar'), () => {
        uploadCount += 1
        return HttpResponse.json({ ...me, avatarUrl: 'https://spaces.example.com/new.jpg' })
      }),
    )

    const { user } = renderOwnProfile(me)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))

    await screen.findByTestId('cropper-stub')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Cropper dialog closes once the upload resolves — the same signal the AvatarUpload
    // unit tests use, since (see below) SWR's cache is scoped per-render by the test
    // harness and the app's global `mutate()` call can't reach it, so the surrounding
    // page never re-renders with the new avatarUrl in this environment.
    await waitFor(() => expect(screen.queryByTestId('cropper-stub')).not.toBeInTheDocument())
    expect(uploadCount).toBe(1)
  })

  it('sends DELETE v1/members/me/avatar after confirmation', async () => {
    mockOwnProfileEndpoints()
    const me = aMember({ avatarUrl: 'https://spaces.example.com/member-avatars/a.jpg' })
    let deleteCount = 0
    server.use(
      http.delete(apiUrl('v1/members/me/avatar'), () => {
        deleteCount += 1
        return HttpResponse.json({ ...me, avatarUrl: null })
      }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { user } = renderOwnProfile(me)

    await user.click(await screen.findByRole('button', { name: /remove photo/i }))

    await waitFor(() => expect(deleteCount).toBe(1))
  })

  it('PATCHes v1/members/me/avatar-style when a style swatch is clicked', async () => {
    mockOwnProfileEndpoints()
    const me = aMember({ avatarUrl: undefined })
    let patchCount = 0
    let patchedStyle: unknown
    server.use(
      http.patch(apiUrl('v1/members/me/avatar-style'), async ({ request }) => {
        patchCount += 1
        const body = (await request.json()) as { style: string }
        patchedStyle = body.style
        return HttpResponse.json({ ...me, avatarStyle: body.style })
      }),
    )

    const { user } = renderOwnProfile(me)

    await user.click(await screen.findByRole('button', { name: /robot/i }))

    await waitFor(() => expect(patchCount).toBe(1))
    expect(patchedStyle).toBe('bottts')
  })
})

/**
 * #1249: the card is MEMBER_ADMIN's, but the flight log it links out to is
 * FLIGHTLOG_ADMIN's — the backend refuses `anyCrewMemberId` to anyone else. A member
 * admin without flight-log admin was being offered the button and landing on a 403.
 */
describe('Member profile — view all flights', () => {
  const withFlights = () => {
    mockMemberEndpoints()
    server.use(
      http.get(apiUrl(`v1/members/${removedMember.memberId}/flights`), () =>
        HttpResponse.json(aFlightLogListResponse([aFlightLogListEntry()])),
      ),
    )
  }

  const renderAsAdminWith = (...permissions: MIKPermissions[]) =>
    renderAs(
      {
        name: 'admin',
        member: aMember({
          memberId: 'FlightsAdmin1',
          roles: [aRoleWithPermissions(...permissions)],
        }),
        sudo: true,
      },
      <MemberProfile />,
      { route: `/club/members/${removedMember.memberId}`, path: '/club/members/:memberId' },
    )

  it('links a flight-log admin to the member own filtered log', async () => {
    withFlights()

    renderAsAdminWith(MIKPermissions.MEMBER_ADMIN, MIKPermissions.FLIGHTLOG_ADMIN)

    expect(await screen.findByRole('link', { name: /view all flights/i })).toHaveAttribute(
      'href',
      `/logs?anyCrewMemberId=${removedMember.memberId}`,
    )
  })

  it('offers no such link to a member admin who is not a flight-log admin', async () => {
    withFlights()

    renderAsAdminWith(MIKPermissions.MEMBER_ADMIN)

    // The card itself is still there — only the way into the flight log is withheld.
    expect(await screen.findByText('Recent Flights')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view all flights/i })).not.toBeInTheDocument()
  })
})
