import { useState } from 'react'
import useApi from './useApi'
import { useRoles } from './useRoles'
import { downloadBase64Pdf } from '../lib/pdfDownload'

interface UseInvoicePdfDownloadOptions {
  invoiceNumber: string | null | undefined
  billableMemberId: string | null | undefined
}

/**
 * Shared hook for downloading invoice PDFs from flight log entries.
 * Handles role checks, numeric invoice ID validation, API call, and error handling.
 */
export function useInvoicePdfDownload({
  invoiceNumber,
  billableMemberId,
}: UseInvoicePdfDownloadOptions) {
  const { me, isInvoicingAdmin } = useRoles()
  const [loading, setLoading] = useState(false)
  const { mutation } = useApi({ url: 'v1/invoices', skipFetch: true })

  /**
   * Returns true when the current user may download the invoice PDF.
   * Requires a positive integer invoice number (the backend PDF endpoint
   * rejects non-numeric IDs with a 400 error).
   */
  const canDownloadInvoice = (): boolean => {
    const id = Number(invoiceNumber)
    if (!invoiceNumber || !Number.isInteger(id) || id <= 0) return false
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
