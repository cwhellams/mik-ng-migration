import { HttpStatusCode } from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
// import compression from "compression";
import morgan from 'morgan'
import logger from './lib/logger.ts'
import { corsOrigins } from './util/corsOrigins.ts'
import { router as aircraftRoutes } from './routes/aircrafts/api.ts'
import { router as aircraftDocumentRoutes } from './routes/aircraft-documents/api.ts'
import { router as aircraftPricingRoutes } from './routes/aircraft-pricing/api.ts'
import { router as aircraftCardRoutes } from './routes/aircraft-cards/api.ts'
import { router as aircraftNavdataRoutes } from './routes/aircraft-navdata/api.ts'
import ajlbRoutes from './routes/ajlb/api.ts'
import { router as authRoutes } from './routes/auth/login.ts'
import { router as contactRoutes } from './routes/auth/contact.ts'
import { passkeyRouter } from './routes/auth/passkey.ts'
import { router as documentRoutes } from './routes/documents/api.ts'
import flightLogRoutes from './routes/flight-log/api.ts'
import { router as memberRoutes } from './routes/members/api.ts'
import { router as secretRoutes } from './routes/secrets/api.ts'
import { problemErrorHandler, notFoundProblemHandler } from './routes/response.ts'
import invoiceRoutes from './routes/invoicing/api.ts'
import bookingRoutes from './routes/bookings/api.ts'
import { router as tinyUrlRoute } from './routes/tiny-url-redirect.ts'
import { router as occurrenceRoutes } from './routes/occurrences/api.ts'
import { router as weatherRoutes } from './routes/weather/api.ts'
import { router as mileageGeoRoutes } from './routes/mileage-geo/api.ts'
import { router as statsRoutes } from './routes/stats/api.ts'
import { router as dashboardRoutes } from './routes/dashboard/api.ts'
import taxReportRoutes from './routes/tax-reports/api.ts'
import traficomReportRoutes from './routes/traficom-reports/api.ts'
import upliftReportRoutes from './routes/uplift-reports/api.ts'
import instructorWorktimeRoutes from './routes/instructor-worktime/api.ts'
import { router as outboxRoutes } from './routes/outbox/api.ts'
import { router as versionRoute } from './routes/version/api.ts'
import { router as timeRoute } from './routes/time/api.ts'
import { router as shopRoutes } from './routes/shop/api.ts'
import { router as prepaidHoursRoutes } from './routes/prepaid-hours/api.ts'
import { router as examRoutes } from './routes/exams/api.ts'
import { router as instructorQualificationRoutes } from './routes/instructor-qualifications/api.ts'
import { router as fuelPricesRoutes } from './routes/fuel-prices/api.ts'
import { router as notificationBannerRoutes } from './routes/notification-banner/api.ts'
import { router as configRoutes } from './routes/config/api.ts'
import { router as pushRoutes } from './routes/push/api.ts'
import { router as mailboxRoutes } from './routes/mailbox/api.ts'
import { router as dtoRoutes } from './routes/dto/api.ts'
import { router as eventRoutes } from './routes/events/api.ts'
import { router as expenseRoutes } from './routes/expenses/api.ts'
import { router as costCentreRoutes } from './routes/cost-centres/api.ts'
import { router as usefulPhoneNumberRoutes } from './routes/useful-phone-numbers/api.ts'
import { mileageAllowanceRouter } from './routes/expenses/mileageApi.ts'
import { router as inventoryRoutes } from './routes/inventory/api.ts'
import inventoryReservationRoutes from './routes/inventory-reservations/api.ts'
import { router as ameRoutes } from './routes/ame/api.ts'
import maintenanceNoteRoutes from './routes/maintenance-notes/api.ts'
import aircraftHilRoutes from './routes/aircraft-hil/api.ts'
import defectRoutes from './routes/defects/api.ts'
import remarkRoutes from './routes/remarks/api.ts'
import liquidRoutes from './routes/liquid/api.ts'
import meetingRoutes from './routes/meetings/api.ts'
import { router as pricesRoutes } from './routes/prices/api.ts'
import { startAllWorkers, stopAllWorkers } from './workers/registry.ts'
import { rateLimiterMiddleware } from './middleware/rateLimiter.ts'
import { assertAuthCookieConfig } from './routes/auth/cookies.ts'
import { testConnection, closeDb } from './db/connection.ts'
import { closeEventStore } from './lib/eventStore.ts'

