import { HttpStatusCode } from 'axios'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import helmet from 'helmet'
// import compression from "compression";
import morgan from 'morgan'
import pg from 'pg'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { ZodError } from 'zod'

import logger from './lib/logger.ts'
import { router as aircraftRoutes } from './routes/aircrafts/api.ts'
import { router as passportRoutes } from './routes/auth/login.ts'
import flightLogRoutes from './routes/flight-log/api.ts'
import { router as memberRoutes } from './routes/members/api.ts'
import type { ErrorResponse } from './routes/response.ts'

// Load environment variables for local development - we will not ship this file to production and will use environment variables from the hosting provider
dotenv.config()
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

const app = express()
const PORT = process.env.BACKEND_PORT || 3000

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

// Rate Limiting
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 }) // 10 requests per second
const rateLimiterMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await rateLimiter.consume(req.ip ?? req.socket.remoteAddress ?? '0.0.0.0')
    next()
  } catch {
    res.status(429).json({ message: 'Too many requests, slow down.' })
  }
}
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

app.get('/hello', (_req, res) => {
  res.status(HttpStatusCode.Ok).send('Hello World!')
})

// Routes
app.use('/auth', passportRoutes)
app.use('/api/v1/members', memberRoutes)
app.use('/api/v1/flight-log', flightLogRoutes)
app.use('/api/v1/aircrafts', aircraftRoutes)

// Error Handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  if (res.headersSent) {
    return next(err)
  }

  if (err instanceof ZodError) {
    res.status(400).json(<ErrorResponse>{ message: err.message })
  }

  res.status(500).json(<ErrorResponse>{ message: 'Internal Server Error' })
})

//Digital ocean requires that app services bing to 0.0.0.0
//docs.digitalocean.com/products/app-platform/how-to/manage-services/
const server = app.listen(PORT, () => {
  logger.info(`Server running on http://0.0.0.0:${PORT}`)
})

// Gracefully handle app termination (Ctrl+C, kill, crashes)
const shutdown = async (): Promise<void> => {
  console.warn('\nShutting down server...')
  await pool.end() // Close DB connections
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
