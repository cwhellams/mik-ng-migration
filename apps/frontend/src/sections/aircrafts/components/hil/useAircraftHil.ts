import { useMemo } from 'react'
import { mutate } from 'swr'
import type { AircraftHilOverview } from '@mik/contracts/aircraft-hil'
import useApi from '@mik/ui/hooks/useApi'

const OVERVIEW_URL = 'v1/aircraft-hil/overview'

/**
 * Hold Item List and grounding status for a single aircraft. Available to every
 * member who can see aircraft details — hold item restrictions affect what kind
 * of flights other pilots may fly.
 */
export const useAircraftHil = (aircraftRegistration: string, includeResolved = false) => {
  const params = useMemo(
    () => ({
      aircraftRegistration,
      ...(includeResolved ? { includeResolved: 'true' } : {}),
    }),
    [aircraftRegistration, includeResolved],
  )

  const { data, isLoading, error } = useApi<AircraftHilOverview[]>({
    url: OVERVIEW_URL,
    params,
  })

  const overview = data?.find((entry) => entry.aircraftRegistration === aircraftRegistration)

  return {
    hil: overview?.hil ?? [],
    isGrounded: overview?.isGrounded ?? false,
    openDefectCount: overview?.openDefectCount ?? 0,
    openDefects: overview?.openDefects ?? [],
    overdueHilCount: overview?.overdueHilCount ?? 0,
    isLoading,
    error,
  }
}

/** Revalidate every cached hold item list after a change */
export const refreshAircraftHil = () =>
  mutate(
    (key: unknown) =>
      Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-hil'),
  )