// Before anything else: a shared COOKIE_DOMAIN with no COOKIE_PREFIX makes this
// deployment overwrite the auth cookies of every other deployment under that
// domain. Refuse to start rather than sign members out of the other environment.
assertAuthCookieConfig()

const app = express()
const PORT = process.env.BACKEND_PORT ?? 3000

logger.info('Bootstrapping mik-ng service on port %d', PORT)

// Morgan logs HTTP requests
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
)

// Security Middlewares
// helmet() v8.3.0 defaults (see https://github.com/helmetjs/helmet#reference):
// - contentSecurityPolicy: disabled here to avoid duplication with Cloudflare edge rule
// - crossOriginOpenerPolicy: { policy: "same-origin" } (COOP)
// - crossOriginResourcePolicy: { policy: "same-origin" } (CORP)
// - xDnsPrefetchControl: { allow: false }
// - xPermittedCrossDomainPolicies: { permittedPolicies: "none" }
// - originAgentCluster
// - xXssProtection: 0 (disables legacy XSS auditor per OWASP/MDN guidance)
//
// Cloudflare edge rule provides CSP for both API and frontend; HSTS is also via edge rule.
app.use(
  helmet({
    // Disable CSP to avoid duplication with Cloudflare edge rule (see issue #1149)
    contentSecurityPolicy: false,
    // Cloudflare edge rule owns HSTS; avoid duplicate Strict-Transport-Security headers.
    strictTransportSecurity: false,
  }),
)

// Permissions-Policy header (manually added as helmet v8 doesn't include it)
// Locks down unused browser features per issue #1149
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  )
  next()
})

// Fallback CSP for requests that reach this app without going through the
// Cloudflare edge rule (e.g. CORS_ALLOWED_ORIGINS includes the raw DO
// app-platform origin, which reaches this service directly). Cloudflare adds
// a `CF-Ray` header to every request it proxies, so its absence means this
// response would otherwise leave with no CSP at all. Gating on it also means
// Cloudflare-proxied responses never end up with two CSP headers.
const fallbackContentSecurityPolicy = helmet.contentSecurityPolicy()
app.use((req, res, next) => {
  if (req.headers['cf-ray']) {
    next()
    return
  }
  fallbackContentSecurityPolicy(req, res, next)
})

app.use(
  cors({
    // Use false (block all cross-origin) if no valid origins are configured in production
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  }),
)

// app.use(compression());

// Body parsing
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(cookieParser())

app.use(rateLimiterMiddleware)

// Basic application status information
let appStatus = {
  status: 'ok',
  uptime: 0,
  startTime: Date.now(),
}

app.get('/health', (_req, res) => {
  // Calculate current uptime
  appStatus.uptime = Math.floor((Date.now() - appStatus.startTime) / 1000)
  res.status(HttpStatusCode.Ok).send(appStatus)
})

// Routes

// Tiny URL redirect route (before API routes for shorter URLs)
app.use('/t', tinyUrlRoute)

