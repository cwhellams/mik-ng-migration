import { screen, waitFor } from '@testing-library/react'
import { MIKPermissions } from '@mik/contracts/members'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { InvoicePdfLink } from './InvoicePdfLink'
import { signInAs, signInWithPermissions } from '../test/auth'
import { aMember, MEMBER_ID } from '../test/fixtures'
import { apiUrl } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'

/**
 * The download link is a permission gate rendered as a button, so it is tested
 * against the whole identity set rather than just the case that works: it must
 * appear for the invoicing admin and for the member being billed, and for
 * nobody else.
 */
const OTHER_MEMBER = 'Liisa1'

const renderLink = (props: Partial<Parameters<typeof InvoicePdfLink>[0]> = {}) =>
  renderWithProviders(<InvoicePdfLink invoiceId='4711' billableMemberId={MEMBER_ID} {...props} />, {
    sudo: true,
  })

describe('InvoicePdfLink visibility', () => {
  it('shows for an invoicing admin looking at someone else’s invoice', async () => {
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    renderLink({ billableMemberId: OTHER_MEMBER })

    expect(await screen.findByRole('button')).toBeInTheDocument()
  })

  it('shows for the member the invoice is billed to', async () => {
    signInAs(aMember())

    renderLink()

    expect(await screen.findByRole('button')).toBeInTheDocument()
  })

  it('hides from a member looking at somebody else’s invoice', async () => {
    signInAs(aMember())

    renderLink({ billableMemberId: OTHER_MEMBER })

    // Nothing to wait for — the component renders null — so settle the identity
    // request first and then assert the absence.
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument())
  })

  it('hides when the invoice id is not a usable invoice number', async () => {
    // The backend PDF endpoint rejects a non-numeric id with a 400, so offering
    // the button at all would only produce a failed download.
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    for (const invoiceId of ['', 'DRAFT-1', '0', '-3', '4.5']) {
      const { unmount } = renderLink({ invoiceId })
      await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument())
      unmount()
    }
  })

  it('hides from an invoicing admin who has not switched admin mode on', async () => {
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    renderWithProviders(<InvoicePdfLink invoiceId='4711' billableMemberId={OTHER_MEMBER} />, {
      sudo: false,
    })

    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument())
  })

  it('shows for an invoicing admin with admin mode off when alwaysSudo is set', async () => {
    // For places already behind their own admin gate — see the option's doc on
    // useInvoicePdfDownload.
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    renderWithProviders(
      <InvoicePdfLink invoiceId='4711' billableMemberId={OTHER_MEMBER} alwaysSudo />,
      { sudo: false },
    )

    expect(await screen.findByRole('button')).toBeInTheDocument()
  })
})

describe('InvoicePdfLink download', () => {
  it('fetches the PDF for the invoice it was given', async () => {
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    const requested: string[] = []
    server.use(
      http.get(apiUrl('v1/invoices/:invoiceId/pdf'), ({ params }) => {
        requested.push(String(params.invoiceId))
        return HttpResponse.json(btoa('%PDF-1.4 pretend'))
      }),
    )
    // jsdom implements neither, and the download path calls both.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { user } = renderLink({ billableMemberId: OTHER_MEMBER })

    await user.click(await screen.findByRole('button'))

    await waitFor(() => expect(requested).toEqual(['4711']))
  })
})
