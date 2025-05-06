import { TFunction } from 'i18next'
import { timeToMinutes } from './timeUtils'

export interface TimeErrors {
  offBlock: string
  takeoff: string
  landing: string
  onBlock: string
}

/**
 * Validates the logical sequence of flight times
 * Returns updated errors object if validation fails
 */
export const validateTimeSequence = (
  currentTimeType: 'offBlock' | 'takeoff' | 'landing' | 'onBlock',
  currentValue: string,
  timeValues: {
    offBlockTime: string
    takeoffTime: string
    landingTime: string
    onBlockTime: string
  },
  timeErrors: TimeErrors,
  t: TFunction
): TimeErrors => {
  const { offBlockTime, takeoffTime, landingTime, onBlockTime } = timeValues

  // Skip validation if no flight date
  if (!currentValue) return timeErrors

  const offBlockMinutes = timeToMinutes(offBlockTime)
  const takeoffMinutes = timeToMinutes(takeoffTime)
  const landingMinutes = timeToMinutes(landingTime)
  const onBlockMinutes = timeToMinutes(onBlockTime)
  const currentMinutes = timeToMinutes(currentValue)

  // Skip validation if we don't have enough data
  if (currentMinutes < 0) return timeErrors

  // Detect and handle sequence issues
  const errors = { ...timeErrors }
  let hasError = false

  if (
    currentTimeType === 'takeoff' &&
    takeoffMinutes < offBlockMinutes &&
    offBlockMinutes > 0
  ) {
    // If takeoff is earlier than off-block, it might be next day or error
    if (takeoffMinutes + 24 * 60 < offBlockMinutes) {
      // This is probably an error
      errors.takeoff = t(
        'flightLog.takeoffBeforeOffBlock',
        'Takeoff time should be after off-block time'
      )
      hasError = true
    }
  }

  if (
    currentTimeType === 'landing' &&
    landingMinutes < takeoffMinutes &&
    takeoffMinutes > 0
  ) {
    // If landing is earlier than takeoff, assume next day unless extreme difference
    if (landingMinutes + 24 * 60 < takeoffMinutes) {
      // This is probably an error
      errors.landing = t(
        'flightLog.landingBeforeTakeoff',
        'Landing time should be after takeoff time'
      )
      hasError = true
    }
  }

  if (
    currentTimeType === 'onBlock' &&
    onBlockMinutes < landingMinutes &&
    landingMinutes > 0
  ) {
    // If on-block is earlier than landing, assume next day unless extreme difference
    if (onBlockMinutes + 24 * 60 < landingMinutes) {
      // This is probably an error
      errors.onBlock = t(
        'flightLog.onBlockBeforeLanding',
        'On-block time should be after landing time'
      )
      hasError = true
    }
  }

  return hasError ? errors : timeErrors
}