app.use('/api/auth', authRoutes)
app.use('/api/auth', contactRoutes)
app.use('/api/auth/passkey', passkeyRouter)
app.use('/api/v1/members', memberRoutes)
app.use('/api/v1/secrets', secretRoutes)
app.use('/api/v1/flight-logs', flightLogRoutes)
app.use('/api/v1/aircrafts', aircraftRoutes)
app.use('/api/v1/aircraft-documents', aircraftDocumentRoutes)
app.use('/api/v1/aircraft-pricing', aircraftPricingRoutes)
app.use('/api/v1/aircraft-cards', aircraftCardRoutes)
app.use('/api/v1/aircraft-navdata', aircraftNavdataRoutes)
app.use('/api/v1/ajlb', ajlbRoutes)
app.use('/api/v1/documents', documentRoutes)
app.use('/api/v1/invoices', invoiceRoutes)
app.use('/api/v1/bookings', bookingRoutes)
app.use('/api/v1/occurrences', occurrenceRoutes)
app.use('/api/v1/weather', weatherRoutes)
app.use('/api/v1/mileage', mileageGeoRoutes)
app.use('/api/v1/stats', statsRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/tax-reports', taxReportRoutes)
app.use('/api/v1/traficom-reports', traficomReportRoutes)
app.use('/api/v1/uplift-reports', upliftReportRoutes)
app.use('/api/v1/instructor-worktime', instructorWorktimeRoutes)
app.use('/api/v1/outbox', outboxRoutes)
app.use('/api/v1/version', versionRoute)
app.use('/api/v1/time', timeRoute)
app.use('/api/v1/shop', shopRoutes)
app.use('/api/v1/prepaid-hours', prepaidHoursRoutes)
app.use('/api/v1/fuel-prices', fuelPricesRoutes)
app.use('/api/v1/exams', examRoutes)
app.use('/api/v1/notification-banner', notificationBannerRoutes)
app.use('/api/v1/instructor-qualifications', instructorQualificationRoutes)
app.use('/api/v1/config', configRoutes)
app.use('/api/v1/push', pushRoutes)
app.use('/api/v1/mailbox', mailboxRoutes)
app.use('/api/v1/dto', dtoRoutes)
app.use('/api/v1/events', eventRoutes)
app.use('/api/v1/prices', pricesRoutes)
app.use('/api/v1/expenses', expenseRoutes)
app.use('/api/v1/cost-centres', costCentreRoutes)
app.use('/api/v1/useful-phone-numbers', usefulPhoneNumberRoutes)
app.use('/api/v1/mileage-allowances', mileageAllowanceRouter)
app.use('/api/v1/inventory', inventoryRoutes)
app.use('/api/v1/inventory-reservations', inventoryReservationRoutes)
app.use('/api/v1/ame', ameRoutes)
app.use('/api/v1/maintenance-notes', maintenanceNoteRoutes)
app.use('/api/v1/aircraft-hil', aircraftHilRoutes)
app.use('/api/v1/defects', defectRoutes)
app.use('/api/v1/remarks', remarkRoutes)
app.use('/api/v1/meetings', meetingRoutes)
app.use('/api/v1/liquid', liquidRoutes)

// Test database connection before starting workers
await testConnection()

const runningWorkers = startAllWorkers()

//Ensure this is the last middleware!
app.use(notFoundProblemHandler)
app.use(problemErrorHandler)

//Digital ocean requires that app services bind to 0.0.0.0
//docs.digitalocean.com/products/app-platform/how-to/manage-services/
const server = app.listen(PORT, () => {
  logger.info(`Server running on http://0.0.0.0:${PORT}`)
})

// Gracefully handle app termination (Ctrl+C, kill, crashes)
const shutdown = async (): Promise<void> => {
  console.warn('\nShutting down server...')
  await closeDb() // Close DB connections
  await closeEventStore() // Close Emmett event store connections
  stopAllWorkers(runningWorkers)
  server.close(() => {
    console.warn('HTTP server closed.')
    process.exit(0)
  })
}

// Listen for termination signals
process.on('SIGINT', shutdown) // Ctrl+C
process.on('SIGTERM', shutdown) // Kill command (e.g., Docker stop)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  shutdown().catch((err) => {
    console.error('Error during shutdown:', err)
    process.exit(1)
  })
})
