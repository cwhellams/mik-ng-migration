import { PDFDocument } from 'pdf-lib'

export interface AttachmentFileForMerge {
  buffer: Buffer
  mimeType: string
}

/**
 * Merges multiple receipt attachments (images and/or PDFs) into a single PDF —
 * SimplBooks only accepts one attachment per purchase (issue #955). Each PDF's pages
 * are copied in as-is; each image becomes one full-page page in the output.
 */
export async function mergeAttachmentsToPdf(files: AttachmentFileForMerge[]): Promise<Buffer> {
  const merged = await PDFDocument.create()

  for (const file of files) {
    if (file.mimeType === 'application/pdf') {
      const source = await PDFDocument.load(file.buffer)
      const pages = await merged.copyPages(source, source.getPageIndices())
      pages.forEach((page) => merged.addPage(page))
      continue
    }

    const image =
      file.mimeType === 'image/png'
        ? await merged.embedPng(file.buffer)
        : await merged.embedJpg(file.buffer)
    const page = merged.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }

  return Buffer.from(await merged.save())
}
