import { jest } from '@jest/globals'

const mockPdf = jest.fn<() => Promise<Uint8Array>>()
const mockSetContent = jest.fn<() => Promise<void>>()
const mockNewPage = jest.fn<() => Promise<any>>()
const mockClose = jest.fn<() => Promise<void>>()
const mockLaunch = jest.fn<() => Promise<any>>()

jest.unstable_mockModule('puppeteer-core', () => ({
  default: { launch: mockLaunch },
}))

const { renderHtmlToPdf } = await import('../../src/services/htmlToPdf.ts')

describe('renderHtmlToPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPdf.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mockNewPage.mockResolvedValue({ setContent: mockSetContent, pdf: mockPdf })
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockClose })
  })

  it('renders HTML content to a PDF buffer', async () => {
    const result = await renderHtmlToPdf('<html><body>Hello</body></html>')

    expect(result).toBeInstanceOf(Buffer)
    expect(result.equals(Buffer.from([1, 2, 3]))).toBe(true)
    expect(mockSetContent).toHaveBeenCalledWith(
      '<html><body>Hello</body></html>',
      expect.objectContaining({ waitUntil: 'load' }),
    )
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('closes the browser even when rendering fails', async () => {
    mockPdf.mockRejectedValue(new Error('render failed'))

    await expect(renderHtmlToPdf('<html></html>')).rejects.toThrow('render failed')
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
