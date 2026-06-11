/**
 * SimplBooks Smart Mock Server
 *
 * An in-memory Express-style mock that covers every endpoint the MIK-NG backend
 * calls against the SimplBooks API.  Unlike Prism it:
 *   - Persists state across requests (created clients & invoices survive until restart)
 *   - Generates a real, human-readable PDF for every invoice
 *   - Optionally emails that PDF when invoices/sent is called
 *     (respects DISABLE_EMAIL_SENDING from apps/backend/.env)
 *   - Serves the articles list straight from the OpenAPI fixture YAML
 *
 * Usage:
 *   pnpm --filter simplbooks-api mock
 *   # or: node --experimental-transform-types simplbooks/src/mock-server.ts
 *
 * The server listens on http://127.0.0.1:4010 (same default as the Prism proxy)
 * and handles the /{companyId}/api/* path prefix used by the backend client.
 */

import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import YAML from 'yaml'
import dotenv from 'dotenv'

// ─── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

// Load backend .env so we pick up SMTP credentials and DISABLE_EMAIL_SENDING
const backendEnvPath = path.join(REPO_ROOT, 'apps/backend/.env')
if (existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: false })
}

const PORT = Number(process.env.SIMPLBOOKS_MOCK_PORT ?? 4010)

// pdfkit and nodemailer are CJS; use createRequire for compatibility
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as typeof import('nodemailer')

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: number
  code: string
  ean: string
  amount: number
  price_per_unit: number
  sum_with_vat: boolean
  sales_vat_type_id: number
  purchase_vat_type_id: number
  markup_value: number
  markup_type: string
  is_inventory: boolean
  active: boolean
  name: string
  contents: string
  unit: string
}

interface Client {
  id: number
  name: string
  e_mail: string
  [key: string]: unknown
}

interface InvoiceTask {
  article_id?: number
  name?: string
  contents?: string
  amount: number
  price_per_unit: number
  unit?: string
}

interface Invoice {
  id: number
  client_id: number
  client_name: string
  client_e_mail: string
  additional_info?: string
  created: string
  due: string
  total_sum: number
  currency_name: string
  tasks: InvoiceTask[]
  sent: boolean
}

// ─── In-memory state ──────────────────────────────────────────────────────────

// Randomize base IDs each startup to avoid PK collisions across server restarts
let nextClientId = Math.floor(Math.random() * 900_000) + 100_000
let nextInvoiceId = Math.floor(Math.random() * 900_000) + 100_000

const clients = new Map<number, Client>()
const invoices = new Map<number, Invoice>()

// ─── Load articles from OpenAPI fixture ───────────────────────────────────────

function loadArticles(): Article[] {
  const yamlPath = path.join(REPO_ROOT, 'simplbooks/simplbooks-api/paths/articles_list.yaml')
  const raw = readFileSync(yamlPath, 'utf-8')
  const parsed = YAML.parse(raw) as Record<string, unknown>

  const exampleData = (parsed?.get as Record<string, unknown>)?.responses as Record<string, unknown>

  const listData = (
    (exampleData?.[200] as Record<string, unknown>)?.content as Record<string, unknown>
  )?.['application/json'] as Record<string, unknown>
  const example = (
    (listData?.examples as Record<string, unknown>)?.default as Record<string, unknown>
  )?.value as Record<string, unknown>
  const data = (example?.data as Array<{ Article: Article }>) ?? []

  return data.map((d) => d.Article)
}

const allArticles = loadArticles()

