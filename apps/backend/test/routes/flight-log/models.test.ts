import { describe, expect, it, jest } from '@jest/globals'
import { validateFlightLogTimes } from '../../../src/routes/flight-log/models.ts'

describe('validateFlightLogTimes', () => {
  it('rejects epochs in the future', () => {
    const addIssue = jest.fn()
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600

    validateFlightLogTimes({ offBlockTimeEpoch: futureEpoch.toString() }, addIssue)

    expect(addIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'too_big',
        path: ['offBlockTimeEpoch'],
        message: expect.stringMatching(/^future:\d+$/),
      }),
    )
  })

  it('allows epochs in the past', () => {
    const addIssue = jest.fn()
    const pastEpoch = Math.floor(Date.now() / 1000) - 3600

    validateFlightLogTimes(
      {
        offBlockTimeEpoch: pastEpoch.toString(),
        takeoffTimeEpoch: (pastEpoch + 300).toString(),
      },
      addIssue,
    )

    expect(addIssue).not.toHaveBeenCalled()
  })

  it('rejects out-of-order times', () => {
    const addIssue = jest.fn()
    const now = Math.floor(Date.now() / 1000) - 3600

    validateFlightLogTimes(
      { offBlockTimeEpoch: now.toString(), takeoffTimeEpoch: (now - 60).toString() },
      addIssue,
    )

    expect(addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'too_small', path: ['takeoffTimeEpoch'] }),
    )
  })
})
