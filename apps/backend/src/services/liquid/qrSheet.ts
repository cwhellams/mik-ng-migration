import PDFDocument from 'pdfkit'

import { generateQRCodeWithLogo } from '../tinyUrl.ts'
import { qrScanPath, type QrCode } from '@mik/contracts/liquid'

/**
 * Printable A4 sheets of liquid-reporting QR codes.
 *
 * The images come from `generateQRCodeWithLogo`, which already composites the
 * MIK logo into an error-correction-level-H code — that is what makes a logo in
 * the middle survivable. All this adds is the sheet: a grid, the
 * "MIK Liquid reporting" caption the issue asks for, and the human-readable code
 * underneath so somebody holding a printed sticker can read it out.
 *
 * Each code encodes only `/liquid/scan/<code>` — never the resolved target — so a
 * sheet can be printed today and the stickers assigned to canisters and pumps
 * over the following weeks.
 */

// A4 at 72dpi, matching the flight-log exporter's conventions.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 36

const COLS = 3
const ROWS = 4
const PER_PAGE = COLS * ROWS

const CAPTION = 'MIK Liquid reporting'

/** Rendered at 2× the printed box so the code stays sharp on paper. */
const QR_PIXELS = 460

export interface QrSheetOptions {
  /** Base URL the codes resolve against, e.g. https://mik.fi. */
  publicUrl: string
  /** Shown in the page header, so a stack of sheets can be told apart. */
  batchLabel: string
  /**
   * How each code's image is produced. Defaults to the real logo-composited
   * generator; injectable so the sheet *layout* can be tested without it.
   *
   * That is not a hypothetical convenience: `generateQRCodeWithLogo` goes
   * through `sharp`, a native module, and under Jest's `--experimental-vm-modules`
   * one call takes ~1.8s against ~40ms standalone. A layout test that renders
   * fourteen codes for real costs 25 seconds to assert one page count.
   */
  renderCode?: (url: string, size: number) => Promise<Buffer>
}

export async function buildQrSheetPdf(codes: QrCode[], options: QrSheetOptions): Promise<Buffer> {
  const renderCode = options.renderCode ?? generateQRCodeWithLogo
  // Rendered up front rather than inside the layout loop: pdfkit's document
  // stream is synchronous once writing starts, and awaiting mid-layout would
  // interleave pages with images that had not arrived yet.
  const images = await Promise.all(
    codes.map((code) => renderCode(`${options.publicUrl}${qrScanPath(code.code)}`, QR_PIXELS)),
  )

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const contentW = PAGE_W - 2 * MARGIN
    const headerH = 28
    const cellW = contentW / COLS
    const cellH = (PAGE_H - 2 * MARGIN - headerH) / ROWS
    // The caption and the code sit under the image, inside the same cell.
    const textH = 26
    const qrBox = Math.min(cellW, cellH - textH) - 10

    for (let index = 0; index < Math.max(codes.length, 1); index++) {
      const positionOnPage = index % PER_PAGE
      if (index > 0 && positionOnPage === 0) doc.addPage()

      if (positionOnPage === 0) {
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(`${CAPTION} — ${options.batchLabel}`, MARGIN, MARGIN, {
            width: contentW,
            align: 'left',
          })
        doc
          .fontSize(8)
          .font('Helvetica')
          .text(
            `Sheet ${Math.floor(index / PER_PAGE) + 1} · scan with the phone camera · ${options.publicUrl}`,
            MARGIN,
            MARGIN + 13,
            { width: contentW, align: 'left' },
          )
      }

      const code = codes[index]
      if (!code) break

      const col = positionOnPage % COLS
      const row = Math.floor(positionOnPage / COLS)
      const cellX = MARGIN + col * cellW
      const cellY = MARGIN + headerH + row * cellH

      doc.image(images[index]!, cellX + (cellW - qrBox) / 2, cellY, {
        width: qrBox,
        height: qrBox,
      })

      const textY = cellY + qrBox + 2
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#444444')
        .text(CAPTION, cellX, textY, { width: cellW, align: 'center' })
      doc
        .fontSize(9)
        .font('Courier-Bold')
        .fillColor('#000000')
        .text(code.code, cellX, textY + 9, { width: cellW, align: 'center' })

      // Cut guide, so a sheet can be scissored into stickers.
      doc
        .save()
        .lineWidth(0.25)
        .strokeColor('#CCCCCC')
        .dash(2, { space: 2 })
        .rect(cellX + 2, cellY - 2, cellW - 4, cellH - 4)
        .stroke()
        .undash()
        .restore()
    }

    doc.end()
  })
}