console.log(`[SimplBooks Mock] Loaded ${allArticles.length} articles from fixture`)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function dueDate(days = 14): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function ok(res: http.ServerResponse, body: unknown, status = 200) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function notFound(res: http.ServerResponse, detail: string) {
  ok(res, { status: 404, errors: [detail] }, 404)
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

/**
 * Strip the /{companyId}/api prefix from the request path.
 * e.g. /abc123/api/clients/create  →  /clients/create
 */
function apiPath(url: string): string {
  const withoutQuery = url.split('?')[0]
  const match = withoutQuery.match(/^\/[^/]+\/[^/]+(.*)$/)
  return match?.[1] || '/'
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function generatePdf(invoice: Invoice): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ── Header ──
    doc
      .fillColor('#003366')
      .fontSize(22)
      .text('MALMIN ILMAILUKERHO RY', { align: 'center' })
      .fillColor('#000000')
      .fontSize(10)
      .text('Malmin lentoasema, Helsinki · mik.fi', { align: 'center' })
      .moveDown(1.5)

    doc.fontSize(18).fillColor('#003366').text('LASKU / INVOICE', { align: 'center' })
    doc.fillColor('#000000').moveDown(1)

    // ── Invoice metadata ──
    const leftCol = 50
    const rightCol = 350

    doc.fontSize(10)
    const metaY = doc.y
    doc
      .text('Invoice number:', leftCol, metaY, { width: 120, continued: true })
      .text(`#${invoice.id}`, { width: 200 })
      .text('Date:', leftCol, doc.y, { width: 120, continued: true })
      .text(invoice.created, { width: 200 })
      .text('Due date:', leftCol, doc.y, { width: 120, continued: true })
      .text(invoice.due, { width: 200 })

    // Bill to (right side)
    doc
      .text('Bill to:', rightCol, metaY, { width: 120, continued: true })
      .text(invoice.client_name, { width: 180 })
      .text('Email:', rightCol, doc.y, { width: 120, continued: true })
      .text(invoice.client_e_mail, { width: 180 })

    doc.moveDown(2)

    // ── Line-items table ──
    const colDesc = 50
    const colQty = 310
    const colPrice = 380
    const colTotal = 460
    const tableRight = 545

    // Table header
    const headerY = doc.y
    doc
      .fillColor('#003366')
      .fontSize(10)
      .text('Description', colDesc, headerY, { width: colQty - colDesc - 5 })
      .text('Qty', colQty, headerY, {
        width: colPrice - colQty - 5,
        align: 'right',
      })
      .text('Unit price', colPrice, headerY, {
        width: colTotal - colPrice - 5,
        align: 'right',
      })
      .text('Total', colTotal, headerY, {
        width: tableRight - colTotal,
        align: 'right',
      })
      .fillColor('#000000')

    doc.moveDown(0.3)
    doc.moveTo(colDesc, doc.y).lineTo(tableRight, doc.y).strokeColor('#003366').stroke()
    doc.moveDown(0.5)

    // Rows
    let totalSum = 0
    for (const task of invoice.tasks) {
      const lineTotal = (task.amount ?? 0) * (task.price_per_unit ?? 0)
      totalSum += lineTotal
      const name = task.name || 'Service'
      const contents = task.contents || ''
      const rowY = doc.y

      // Name on first line (bold), contents on second line — matches real SimplBooks layout
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(name, colDesc, rowY, { width: colQty - colDesc - 5 })
      doc
        .font('Helvetica')
        .text(String(task.amount ?? 1), colQty, rowY, {
          width: colPrice - colQty - 5,
          align: 'right',
        })
        .text(`€${(task.price_per_unit ?? 0).toFixed(2)}`, colPrice, rowY, {
          width: colTotal - colPrice - 5,
          align: 'right',
        })
        .text(`€${lineTotal.toFixed(2)}`, colTotal, rowY, {
          width: tableRight - colTotal,
          align: 'right',
        })

      if (contents) {
        doc
          .fontSize(8)
          .fillColor('#555555')
          .text(contents, colDesc, doc.y, { width: colQty - colDesc - 5 })
          .fillColor('#000000')
      }

      doc.fontSize(9).moveDown(0.5)
    }

    // Totals rule
    doc.moveTo(colDesc, doc.y).lineTo(tableRight, doc.y).strokeColor('#003366').stroke()
    doc.moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`Total: €${totalSum.toFixed(2)}`, colDesc, doc.y, {
        width: tableRight - colDesc,
        align: 'right',
      })
      .font('Helvetica')

    if (invoice.additional_info) {
      doc.moveDown(1)
      doc.fontSize(9).fillColor('#555555').text(`Note: ${invoice.additional_info}`)
    }

    // ── Footer ──
    doc
      .moveDown(3)
      .fontSize(8)
      .fillColor('#888888')
      .text('[DEV] Generated by SimplBooks Smart Mock — not a real SimplBooks invoice', {
        align: 'center',
      })

    doc.end()
  })
}

