/**
 * One one-way mileage leg within a claim (issue #1021): structured start/end
 * addresses + optional waypoints, with distance auto-computed server-side via
 * OSRM (manual override still allowed) and a justification note required when
 * the actual distance exceeds the direct route by more than 20%.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import type { RouteDistanceResponse } from '@backend/routes/mileage-geo/models'
import { api } from '../../hooks/useApi'
import { AddressAutocomplete, type AddressValue } from './AddressAutocomplete'

export interface MileageLegForm {
  startAddress: AddressValue
  endAddress: AddressValue
  waypoints: AddressValue[]
  journeyDate: string
  distanceKm: string
  directDistanceKm: number | null
  justificationNote: string
  boardApproved: boolean
  // Tracks whether the user has typed over the server-computed distanceKm, so the
  // route-distance auto-fill (below) doesn't fight a deliberate manual override.
  distanceManuallyEdited: boolean
}

export function makeMileageLegForm(): MileageLegForm {
  return {
    startAddress: null,
    endAddress: null,
    waypoints: [],
    journeyDate: new Date().toISOString().substring(0, 10),
    distanceKm: '',
    directDistanceKm: null,
    justificationNote: '',
    boardApproved: false,
    distanceManuallyEdited: false,
  }
}

const JUSTIFICATION_THRESHOLD = 1.2
const ROUTE_DEBOUNCE_MS = 500

// Mirrors the backend's MILEAGE_MAX_KM (apps/backend/src/routes/expenses/mileageModels.ts)
// — this only gates the UI; the server enforces the same cap independently.
export const MILEAGE_MAX_KM = Number(import.meta.env.VITE_MILEAGE_MAX_KM) || 100

/**
 * Single source of truth for whether a mileage leg is ready to submit — previously
 * duplicated (and drifting) across ExpenseClaimForm.tsx and ExpenseClaimWizard.tsx.
 */
export function isMileageLegValid(leg: MileageLegForm): boolean {
  const km = Number(leg.distanceKm) || 0
  // Nullish, not falsy — directDistanceKm can legitimately be 0.
  const needsJustification =
    leg.directDistanceKm != null &&
    km > leg.directDistanceKm * JUSTIFICATION_THRESHOLD &&
    !leg.justificationNote.trim()
  return !!(
    leg.startAddress?.label?.trim() &&
    leg.endAddress?.label?.trim() &&
    leg.journeyDate &&
    km > 0 &&
    (km <= MILEAGE_MAX_KM || leg.boardApproved) &&
    !needsJustification
  )
}

interface Props {
  value: MileageLegForm
  onChange: (v: MileageLegForm) => void
  onRemove?: () => void
  disabled?: boolean
  effectiveRatePerKm?: number
  maxKm?: number
}

