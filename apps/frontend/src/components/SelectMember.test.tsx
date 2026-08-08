import { MIKMemberTypes } from '@backend/routes/members/models'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { aMemberListEntry, INSTRUCTOR_MEMBER_ID, MEMBER_ID } from '../test/fixtures'
import { apiUrl } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { SelectMember } from './SelectMember'

/** Serves the member list and records the filters each request carried. */
const memberList = () => {
  const searches: string[] = []
  server.use(
    http.get(apiUrl('v1/members'), ({ request }) => {
      searches.push(new URL(request.url).search)
      return HttpResponse.json({
        members: [
          aMemberListEntry(),
          aMemberListEntry({
            memberId: INSTRUCTOR_MEMBER_ID,
            first: 'Jukka',
            last: 'Nieminen',
          }),
        ],
      })
    }),
  )
  return searches
}

const renderSelect = (props: Partial<Parameters<typeof SelectMember>[0]> = {}) => {
  const onChange = vi.fn()
  const rendered = renderWithProviders(
    <SelectMember value={null} onChange={onChange} label='Pilot in command' {...props} />,
  )
  return { ...rendered, onChange }
}

describe('SelectMember', () => {
  it('lists the members it fetched', async () => {
    memberList()
    const { user } = renderSelect()

    await user.click(screen.getByRole('combobox', { name: 'Pilot in command' }))

    expect(await screen.findByText('Matti Virtanen')).toBeInTheDocument()
    expect(screen.getByText('Jukka Nieminen')).toBeInTheDocument()
  })

  it('shows the member matching the current value', async () => {
    memberList()
    renderSelect({ value: MEMBER_ID })

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('Matti Virtanen'))
  })

  it('filters by role by default', async () => {
    const searches = memberList()
    renderSelect()

    await waitFor(() => expect(searches).toHaveLength(1))
    expect(searches[0]).toBe('?role=MEMBER')
  })

  it('filters by a role it is given', async () => {
    const searches = memberList()
    renderSelect({ role: 'INSTRUCTOR' })

    await waitFor(() => expect(searches).toHaveLength(1))
    expect(searches[0]).toBe('?role=INSTRUCTOR')
  })

  it('filters by member type instead of role when one is given', async () => {
    const searches = memberList()
    renderSelect({ memberType: MIKMemberTypes.FLYING })

    await waitFor(() => expect(searches).toHaveLength(1))
    expect(searches[0]).toBe('?memberType=FLYING')
  })

  it('leaves out members the caller excludes', async () => {
    memberList()
    const { user } = renderSelect({ exclude: [INSTRUCTOR_MEMBER_ID] })

    await user.click(screen.getByRole('combobox'))

    expect(await screen.findByText('Matti Virtanen')).toBeInTheDocument()
    expect(screen.queryByText('Jukka Nieminen')).toBeNull()
  })

  it('offers caller-supplied entries alongside the fetched members', async () => {
    memberList()
    const { user } = renderSelect({
      entries: [{ id: 'GUEST', label: 'Guest pilot', group: 'Other' }],
    })

    await user.click(screen.getByRole('combobox'))

    expect(await screen.findByText('Guest pilot')).toBeInTheDocument()
    expect(screen.getByText('Matti Virtanen')).toBeInTheDocument()
  })

  it('reports the whole entry, not just the id', async () => {
    memberList()
    const { user, onChange } = renderSelect()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Jukka Nieminen'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTRUCTOR_MEMBER_ID, label: 'Jukka Nieminen' }),
    )
  })

  it('reports null when the selection is cleared', async () => {
    memberList()
    const { user, onChange } = renderSelect({ value: MEMBER_ID })

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('Matti Virtanen'))

    // MUI only puts the clear button in the accessibility tree once focused.
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('can be disabled', async () => {
    memberList()
    renderSelect({ disabled: true })

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('renders an empty picker while the members are loading', () => {
    memberList()
    renderSelect({ value: MEMBER_ID })

    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
