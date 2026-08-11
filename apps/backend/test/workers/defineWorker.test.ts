import { jest } from '@jest/globals'
import type { ScheduledTask, TaskFn, TaskOptions } from 'node-cron'

// Mock the logger so a disabled worker's warnings don't pollute test output.
jest.mock('../../src/lib/logger.ts', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const { defineWorker } = await import('../../src/workers/defineWorker.ts')

const ENV_PREFIX = 'TEST_FACTORY_WORKER'

describe('defineWorker', () => {
  let mockCronSchedule: jest.Mock<
    (expression: string, func: string | TaskFn, options?: TaskOptions) => ScheduledTask
  >
  let mockStop: jest.Mock

  const makeWorker = (run: () => Promise<void>, overrides: { runOnStartup?: boolean } = {}) =>
    defineWorker({
      name: 'Test Worker',
      envPrefix: ENV_PREFIX,
      schedule: '0 3 * * *',
      scheduleDescription: 'daily at 03:00',
      run,
      ...overrides,
    })

  beforeEach(() => {
    jest.clearAllMocks()
    mockStop = jest.fn()
    mockCronSchedule = jest.fn().mockReturnValue({ stop: mockStop }) as never
    process.env[`${ENV_PREFIX}_ENABLED`] = 'true'
    delete process.env[`${ENV_PREFIX}_RUN_ON_STARTUP`]
  })

  afterAll(() => {
    delete process.env[`${ENV_PREFIX}_ENABLED`]
    delete process.env[`${ENV_PREFIX}_RUN_ON_STARTUP`]
  })

  it('schedules the job when enabled', () => {
    const run = jest.fn(async () => {})
    const worker = makeWorker(run)({ cronSchedule: mockCronSchedule })

    expect(mockCronSchedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function))
    expect(run).not.toHaveBeenCalled()

    worker.stop()
  })

  it('does not schedule anything when disabled', () => {
    process.env[`${ENV_PREFIX}_ENABLED`] = 'false'

    const run = jest.fn(async () => {})
    const worker = makeWorker(run)({ cronSchedule: mockCronSchedule })

    expect(mockCronSchedule).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()

    // A disabled worker still returns a usable handle, so shutdown stays uniform.
    expect(() => worker.stop()).not.toThrow()
  })

  it('reads the enabled flag on each start, not at module load', () => {
    const start = makeWorker(async () => {})

    process.env[`${ENV_PREFIX}_ENABLED`] = 'false'
    start({ cronSchedule: mockCronSchedule }).stop()
    expect(mockCronSchedule).not.toHaveBeenCalled()

    process.env[`${ENV_PREFIX}_ENABLED`] = 'true'
    start({ cronSchedule: mockCronSchedule }).stop()
    expect(mockCronSchedule).toHaveBeenCalledTimes(1)
  })

  it('runs the job when the scheduled callback fires', async () => {
    const run = jest.fn(async () => {})
    makeWorker(run)({ cronSchedule: mockCronSchedule })

    const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>
    await scheduledCallback()

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('swallows a scheduled-run failure rather than producing an unhandled rejection', async () => {
    const run = jest.fn(async () => {
      throw new Error('scheduled boom')
    })
    makeWorker(run)({ cronSchedule: mockCronSchedule })

    const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>

    // Resolves rather than rejects: node-cron is never handed a rejected
    // promise, so a failing job can't take the process down.
    await expect(scheduledCallback()).resolves.toBeUndefined()
  })

  it('resolves the scheduled callback only after the job has finished', async () => {
    // The worker suites drive a run by capturing this callback and awaiting it
    // (see aircraftDocumentExpiryWorker.test.ts). Catching the rejection
    // outside the callback instead of inside would make it return undefined,
    // and every one of those suites would assert against an unfinished job.
    let finished = false
    const run = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      finished = true
    })
    makeWorker(run)({ cronSchedule: mockCronSchedule })

    const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>
    await scheduledCallback()

    expect(finished).toBe(true)
  })

  it('passes the injected deps through to the job', async () => {
    const run = jest.fn(async () => {})
    const start = defineWorker<{ cronSchedule?: never; marker?: string }>({
      name: 'Test Worker',
      envPrefix: ENV_PREFIX,
      schedule: '0 3 * * *',
      scheduleDescription: 'daily at 03:00',
      run,
    })

    start({ cronSchedule: mockCronSchedule as never, marker: 'injected' })
    await (mockCronSchedule.mock.calls[0][1] as () => Promise<void>)()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ marker: 'injected' }))
  })

  describe('run on startup', () => {
    it('runs immediately when the worker opts in and the flag is set', () => {
      process.env[`${ENV_PREFIX}_RUN_ON_STARTUP`] = 'true'

      const run = jest.fn(async () => {})
      makeWorker(run, { runOnStartup: true })({ cronSchedule: mockCronSchedule })

      expect(run).toHaveBeenCalledTimes(1)
    })

    it('ignores the flag for workers that do not opt in', () => {
      process.env[`${ENV_PREFIX}_RUN_ON_STARTUP`] = 'true'

      const run = jest.fn(async () => {})
      makeWorker(run, { runOnStartup: false })({ cronSchedule: mockCronSchedule })

      expect(run).not.toHaveBeenCalled()
    })

    it('does not run immediately when the flag is unset', () => {
      const run = jest.fn(async () => {})
      makeWorker(run, { runOnStartup: true })({ cronSchedule: mockCronSchedule })

      expect(run).not.toHaveBeenCalled()
    })

    it('swallows a startup failure rather than crashing boot', async () => {
      process.env[`${ENV_PREFIX}_RUN_ON_STARTUP`] = 'true'

      const run = jest.fn(async () => {
        throw new Error('boom')
      })

      expect(() =>
        makeWorker(run, { runOnStartup: true })({ cronSchedule: mockCronSchedule }),
      ).not.toThrow()

      // Let the rejected promise settle so the catch handler runs.
      await new Promise((resolve) => setImmediate(resolve))
    })
  })

  it('stops the scheduled task, and tolerates being stopped twice', () => {
    const worker = makeWorker(async () => {})({ cronSchedule: mockCronSchedule })

    worker.stop()
    expect(mockStop).toHaveBeenCalledTimes(1)

    worker.stop()
    expect(mockStop).toHaveBeenCalledTimes(1)
  })
})
