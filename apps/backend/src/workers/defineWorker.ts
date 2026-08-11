import cron, { type ScheduledTask } from 'node-cron'
import logger from '../lib/logger.ts'

/** What every worker's `start` returns, so `app.ts` can stop them uniformly. */
export interface WorkerHandle {
  stop: () => void
}

/**
 * Deps accepted by every cron-scheduled worker. Individual workers extend this
 * with their own injectables (`sendEmailFn`, `getInvoice`, …); tests pass a
 * mock `cronSchedule` to capture the scheduled callback without waiting for a
 * real cron tick.
 */
export interface CronWorkerDeps {
  cronSchedule?: typeof cron.schedule
}

export interface WorkerDefinition<Deps extends CronWorkerDeps> {
  /** Human-readable name, used verbatim in every log line this worker emits. */
  name: string
  /**
   * Env var prefix. `<PREFIX>_ENABLED=true` starts the worker; when
   * `runOnStartup` is set, `<PREFIX>_RUN_ON_STARTUP=true` also runs it once at
   * boot.
   */
  envPrefix: string
  /** node-cron expression. */
  schedule: string
  /** Plain-English gloss of `schedule` for the startup log, e.g. 'hourly'. */
  scheduleDescription: string
  /**
   * Whether `<PREFIX>_RUN_ON_STARTUP` is honoured. Opt-in rather than
   * universal: the workers that fan out emails over a fixed time window
   * deliberately do not offer it, and silently giving that env var meaning
   * would turn a deploy into a mail blast.
   */
  runOnStartup?: boolean
  /** The job itself. Runs on the schedule and, optionally, once at startup. */
  run: (deps: Deps) => Promise<void>
}

/**
 * Build a worker's `start` function from a declaration.
 *
 * Every cron worker in this directory had the same ~45 lines around its actual
 * job: read `<PREFIX>_ENABLED`, log and no-op when off, schedule, optionally
 * run once at startup, and return a `stop` that clears the task. This owns
 * that scaffold so each worker file is left with only its own logic.
 */
export function defineWorker<Deps extends CronWorkerDeps = CronWorkerDeps>(
  definition: WorkerDefinition<Deps>,
): (deps?: Deps) => WorkerHandle {
  const { name, envPrefix, schedule, scheduleDescription, runOnStartup = false, run } = definition

  // Env is read inside `start`, not here: tests toggle `<PREFIX>_ENABLED`
  // between imports, and reading at module scope would freeze the first value.
  return (deps: Deps = {} as Deps): WorkerHandle => {
    if (process.env[`${envPrefix}_ENABLED`] !== 'true') {
      logger.warn(`${name} is disabled (set ${envPrefix}_ENABLED=true to enable)`)
      return {
        stop: () => {
          logger.info(`${name} is not running`)
        },
      }
    }

    logger.info(`Starting ${name} — scheduled ${scheduleDescription}`)

    const { cronSchedule = cron.schedule } = deps
    // The callback stays async and catches internally, which has to hold both
    // ways: it must never hand node-cron a rejected promise (that surfaces as
    // an unhandled rejection), and the promise it returns must still resolve
    // only once the job is done — the worker suites capture this callback and
    // await it to drive a run.
    let scheduledTask: ScheduledTask | null = cronSchedule(schedule, async () => {
      logger.info(`${name}: starting scheduled run`)
      try {
        await run(deps)
      } catch (error) {
        logger.error(`${name}: error during scheduled run:`, error)
      }
    })

    if (runOnStartup && process.env[`${envPrefix}_RUN_ON_STARTUP`] === 'true') {
      logger.info(`${name}: running immediately on startup`)
      run(deps).catch((error) => {
        logger.error(`${name}: error during startup run:`, error)
      })
    }

    return {
      stop: () => {
        logger.info(`Stopping ${name}`)
        // node-cron's stop() is async, but shutdown does not wait on it —
        // same as before, just no longer repeated in fifteen files.
        void scheduledTask?.stop()
        scheduledTask = null
      },
    }
  }
}
