import express, {
  Request,
  Response,
  NextFunction,
  //RequestHandler,
} from 'express'
import helmet from 'helmet'
import cors from 'cors'
// import compression from "compression";
import { RateLimiterMemory } from 'rate-limiter-flexible'
import dotenv from 'dotenv'
import { router as authRoutes } from './routes/auth/otp'
import { router as memberRoutes } from './routes/members/api'
import morgan from 'morgan'
import logger from './lib/logger'
import { ErrorResponse } from './routes/response'

// Load environment variables for local development - we will not ship this file to production and will use environment variables from the hosting provider
dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3000

logger.info('Bootstrapping mik-ng service on port %d', PORT)

// Morgan logs HTTP requests
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
)

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error: %s', err.message)
  res.status(500).send('Something went wrong!')
})

// Security Middlewares
app.use(helmet()) // Secure headers
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
// app.use(compression());

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Rate Limiting
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 }) // 10 requests per second
const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await rateLimiter.consume(req.ip || req.socket.remoteAddress || '0.0.0.0')
    next()
  } catch {
    res.status(429).json({ message: 'Too many requests, slow down.' })
  }
}
app.use(rateLimiterMiddleware)

// Example Route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello World NG' })
})

// Routes
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/members', memberRoutes)

// Error Handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.status(500).json(<ErrorResponse>{ message: 'Internal Server Error' })
})

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
})
