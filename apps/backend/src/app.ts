import { HttpStatusCode } from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
// import compression from "compression";
import morgan from 'morgan'
import logger from './lib/logger.ts'
import { router as aircraftRoutes } from './routes/aircrafts/api.ts'
import { router as aircraftDocumentRoutes } from './routes/aircraft-documents/api.ts'
import { router as aircraftPricingRoutes } from './routes/aircraft-pricing/api.ts'
import { router as aircraftCardRoutes } from './routes/aircraft-cards/api.ts'
import { router as aircraftNavdataRoutes } from './routes/aircraft-navdata/api.ts'
import ajlbRoutes from './routes/ajlb/api.ts'
import { router as authRoutes } from './routes/auth/login.ts'
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
import { router as dtoRoutes } from './routes/dto/api.ts'
import { router as eventRoutes } from './routes/events/api.ts'
import { startSimpleBooksOutboxProcessor } from './workers/simplbooksOutboxWorker.ts'
import { startSimplbooksInvoicePaymentWorker } from './workers/simplbooksInvoicePaymentWorker.ts'
import { startOverdueInvoiceWorker } from './workers/overdueInvoiceWorker.ts'
import { rateLimiterMiddleware } from './middleware/rateLimiter.ts'
import { startOccurrenceNotificationWorker } from './workers/occurrenceNotifyWorker.ts'
import { startBrevoSyncWorker } from './workers/brevoSyncWorker.ts'
import { testConnection, closeDb } from './db/connection.ts'
import { closeEventStore } from './lib/eventStore.ts'
import { startSimplbooksSyncWorker } from './workers/simplbooksMemberSyncWorker.ts'
import { startBookingReminderWorker } from './workers/bookingReminderWorker.ts'
import { startJuniorMemberPromotionWorker } from './workers/juniorMemberPromotionWorker.ts'
import { startQualificationExpiryWorker } from './workers/qualificationExpiryWorker.ts'
import { startTinyUrlCleanupWorker } from './workers/tinyUrlCleanupWorker.ts'

const app = express()
const PORT = process.env.BACKEND_PORT ?? 3000

logger.info('Bootstrapping mik-ng service on port %d', PORT)

// Morgan logs HTTP requests
app.use(
  morgan('combined', {
    stream: { write: message => logger.info(message.trim()) },
  }),
)

// Security Middlewares
app.use(helmet()) // Secure headers

// Parse CORS allowed origins from comma-separated environment variable
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0)
  : ['*']

if (corsOrigins.length === 0) {
  corsOrigins.push('*')
}

// Wildcard origin cannot be combined with credentials: true (violates CORS spec)
const isWildcard = corsOrigins.length === 1 && corsOrigins[0] === '*'

app.use(
  cors({
    origin: isWildcard ? '*' : corsOrigins,
    credentials: !isWildcard,
  }),
)

// app.use(compression());

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
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
app.use('/api/v1/dto', dtoRoutes)
app.use('/api/v1/events', eventRoutes)

// Test database connection before starting workers
await testConnection()

const poller = startSimpleBooksOutboxProcessor()
const invoicePaymentWorker = startSimplbooksInvoicePaymentWorker()
const overdueInvoiceWorker = startOverdueInvoiceWorker()
const occurrenceNotificationWorker = startOccurrenceNotificationWorker()
const brevoSyncWorker = startBrevoSyncWorker()
const simplbooksMemberSyncWorker = startSimplbooksSyncWorker()
const bookingReminderWorker = startBookingReminderWorker()
const juniorMemberPromotionWorker = startJuniorMemberPromotionWorker()
const qualificationExpiryWorker = startQualificationExpiryWorker()
const tinyUrlCleanupWorker = startTinyUrlCleanupWorker()

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
  poller?.stop()
  invoicePaymentWorker?.stop()
  overdueInvoiceWorker?.stop()
  occurrenceNotificationWorker?.stop()
  brevoSyncWorker?.stop()
  simplbooksMemberSyncWorker?.stop()
  bookingReminderWorker?.stop()
  juniorMemberPromotionWorker?.stop()
  qualificationExpiryWorker?.stop()
  tinyUrlCleanupWorker?.stop()
  server.close(() => {
    console.warn('HTTP server closed.')
    process.exit(0)
  })
}

// Listen for termination signals
process.on('SIGINT', shutdown) // Ctrl+C
process.on('SIGTERM', shutdown) // Kill command (e.g., Docker stop)
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err)
  shutdown().catch(err => {
    console.error('Error during shutdown:', err)
    process.exit(1)
  })
})
