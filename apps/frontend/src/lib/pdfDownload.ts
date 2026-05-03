/**
 * Shared utility for downloading PDF files from base64-encoded responses
 */

export interface DownloadBase64PdfOptions {
  base64Data: string
  filename: string
  onError?: (error: unknown) => void
}

/**
 * Convert base64 string to PDF blob and trigger download
 */
export const downloadBase64Pdf = ({
  base64Data,
  filename,
  onError,
}: DownloadBase64PdfOptions): void => {
  try {
    const byteCharacters = atob(base64Data)
    const byteNumbers = Array.from(byteCharacters).map((char) =>
      char.charCodeAt(0)
    )
    const byteArray = new Uint8Array(byteNumbers)

    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to download PDF:', error)
    onError?.(error)
  }
}
