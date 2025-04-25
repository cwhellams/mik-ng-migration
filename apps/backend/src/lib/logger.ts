import 'dotenv/config'
import { createLogger, format, transports } from 'winston'

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
)

// Define Winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [new transports.Console({ format: format.simple() })],
})

export default logger
