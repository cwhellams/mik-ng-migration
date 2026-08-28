import {
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  CircularProgress,
  Stack,
  Box,
  Paper,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import type { Dayjs } from 'dayjs'
import { AircraftListResponse } from '@mik/contracts/aircrafts'
import { FlightLogExportFormat, type FlightLogExportCountResponse } from '@mik/contracts/flight-log'
import useApi, { sharedApi } from '@mik/ui/hooks/useApi'
import { sudoHeader, useApiConfig } from '@mik/ui/hooks/apiConfig'
import { AxiosError } from 'axios'
import { endpoints } from '../../../api/endpoints'

const ALL_FORMATS = [
  FlightLogExportFormat.CSV,
  FlightLogExportFormat.FOREFLIGHT,
  FlightLogExportFormat.MYFLIGHTBOOK,
  FlightLogExportFormat.CREWLOUNGE,
  FlightLogExportFormat.LOGBOOK_AERO,
  FlightLogExportFormat.LOGTEN,
  FlightLogExportFormat.FLYLOG,
  FlightLogExportFormat.EASA_PDF,
]

type Props = {
  open: boolean
  onClose: () => void
  defaultAircraftRegistration?: string
  /**
   * The member whose log the list is currently showing, when that is somebody other than
   * the reader. The export follows the list rather than quietly widening to every
   * member's flights — an admin who filtered the list to one member and then hit Export
   * used to get the whole club back (#1249).
   *
   * `label` is what the list has on screen for them: the resolved name, or the raw id
   * while that is still in flight.
   */
  memberFilter?: { memberId: string; label: string }
}

export const FlightLogExportDialog = ({
  open,
  onClose,
  defaultAircraftRegistration,
  memberFilter,
}: Props) => {
  const { t } = useTranslation()
  // The same flag useApi sends, from the same place — this dialog talks to
  // sharedApi directly (a debounced count and a blob download) rather than
  // through the hook, so it has to ask for the header rather than assume it.
  const { sudo } = useApiConfig()

  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [endDate, setEndDate] = useState<Dayjs | null>(null)
  const [aircraftRegistration, setAircraftRegistration] = useState<string | undefined>(
    defaultAircraftRegistration,
  )
  const [format, setFormat] = useState<FlightLogExportFormat>(FlightLogExportFormat.CSV)
  const [count, setCount] = useState<number | null>(null)
  const [isCountLoading, setIsCountLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // The id, not the object: the parent builds `memberFilter` fresh on every render, so
  // depending on the object itself would reset the debounce below on renders that changed
  // nothing about who is being exported.
  const memberFilterId = memberFilter?.memberId

  // Sync default aircraft when dialog opens
  useEffect(() => {
    if (open) {
      setAircraftRegistration(defaultAircraftRegistration)
    }
  }, [open, defaultAircraftRegistration])

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })

  // Debounced count fetch
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) return

    debounceRef.current = setTimeout(async () => {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate.toISOString()
      if (endDate) params.endDate = endDate.toISOString()
      if (aircraftRegistration) params.aircraftRegistration = aircraftRegistration
      if (memberFilterId) params.onBoardMemberId = memberFilterId

      setIsCountLoading(true)
      try {
        const res = await sharedApi.get<FlightLogExportCountResponse>(
          'v1/flight-logs/export/count',
          { params, headers: sudoHeader(sudo) },
        )
        setCount(res.data.count)
      } catch {
        setCount(null)
      } finally {
        setIsCountLoading(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, startDate, endDate, aircraftRegistration, memberFilterId, sudo])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params: Record<string, string> = { format }
      if (startDate) params.startDate = startDate.toISOString()
      if (endDate) params.endDate = endDate.toISOString()
      if (aircraftRegistration) params.aircraftRegistration = aircraftRegistration
      if (memberFilterId) params.onBoardMemberId = memberFilterId

      const res = await sharedApi.get('v1/flight-logs/export', {
        params,
        responseType: 'blob',
        headers: sudoHeader(sudo),
      })

      const disposition: string = res.headers['content-disposition'] ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename =
        match?.[1] ?? `flight-log.${format === FlightLogExportFormat.EASA_PDF ? 'pdf' : 'csv'}`

      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof AxiosError) {
        console.error('Export failed', err.message)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const countLabel = (() => {
    if (isCountLoading) return t('flightLog.export.countLoading')
    if (count === null) return ''
    if (count === 0) return t('flightLog.export.countResultZero')
    return t('flightLog.export.countResult', { count })
  })()

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('flightLog.export.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Whose log is being exported. Stated rather than implied: the dialog offers no
              member picker, so this is the only thing on it that says the file will not
              cover every member's flights. */}
          {memberFilter && (
            <Alert severity='info' icon={false} sx={{ py: 0.5 }}>
              {t('flightLog.export.memberScope', { name: memberFilter.label })}
            </Alert>
          )}

          {/* Aircraft filter */}
          <FormControl fullWidth>
            <InputLabel id='export-aircraft-label'>{t('flightLog.aircraft')}</InputLabel>
            <Select
              labelId='export-aircraft-label'
              value={aircraftRegistration ?? ''}
              label={t('flightLog.aircraft')}
              onChange={(e) =>
                setAircraftRegistration(e.target.value === '' ? undefined : e.target.value)
              }
            >
              <MenuItem value={''}>{t('flightLog.export.allAircraft')}</MenuItem>
              {aircraftData?.aircrafts.map((plane) => (
                <MenuItem key={plane.registration} value={plane.registration}>
                  {plane.registration}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Date range */}
          <Box>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>
              {t('flightLog.export.dateRange')}
            </Typography>
            <Stack direction='row' spacing={2}>
              <DatePicker
                label={t('flightLog.export.startDate')}
                value={startDate}
                onChange={setStartDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
              <DatePicker
                label={t('flightLog.export.endDate')}
                value={endDate}
                onChange={setEndDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Stack>
          </Box>

          {/* Count display */}
          <Box sx={{ minHeight: 24 }}>
            {isCountLoading ? (
              <Stack
                direction='row'
                spacing={1}
                sx={{
                  alignItems: 'center',
                }}
              >
                <CircularProgress size={16} />
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('flightLog.export.countLoading')}
                </Typography>
              </Stack>
            ) : countLabel ? (
              <Typography variant='body2' color={count === 0 ? 'text.secondary' : 'text.primary'}>
                {countLabel}
              </Typography>
            ) : null}
          </Box>

          {/* Format selector */}
          <Box>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>
              {t('flightLog.export.format')}
            </Typography>
            <RadioGroup
              value={format}
              onChange={(e) => setFormat(e.target.value as FlightLogExportFormat)}
            >
              {ALL_FORMATS.map((fmt) => {
                const label = t(`flightLog.export.formats.${fmt}.label`)
                const extension = t(`flightLog.export.formats.${fmt}.extension`)
                const platforms = t(`flightLog.export.formats.${fmt}.platforms`)
                return (
                  <Paper
                    key={fmt}
                    variant='outlined'
                    sx={{
                      mb: 0.5,
                      px: 1.5,
                      py: 0.5,
                      border: fmt === format ? '2px solid' : '1px solid',
                      borderColor: fmt === format ? 'primary.main' : 'divider',
                    }}
                  >
                    <FormControlLabel
                      value={fmt}
                      control={<Radio size='small' />}
                      label={
                        <Stack
                          direction='row'
                          spacing={1}
                          sx={{
                            alignItems: 'center',
                          }}
                        >
                          <Typography
                            variant='body2'
                            sx={{
                              fontWeight: 500,
                            }}
                          >
                            {label}
                          </Typography>
                          <Typography
                            variant='caption'
                            sx={{
                              color: 'text.secondary',
                            }}
                          >
                            {extension}
                          </Typography>
                          <Typography
                            variant='caption'
                            sx={{
                              color: 'text.secondary',
                            }}
                          >
                            — {platforms}
                          </Typography>
                        </Stack>
                      }
                      sx={{ my: 0 }}
                    />
                  </Paper>
                )
              })}
            </RadioGroup>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
        <Button
          variant='contained'
          onClick={handleExport}
          disabled={count === 0 || isExporting}
          startIcon={isExporting ? <CircularProgress size={16} /> : undefined}
        >
          {isExporting ? t('flightLog.export.exporting') : t('flightLog.export.exportButton')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
