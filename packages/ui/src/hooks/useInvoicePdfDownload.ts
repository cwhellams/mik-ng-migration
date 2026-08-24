import { useState } from 'react'
import useApi from '@mik/ui/hooks/useApi'
import { useRoles } from './useRoles'
import { downloadBase64Pdf } from '../utils/pdfDownload'
import { MIKPermissions } from '@mik/contracts/members'

interface UseInvoicePdfDownloadOptions {
  invoiceNumber: string | null | undefined
  billableMemberId: string | null | undefined
  /**
   * Skip the admin-mode toggle for the INVOICING_ADMIN check and always send
   * `x-sudo: true` for the download request. For contexts that are already
   * behind their own admin gate (e.g. a member's admin profile page, whose
   * invoice list is itself fetched with `alwaysSudo`) and would otherwise
   * hide the download link whenever the viewer happens to have the sudo
   * toggle off.
   */
  alwaysSudo?: boolean
}

/**
 * Shared hook for downloading invoice PDFs from flight log entries.
 * Handles role checks, numeric invoice ID validation, API call, and error handling.
 */
export function useInvoicePdfDownload({
  invoiceNumber,
  billableMemberId,
  alwaysSudo,
}: UseInvoicePdfDownloadOptions) {
  const { me, hasAccess, hasSudoAccess } = useRoles()
  const [loading, setLoading] = useState(false)
  const { mutation } = useApi({ url: 'v1/invoices', skipFetch: true, alwaysSudo })

  /**
   * Returns true when the current user may download the invoice PDF.
   * Requires a positive integer invoice number (the backend PDF endpoint
   * rejects non-numeric IDs with a 400 error).
   */
  const canDownloadInvoice = (): boolean => {
    const id = Number(invoiceNumber)
    if (!invoiceNumber || !Number.isInteger(id) || id <= 0) return false
    const isInvoicingAdmin = alwaysSudo
      ? hasAccess(MIKPermissions.INVOICING_ADMIN)
      : hasSudoAccess(MIKPermissions.INVOICING_ADMIN)
    if (isInvoicingAdmin) return true
    return me?.memberId === billableMemberId
  }

  const handleDownloadPDF = async () => {
    // Guard against direct calls that bypass the disabled-button check
    if (!canDownloadInvoice()) return
    setLoading(true)
    try {
      const response = await mutation.trigger<undefined, string>(
        'GET',
        undefined,
        `${invoiceNumber}/pdf`,
      )

      if (!response.data || response.error) {
        console.error('Failed to fetch invoice PDF:', response.error)
        return
      }

      downloadBase64Pdf({
        base64Data: response.data,
        filename: `invoice-${invoiceNumber}.pdf`,
      })
    } catch (error) {
      console.error('Failed to download invoice PDF:', error)
    } finally {
      setLoading(false)
    }
  }

  return { canDownloadInvoice, handleDownloadPDF, loading }
}
