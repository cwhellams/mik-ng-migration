import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { TimeResponse } from '@backend/routes/time/api'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

/** Re-sync with server every 5 minutes */
const RESYNC_MS = 5 * 60 * 1000

/** Warn if local clock diverges from server by more than 5 minutes */
const SKEW_THRESHOLD_MS = 5 * 60 * 1000

export interface ServerClockState {
  /** UTC epoch in ms, adjusted for server-client clock skew */
  utcMs: number
  /** Whether the first server sync has completed */
  synced: boolean
  /** True when the local clock differs from server time by > 5 minutes */
  skewed: boolean
  /** Raw offset in ms: positive means local clock is behind, negative = ahead */
  skewMs: number
}

const defaultState: ServerClockState = {
  utcMs: Date.now(),
  synced: false,
  skewed: false,
  skewMs: 0,
}

const ServerClockContext = createContext<ServerClockState>(defaultState)

export const ServerClockProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  // Offset stored in a ref so the 1-second tick closure always reads the latest
  // value without needing to re-create the interval.
  const offsetRef = useRef<number>(0)

  const [state, setState] = useState<ServerClockState>(defaultState)

  const sync = useCallback(async () => {
    try {
      const t0 = Date.now()
      const res = await fetch(`${API_BASE}/api/v1/time`)
      if (!res.ok) return
      const data = (await res.json()) as TimeResponse
      const t1 = Date.now()

      // NTP-style one-way delay compensation: assume symmetric latency.
      // offset = serverTime - midpointClientTime
      const offset = data.epochMs - (t0 + t1) / 2
      offsetRef.current = offset

      const skewed = Math.abs(offset) > SKEW_THRESHOLD_MS
      setState((prev: ServerClockState) => ({
        ...prev,
        synced: true,
        skewed,
        skewMs: offset,
      }))
    } catch {
      // Network error — keep the existing offset, stay synced.
    }
  }, [])

  // Tick every second to update utcMs
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev: ServerClockState) => ({
        ...prev,
        utcMs: Date.now() + offsetRef.current,
      }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Initial sync + periodic re-sync every RESYNC_MS
  useEffect(() => {
    sync()
    const id = setInterval(sync, RESYNC_MS)
    return () => clearInterval(id)
  }, [sync])

  return (
    <ServerClockContext.Provider value={state}>
      {children}
    </ServerClockContext.Provider>
  )
}

/** Returns the server-authoritative clock state. Must be within <ServerClockProvider>. */
export const useServerClock = (): ServerClockState =>
  useContext(ServerClockContext)
