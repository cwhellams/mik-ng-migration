import { createLogger, format, transports } from 'winston'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
)

// Define Winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new transports.Console({ format: format.simple() }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
})

export default logger
