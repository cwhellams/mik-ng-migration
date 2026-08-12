import { MIKPermissions } from '@mik/contracts/members'
import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signInAs, signInWithPermissions } from '../test/auth'
import { aMember, MEMBER_ID } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useInvoicePdfDownload } from './useInvoicePdfDownload'

/** A one-byte PDF, base64 encoded — enough for atob to succeed. */
const PDF_BASE64 = btoa('%PDF-1.4')

const renderDownload = (
  options: { invoiceNumber?: string | null; billableMemberId?: string | null; sudo?: boolean } = {},
) => {
  const { invoiceNumber = '1234', billableMemberId = MEMBER_ID, sudo = false } = options
  return renderHookWithProviders(() => useInvoicePdfDownload({ invoiceNumber, billableMemberId }), {
    sudo,
  })
}

/** Waits for useRoles to settle so canDownloadInvoice sees the real permissions. */
const settled = async <T extends { result: { current: { canDownloadInvoice: () => boolean } } }>(
  rendered: T,
  expected: boolean,
): Promise<T> => {
  await waitFor(() => expect(rendered.result.current.canDownloadInvoice()).toBe(expected))
  return rendered
}

let clicks: string[]

beforeEach(() => {
  clicks = []
  // The download works by clicking a synthetic anchor; capture it instead.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download)
  })
})

afterEach(() => vi.restoreAllMocks())

describe('canDownloadInvoice', () => {
  it('lets a member download their own invoice', async () => {
    signInAs(aMember())

    await settled(renderDownload(), true)
  })

  it('refuses a member someone else’s invoice', async () => {
    signInAs(aMember())

    await settled(renderDownload({ billableMemberId: 'Anna1' }), false)
  })

  it('lets an invoicing admin in sudo mode download anyone’s invoice', async () => {
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    await settled(renderDownload({ billableMemberId: 'Anna1', sudo: true }), true)
  })

  it('refuses the same admin while sudo is off', async () => {
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    await settled(renderDownload({ billableMemberId: 'Anna1', sudo: false }), false)
  })

  it.each([
    ['a missing invoice number', null],
    ['an empty invoice number', ''],
    ['a non-numeric invoice number', 'DRAFT-1'],
    ['a fractional invoice number', '12.5'],
    ['zero', '0'],
    ['a negative number', '-3'],
  ])('refuses %s', async (_label, invoiceNumber) => {
    // The backend PDF endpoint rejects anything that is not a positive integer,
    // so the button stays disabled rather than producing a 400.
    signInWithPermissions(MIKPermissions.INVOICING_ADMIN)

    await settled(renderDownload({ invoiceNumber, sudo: true }), false)
  })
})

describe('handleDownloadPDF', () => {
  it('fetches the PDF and downloads it under the invoice number', async () => {
    signInAs(aMember())
    const paths: string[] = []
    server.use(
      http.get(apiUrl('v1/invoices/1234/pdf'), ({ request }) => {
        paths.push(new URL(request.url).pathname)
        return HttpResponse.json(PDF_BASE64)
      }),
    )

    const { result } = await settled(renderDownload(), true)

    await act(() => result.current.handleDownloadPDF())

    expect(paths).toEqual(['/api/v1/invoices/1234/pdf'])
    expect(clicks).toEqual(['invoice-1234.pdf'])
  })

  it('does nothing when the caller is not allowed to download', async () => {
    signInAs(aMember())
    const state = { calls: 0 }
    server.use(
      http.get(apiUrl('v1/invoices/1234/pdf'), () => {
        state.calls++
        return HttpResponse.json(PDF_BASE64)
      }),
    )

    const { result } = await settled(renderDownload({ billableMemberId: 'Anna1' }), false)

    await act(() => result.current.handleDownloadPDF())

    // Guards against a direct call bypassing the disabled button.
    expect(state.calls).toBe(0)
    expect(clicks).toEqual([])
  })

  it('reports the failure and downloads nothing when the API refuses', async () => {
    signInAs(aMember())
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(http.get(apiUrl('v1/invoices/1234/pdf'), () => problemResponse(404, 'No invoice')))

    const { result } = await settled(renderDownload(), true)

    await act(() => result.current.handleDownloadPDF())

    expect(clicks).toEqual([])
    expect(logged).toHaveBeenCalledWith('Failed to fetch invoice PDF:', {
      status: 404,
      detail: 'No invoice',
    })
  })

  it('clears the loading flag even when the download fails', async () => {
    signInAs(aMember())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(http.get(apiUrl('v1/invoices/1234/pdf'), () => problemResponse(500, 'Boom')))

    const { result } = await settled(renderDownload(), true)

    expect(result.current.loading).toBe(false)
    await act(() => result.current.handleDownloadPDF())
    expect(result.current.loading).toBe(false)
  })
})
