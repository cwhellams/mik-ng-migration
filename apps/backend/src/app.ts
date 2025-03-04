import express, {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express'
import helmet from 'helmet'
import cors from 'cors'
// import compression from "compression";
import { RateLimiterMemory } from 'rate-limiter-flexible'
import dotenv from 'dotenv'
import authRoutes from './routes/auth/otp'
import morgan from 'morgan'
import logger from './lib/logger'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

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

// Auth Routes
app.use('/auth', authRoutes)

// Error Handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.message)
  res.status(500).json({ message: 'Internal Server Error' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
