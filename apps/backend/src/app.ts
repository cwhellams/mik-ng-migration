import { HttpStatusCode } from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
// import compression from "compression";
import morgan from 'morgan'
import pg from 'pg'

import logger from './lib/logger.ts'
import { router as aircraftRoutes } from './routes/aircrafts/api.ts'
import ajlbRoutes from './routes/ajlb/api.ts'
import { router as passportRoutes } from './routes/auth/login.ts'
import flightLogRoutes from './routes/flight-log/api.ts'
import { router as memberRoutes } from './routes/members/api.ts'
import { problemErrorHandler, notFoundProblemHandler } from './routes/response.ts'
import invoiceRoutes from './routes/invoicing/api.ts'
import { startSimpleBooksOutboxProcessor } from './workers/simplbooksOutboxWorker.ts'
import { rateLimiterMiddleware } from './middleware/rateLimiter.ts'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

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
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))

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
app.use('/api/auth', passportRoutes)
app.use('/api/v1/members', memberRoutes)
app.use('/api/v1/flight-logs', flightLogRoutes)
app.use('/api/v1/aircrafts', aircraftRoutes)
app.use('/api/v1/ajlb', ajlbRoutes)
app.use('/api/v1/invoices', invoiceRoutes)

const poller = startSimpleBooksOutboxProcessor()

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
  await pool.end() // Close DB connections
  poller?.stop()
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