// ─── Email ────────────────────────────────────────────────────────────────────

function getMockEmailSendDecision(recipient: string): {
  shouldSend: boolean
  reason: string
} {
  const disableEmailSending = process.env.DISABLE_EMAIL_SENDING?.trim()
  const normalizedRecipient = recipient.trim().toLowerCase()

  // Safer default for the mock server: do not send unless explicitly enabled.
  if (!disableEmailSending) {
    return {
      shouldSend: false,
      reason: 'DISABLE_EMAIL_SENDING is unset',
    }
  }

  const normalizedSetting = disableEmailSending.toLowerCase()
  if (normalizedSetting === 'true' || normalizedSetting === '1') {
    return {
      shouldSend: false,
      reason: `DISABLE_EMAIL_SENDING=${disableEmailSending}`,
    }
  }

  if (normalizedSetting === 'false' || normalizedSetting === '0') {
    return {
      shouldSend: true,
      reason: `DISABLE_EMAIL_SENDING=${disableEmailSending}`,
    }
  }

  const whitelist = disableEmailSending
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  if (whitelist.includes(normalizedRecipient)) {
    return {
      shouldSend: true,
      reason: `recipient ${recipient} allowed by DISABLE_EMAIL_SENDING whitelist`,
    }
  }

  return {
    shouldSend: false,
    reason: `recipient ${recipient} not present in DISABLE_EMAIL_SENDING whitelist`,
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function maybeSendEmail(invoice: Invoice, pdfBase64: string): Promise<void> {
  const emailDecision = getMockEmailSendDecision(invoice.client_e_mail)
  if (!emailDecision.shouldSend) {
    console.log(
      `[SimplBooks Mock] Email sending disabled (${emailDecision.reason}) — invoice ${invoice.id} PDF ready but not sent to ${invoice.client_e_mail}`,
    )
    return
  }

  const smtpLogin = process.env.SMTP_LOGIN
  const smtpPwd = process.env.SMTP_PASSWORD
  if (!smtpLogin || !smtpPwd) {
    console.warn(`[SimplBooks Mock] SMTP not configured — skipping email for invoice ${invoice.id}`)
    return
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: smtpLogin, pass: smtpPwd },
  })

  const escapedDueDate = escapeHtml(invoice.due)
  const escapedAdditionalInfo = invoice.additional_info
    ? escapeHtml(invoice.additional_info).replaceAll('\n', '<br />')
    : ''

  await transporter.sendMail({
    from: smtpLogin,
    to: invoice.client_e_mail,
    subject: `[DEV Mock] MIK Invoice #${invoice.id} — €${invoice.total_sum.toFixed(2)} due ${invoice.due}`,
    html: `
      <h2>MIK Invoice #${invoice.id} (dev mock)</h2>
      <p><strong>Total:</strong> €${invoice.total_sum.toFixed(2)}</p>
      <p><strong>Due date:</strong> ${escapedDueDate}</p>
      ${escapedAdditionalInfo ? `<p><strong>Note:</strong> ${escapedAdditionalInfo}</p>` : ''}
      <p style="color:#888;font-size:12px;">
        Generated by SimplBooks Smart Mock — not a real invoice.
      </p>`,
    attachments: [
      {
        filename: `mik_lasku_${invoice.id}.pdf`,
        content: pdfBase64,
        encoding: 'base64',
      },
    ],
  })

  console.log(`[SimplBooks Mock] Emailed invoice ${invoice.id} PDF to ${invoice.client_e_mail}`)
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const path_ = apiPath(req.url ?? '/')
  const method = req.method?.toUpperCase() ?? 'GET'
  const body = await readBody(req)

  console.log(`[SimplBooks Mock] ${method} ${path_}`)

  // ── Articles ──────────────────────────────────────────────────────────────

  if (path_ === '/articles/list' && method === 'GET') {
    const code = body.code as string | undefined
    const page = Number(body.page ?? 1)
    const perPage = Number(body.per_page ?? 50)
    const filtered = code
      ? allArticles.filter((a) => a.code.toLowerCase().includes(code.toLowerCase()))
      : allArticles
    const paged = filtered.slice((page - 1) * perPage, page * perPage)
    return ok(res, {
      status: 200,
      duration: 0.001,
      data: paged.map((a) => ({ Article: a })),
    })
  }

  // ── Clients ───────────────────────────────────────────────────────────────

  if (path_ === '/clients/list' && method === 'GET') {
    const email = (body.e_mail as string | undefined)?.toLowerCase()
    const name = (body.name as string | undefined)?.toLowerCase()
    let list = [...clients.values()]
    if (email) list = list.filter((c) => c.e_mail?.toLowerCase().includes(email))
    if (name) list = list.filter((c) => c.name?.toLowerCase().includes(name))
    return ok(res, {
      status: 200,
      duration: 0.001,
      data: list.map((c) => ({ Client: c })),
    })
  }

  if (path_ === '/clients/create' && method === 'POST') {
    const data = (body.Client ?? {}) as Record<string, unknown>
    const id = ++nextClientId
    const client: Client = {
      id,
      name: String(data.name ?? ''),
      e_mail: String(data.e_mail ?? ''),
      ...data,
    }
    clients.set(id, client)
    console.log(`[SimplBooks Mock] Created client ${id}: ${client.name} <${client.e_mail}>`)
    return ok(res, {
      status: 200,
      duration: 0.001,
      inserted_id: id,
      response: 'New entry saved.',
    })
  }

  if (path_ === '/clients/update' && method === 'POST') {
    const data = (body.Client ?? {}) as Record<string, unknown>
    const id = Number(data.id)
    const existing = clients.get(id) ?? { id, name: '', e_mail: '' }
    clients.set(id, { ...existing, ...data })
    console.log(`[SimplBooks Mock] Updated client ${id}`)
    return ok(res, { status: 200, duration: 0.001, response: 'OK' })
  }

  const clientGetMatch = path_.match(/^\/clients\/get\/(\d+)$/)
  if (clientGetMatch && method === 'GET') {
    const id = Number(clientGetMatch[1])
    const client = clients.get(id)
    if (!client) return notFound(res, `Client ${id} not found`)
    return ok(res, { status: 200, duration: 0.001, data: { Client: client } })
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  if (path_ === '/invoices/create' && method === 'POST') {
    const inv = (body.Invoice ?? {}) as Record<string, unknown>
    const tasks = ((body.Tasks ?? []) as Array<{ Task: InvoiceTask }>).map((t) => {
      const task = t.Task
      // Resolve name from articles fixture if not explicitly provided by the caller
      if (!task.name && task.article_id) {
        const article = allArticles.find((a) => a.id === task.article_id)
        if (article) task.name = article.name
      }
      return task
    })
    const clientId = Number(inv.client_id)
    const client = clients.get(clientId)
    const totalSum = tasks.reduce((sum, t) => sum + (t.amount ?? 0) * (t.price_per_unit ?? 0), 0)
    const id = ++nextInvoiceId
    const invoice: Invoice = {
      id,
      client_id: clientId,
      client_name: client?.name ?? `Client ${clientId}`,
      client_e_mail: client?.e_mail ?? '',
      additional_info: inv.additional_info as string | undefined,
      created: today(),
      due: dueDate(14),
      total_sum: totalSum,
      currency_name: 'EUR',
      tasks,
      sent: false,
    }
    invoices.set(id, invoice)
    console.log(
      `[SimplBooks Mock] Created invoice ${id} for client ${clientId} (${invoice.client_name}) total €${totalSum.toFixed(2)}`,
    )
    return ok(res, {
      status: 200,
      duration: 0.001,
      inserted_id: id,
      response: 'New entry saved.',
    })
  }

  const invoiceGetMatch = path_.match(/^\/invoices\/get\/(\d+)$/)
  if (invoiceGetMatch && method === 'GET') {
    const id = Number(invoiceGetMatch[1])
    const inv = invoices.get(id)
    if (!inv) return notFound(res, `Invoice ${id} not found`)
    return ok(res, {
      status: 200,
      duration: 0.001,
      data: {
        Invoice: {
          id: inv.id,
          client_id: inv.client_id,
          client_name: inv.client_name,
          created: inv.created,
          due: inv.due,
          total_sum: inv.total_sum,
          currency_name: inv.currency_name,
          additional_info: inv.additional_info,
        },
        Task: inv.tasks.map((t, i) => ({ id: i + 1, ...t })),
      },
    })
  }

  const invoicePdfMatch = path_.match(/^\/invoices\/get_pdf\/(\d+)$/)
  if (invoicePdfMatch && method === 'GET') {
    const id = Number(invoicePdfMatch[1])
    const inv = invoices.get(id)
    if (!inv) return notFound(res, `Invoice ${id} not found`)
    const pdfBuffer = await generatePdf(inv)
    const pdfBase64 = pdfBuffer.toString('base64')
    console.log(`[SimplBooks Mock] Generated PDF for invoice ${id} (${pdfBuffer.length} bytes)`)
    return ok(res, { status: 200, duration: 0.001, data: pdfBase64 })
  }

  const invoiceSentMatch = path_.match(/^\/invoices\/sent\/(\d+)$/)
  if (invoiceSentMatch && method === 'POST') {
    const id = Number(invoiceSentMatch[1])
    const inv = invoices.get(id)
    if (!inv) return notFound(res, `Invoice ${id} not found`)
    inv.sent = true
    // Generate and email the PDF
    const pdfBuffer = await generatePdf(inv)
    const pdfBase64 = pdfBuffer.toString('base64')
    await maybeSendEmail(inv, pdfBase64).catch((err: Error) =>
      console.error(`[SimplBooks Mock] Email error for invoice ${id}: ${err.message}`),
    )
    return ok(res, { status: 200, duration: 0.001, response: 'OK' })
  }

  if (path_ === '/invoices/list' && method === 'GET') {
    return ok(res, {
      status: 200,
      duration: 0.001,
      data: [...invoices.values()].map((inv) => ({
        invoices: {
          id: inv.id,
          client_id: inv.client_id,
          client_name: inv.client_name,
          created: inv.created,
          due: inv.due,
          total_sum: inv.total_sum,
          paid: '0000-00-00',
          currency_name: inv.currency_name,
        },
      })),
    })
  }

  // ── Incomings (receipts) ───────────────────────────────────────────────────

  if (path_ === '/incomings/create' && method === 'POST') {
    const id = ++nextInvoiceId
    console.log(`[SimplBooks Mock] Created incoming (receipt) ${id}`)
    return ok(res, {
      status: 200,
      duration: 0.001,
      inserted_id: id,
      response: 'New entry saved.',
    })
  }

  // ── Fallback ───────────────────────────────────────────────────────────────

  console.warn(`[SimplBooks Mock] Unhandled: ${method} ${path_} (raw: ${req.url})`)
  return notFound(res, `${method} ${path_} is not handled by the smart mock`)
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res)
  } catch (err) {
    console.error('[SimplBooks Mock] Unhandled error:', err)
    if (!res.headersSent) {
      ok(res, { status: 500, errors: ['Internal mock server error'] }, 500)
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[SimplBooks Mock] Listening on http://127.0.0.1:${PORT}`)
  console.log(
    `[SimplBooks Mock] DISABLE_EMAIL_SENDING=${process.env.DISABLE_EMAIL_SENDING ?? '(not set)'}`,
  )
  console.log(
    `[SimplBooks Mock] Set SIMPLBOOKS_BASE_URI=http://127.0.0.1:${PORT} in apps/backend/.env`,
  )
})
