import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { mergeAttachmentsToPdf } from '../../src/util/mergeAttachmentsToPdf.ts'

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .jpeg()
    .toBuffer()
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .png()
    .toBuffer()
}

describe('mergeAttachmentsToPdf', () => {
  it('copies all pages from a single PDF attachment', async () => {
    const pdf = await makePdf(3)
    const merged = await mergeAttachmentsToPdf([{ buffer: pdf, mimeType: 'application/pdf' }])
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(3)
  })

  it('adds one page per image attachment', async () => {
    const jpeg = await makeJpeg()
    const png = await makePng()
    const merged = await mergeAttachmentsToPdf([
      { buffer: jpeg, mimeType: 'image/jpeg' },
      { buffer: png, mimeType: 'image/png' },
    ])
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(2)
  })

  it('merges a mix of PDFs and images in order', async () => {
    const pdf = await makePdf(2)
    const jpeg = await makeJpeg()
    const merged = await mergeAttachmentsToPdf([
      { buffer: pdf, mimeType: 'application/pdf' },
      { buffer: jpeg, mimeType: 'image/jpeg' },
    ])
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(3)
  })

  it('returns a valid, loadable PDF when given no attachments', async () => {
    // Not a case the route actually hits (it requires at least one attachment before
    // merging) — this just confirms the library doesn't throw on an empty input.
    const merged = await mergeAttachmentsToPdf([])
    await expect(PDFDocument.load(merged)).resolves.toBeDefined()
  })
})
