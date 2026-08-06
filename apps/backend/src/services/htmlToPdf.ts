import puppeteer from 'puppeteer-core'

const DEFAULT_EXECUTABLE_PATH = '/usr/bin/chromium-browser'

/**
 * Render an HTML document (e.g. a Brevo campaign body) to a PDF buffer.
 * Uses puppeteer-core against a system-installed Chromium — see the root
 * Dockerfile, which installs Chromium via apk since Puppeteer's bundled
 * Chromium download doesn't run on Alpine's musl libc.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_EXECUTABLE_PATH,
    // Chromium runs as the non-root `node` user in the container, which can't
    // use the setuid sandbox; content here is always trusted (from Brevo).
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'a4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