export function MileageDetailFields({
  value,
  onChange,
  onRemove,
  disabled,
  effectiveRatePerKm,
  maxKm = 100,
}: Props) {
  const { t } = useTranslation()
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always reflects the latest `value`/waypoints — read from inside the debounced
  // callback below instead of the closure's `value`, which goes stale for the
  // ~500ms the request is in flight (the user can edit other fields, e.g. type a
  // manual distance or a justification note, during that window).
  const valueRef = useRef(value)
  valueRef.current = value
  // Distinguishes the request this effect run kicked off from any newer one fired by
  // a subsequent address/waypoint change — a slow response for an old address pair
  // must never overwrite the result of a newer, faster one.
  const requestIdRef = useRef(0)

  const set = <K extends keyof MileageLegForm>(field: K, val: MileageLegForm[K]) =>
    onChange({ ...value, [field]: val })

  const startLat = value.startAddress?.lat
  const startLon = value.startAddress?.lon
  const endLat = value.endAddress?.lat
  const endLon = value.endAddress?.lon
  const waypointsKey = JSON.stringify(value.waypoints.map((w) => (w ? [w.lat, w.lon] : null)))

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (startLat == null || startLon == null || endLat == null || endLon == null) {
      return
    }

    setComputing(true)
    setComputeError(false)
    const requestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      // A waypoint the user typed manually (address search was unavailable when they
      // entered it) has no coordinates — it can't be routed through, so it's dropped
      // from the server-side distance calculation. It's still saved as free text.
      const waypoints = valueRef.current.waypoints
        .filter(
          (w): w is { label: string; lat: number; lon: number } => w?.lat != null && w?.lon != null,
        )
        .map((w) => ({ lat: w.lat, lon: w.lon }))
      try {
        const res = await api.post<RouteDistanceResponse>('v1/mileage/route-distance', {
          start: { lat: startLat, lon: startLon },
          end: { lat: endLat, lon: endLon },
          waypoints,
        })
        // A newer address/waypoint change superseded this request — its own effect
        // run already armed a fresh request, so this stale result is discarded.
        if (requestIdRef.current !== requestId) return
        onChange({
          ...valueRef.current,
          directDistanceKm: res.data.directDistanceKm,
          ...(valueRef.current.distanceManuallyEdited
            ? {}
            : { distanceKm: String(res.data.distanceKm) }),
        })
      } catch {
        // Don't block the user on our own tooling failing — leave distanceKm as-is,
        // manual entry remains available, just let them know why it wasn't filled in.
        if (requestIdRef.current === requestId) setComputeError(true)
      } finally {
        if (requestIdRef.current === requestId) setComputing(false)
      }
    }, ROUTE_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLat, startLon, endLat, endLon, waypointsKey])

  const km = Number(value.distanceKm) || 0
  const totalEur = effectiveRatePerKm && km > 0 ? (effectiveRatePerKm * km).toFixed(2) : null
  const exceedsLimit = km > maxKm

  // Nullish check, not falsy — directDistanceKm can legitimately be 0 (two very close
  // addresses geocoding to the same point), which should still be checked against km,
  // not treated the same as "OSRM unreachable, skip the check" (mirrors the backend's
  // hasRequiredJustification in mileageModels.ts).
  const needsJustification =
    value.directDistanceKm != null && km > value.directDistanceKm * JUSTIFICATION_THRESHOLD

  const setWaypoint = (idx: number, addr: AddressValue) =>
    onChange({
      ...value,
      waypoints: value.waypoints.map((w, i) => (i === idx ? addr : w)),
      distanceManuallyEdited: false,
      directDistanceKm: null,
    })

  const addWaypoint = () => onChange({ ...value, waypoints: [...value.waypoints, null] })
  const removeWaypoint = (idx: number) =>
    onChange({
      ...value,
      waypoints: value.waypoints.filter((_, i) => i !== idx),
      distanceManuallyEdited: false,
      directDistanceKm: null,
    })

  return (
    <Stack spacing={2}>
      <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant='subtitle2' sx={{ color: 'text.secondary' }}>
          {t('expenses.mileage.sectionTitle')}
        </Typography>
        {onRemove && !disabled && (
          <IconButton size='small' color='error' onClick={onRemove}>
            <Icon icon='mdi:delete-outline' />
          </IconButton>
        )}
      </Stack>

      {/* Start / end addresses */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <AddressAutocomplete
          label={t('expenses.mileage.startAddress')}
          value={value.startAddress}
          disabled={disabled}
          required
          onChange={(addr) =>
            onChange({
              ...value,
              startAddress: addr,
              distanceManuallyEdited: false,
              directDistanceKm: null,
            })
          }
        />
        <AddressAutocomplete
          label={t('expenses.mileage.endAddress')}
          value={value.endAddress}
          disabled={disabled}
          required
          onChange={(addr) =>
            onChange({
              ...value,
              endAddress: addr,
              distanceManuallyEdited: false,
              directDistanceKm: null,
            })
          }
        />
      </Stack>
      <Typography variant='caption' sx={{ color: 'text.secondary' }}>
        {t('expenses.mileage.osmNote')}
      </Typography>

      {/* Waypoints — always available; not gated behind a "not the most direct route" checkbox */}
      {value.waypoints.map((waypoint, idx) => (
        <Stack key={idx} direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1 }}>
            <AddressAutocomplete
              label={t('expenses.mileage.waypoint')}
              value={waypoint}
              disabled={disabled}
              onChange={(addr) => setWaypoint(idx, addr)}
            />
          </Box>
          {!disabled && (
            <IconButton size='small' color='error' onClick={() => removeWaypoint(idx)}>
              <Icon icon='mdi:close' />
            </IconButton>
          )}
        </Stack>
      ))}
      {!disabled && (
        <Box>
          <Button size='small' startIcon={<Icon icon='mdi:plus' />} onClick={addWaypoint}>
            {t('expenses.mileage.addWaypoint')}
          </Button>
        </Box>
      )}

      {/* Date + Distance */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label={t('expenses.mileage.journeyDate')}
          type='date'
          value={value.journeyDate}
          disabled={disabled}
          required
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 180 }}
          onChange={(e) => set('journeyDate', e.target.value)}
        />
        <TextField
          label={t('expenses.mileage.distanceKm')}
          type='number'
          value={value.distanceKm}
          disabled={disabled}
          required
          sx={{ width: 180 }}
          slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
          onChange={(e) =>
            onChange({ ...value, distanceKm: e.target.value, distanceManuallyEdited: true })
          }
          helperText={
            computing
              ? t('expenses.mileage.distanceCalculating')
              : computeError
                ? t('expenses.mileage.distanceCalculationFailed')
                : value.directDistanceKm
                  ? t('expenses.mileage.directDistance', { km: value.directDistanceKm })
                  : undefined
          }
        />
        {totalEur && effectiveRatePerKm && (
          <Box sx={{ pt: 0.5 }}>
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
              {t('expenses.mileage.estimatedAmount')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              €{totalEur}
              <Typography
                component='span'
                variant='caption'
                sx={{ color: 'text.secondary', ml: 1 }}
              >
                (€{effectiveRatePerKm}/km)
              </Typography>
            </Typography>
          </Box>
        )}
      </Stack>

      {/* Justification note required when the leg is >20% over the direct route */}
      {needsJustification && (
        <>
          <Alert severity='warning'>{t('expenses.mileage.justificationRequired')}</Alert>
          <TextField
            label={t('expenses.mileage.justificationNote')}
            value={value.justificationNote}
            disabled={disabled}
            required
            fullWidth
            multiline
            minRows={2}
            onChange={(e) => set('justificationNote', e.target.value)}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
        </>
      )}

      {/* Board approval required above limit */}
      {exceedsLimit && (
        <Alert severity='warning'>{t('expenses.mileage.boardApprovalRequired', { maxKm })}</Alert>
      )}
      {exceedsLimit && (
        <FormControlLabel
          control={
            <Checkbox
              checked={value.boardApproved}
              disabled={disabled}
              onChange={(e) => set('boardApproved', e.target.checked)}
            />
          }
          label={t('expenses.mileage.boardApprovedLabel')}
        />
      )}
    </Stack>
  )
}

// ─── List of legs (a claim can have multiple one-way legs — issue #1021) ──────

interface LegsEditorProps {
  legs: MileageLegForm[]
  onChange: (legs: MileageLegForm[]) => void
  disabled?: boolean
  effectiveRatePerKm?: number
  maxKm?: number
}

export function MileageLegsEditor({
  legs,
  onChange,
  disabled,
  effectiveRatePerKm,
  maxKm,
}: LegsEditorProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={2}>
      {legs.map((leg, idx) => (
        <Paper key={idx} variant='outlined' sx={{ p: 2 }}>
          <MileageDetailFields
            value={leg}
            disabled={disabled}
            effectiveRatePerKm={effectiveRatePerKm}
            maxKm={maxKm}
            onChange={(updated) => onChange(legs.map((l, i) => (i === idx ? updated : l)))}
            onRemove={
              legs.length > 1 ? () => onChange(legs.filter((_, i) => i !== idx)) : undefined
            }
          />
        </Paper>
      ))}
      {!disabled && (
        <Box>
          <Button
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() => onChange([...legs, makeMileageLegForm()])}
          >
            {t('expenses.mileage.addLeg')}
          </Button>
        </Box>
      )}
    </Stack>
  )
}
