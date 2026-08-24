import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { Icon } from '@iconify/react'
import type { OccurrenceRegistryCountResponse } from '@mik/contracts/occurrences'
import { Title } from '@mik/ui/components/Title'
import { sharedApi } from '@mik/ui/hooks/useApi'
import { sudoHeader, useApiConfig } from '@mik/ui/hooks/apiConfig'
import { dayjs, HELSINKI_TIMEZONE } from '@mik/ui/utils/date'

/**
 * Prints the occurrence register (#519) — the anonymized reports and their
 * handling as an A4 PDF, to attach to the annual activity report filed with
 * Traficom. Moved here from the member app's occurrences page once the admin
 * UI split (#1233) landed: printing the register is desk work for the safety
 * manager, not something done in the field.
 */

type Scope = 'ALL' | 'DTO'

/**
 * The register states every date in club local time, so the period has to be
 * bounded by the local start and end of the chosen days. Taking the browser's
 * own day would silently move the boundary for anyone abroad, dropping an
 * occurrence reported in the small hours of the first day of the period.
 */
const periodStart = (day: Dayjs): string =>
  dayjs.tz(day.format('YYYY-MM-DD'), HELSINKI_TIMEZONE).startOf('day').toISOString()

const periodEnd = (day: Dayjs): string =>
  dayjs.tz(day.format('YYYY-MM-DD'), HELSINKI_TIMEZONE).endOf('day').toISOString()

/**
 * The query the count preview and the download both send. A half-typed date
 * arrives as an invalid Dayjs, which would serialise to `Invalid Date` and 400
 * the request, so an incomplete bound is simply left out.
 */
const registryParams = (
  fromDate: Dayjs | null,
  toDate: Dayjs | null,
  scope: Scope,
): Record<string, string> => ({
  ...(fromDate?.isValid() ? { fromDate: periodStart(fromDate) } : {}),
  ...(toDate?.isValid() ? { toDate: periodEnd(toDate) } : {}),
  ...(scope === 'DTO' ? { dtoOnly: 'true' } : {}),
})

const OccurrenceRegistryPage = () => {
  const { t } = useTranslation()
  const { sudo } = useApiConfig()

  // The register exists for the annual report, so it opens on the current
  // calendar year rather than on "everything ever reported".
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf('year'))
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs().endOf('year'))
  const [scope, setScope] = useState<Scope>('ALL')

  const [count, setCount] = useState<number | null>(null)
  const [isCountLoading, setIsCountLoading] = useState(false)
  const [countFailed, setCountFailed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  // Debounced, because a date picker emits a value on every keystroke while the
  // field is being typed into.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setIsCountLoading(true)
      setCountFailed(false)
      try {
        const res = await sharedApi.get<OccurrenceRegistryCountResponse>(
          'v1/occurrences/export/count',
          {
            params: registryParams(fromDate, toDate, scope),
            headers: sudoHeader(sudo),
          },
        )
        setCount(res.data.count)
      } catch {
        setCount(null)
        setCountFailed(true)
      } finally {
        setIsCountLoading(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fromDate, toDate, scope, sudo])

  const handleExport = async () => {
    setIsExporting(true)
    setExportFailed(false)
    try {
      const res = await sharedApi.get('v1/occurrences/export', {
        params: registryParams(fromDate, toDate, scope),
        responseType: 'blob',
        headers: sudoHeader(sudo),
      })

      const disposition: string = res.headers['content-disposition'] ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'occurrence-register.pdf'

      const url = URL.createObjectURL(res.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportFailed(true)
    } finally {
      setIsExporting(false)
    }
  }

  const countLabel = (() => {
    if (count === null) return ''
    if (count === 0) return t('occurrences.registry.countResultZero')
    return t('occurrences.registry.countResult', { count })
  })()

  return (
    <Box>
      <Title label={t('occurrences.registry.title')} />
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
              {t('occurrences.registry.info')}
            </Typography>

            <Box>
              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                {t('occurrences.registry.dateRange')}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <DatePicker
                  label={t('occurrences.registry.startDate')}
                  value={fromDate}
                  onChange={setFromDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <DatePicker
                  label={t('occurrences.registry.endDate')}
                  value={toDate}
                  onChange={setToDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Stack>
            </Box>

            <Box>
              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                {t('occurrences.registry.scope')}
              </Typography>
              <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                <FormControlLabel
                  value='ALL'
                  control={<Radio size='small' />}
                  label={t('occurrences.registry.scopeAll')}
                />
                <FormControlLabel
                  value='DTO'
                  control={<Radio size='small' />}
                  label={t('occurrences.registry.scopeDto')}
                />
              </RadioGroup>
            </Box>

            <Box sx={{ minHeight: 24 }}>
              {isCountLoading ? (
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                  <CircularProgress size={16} />
                  <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {t('occurrences.registry.countLoading')}
                  </Typography>
                </Stack>
              ) : countFailed ? (
                <Alert severity='warning'>{t('occurrences.registry.countFailed')}</Alert>
              ) : countLabel ? (
                <Typography variant='body2' color={count === 0 ? 'text.secondary' : 'text.primary'}>
                  {countLabel}
                </Typography>
              ) : null}
            </Box>

            {exportFailed && <Alert severity='error'>{t('occurrences.registry.failed')}</Alert>}

            <Box>
              <Button
                variant='contained'
                onClick={handleExport}
                disabled={count === 0 || isExporting}
                startIcon={
                  isExporting ? <CircularProgress size={16} /> : <Icon icon='mdi:printer' />
                }
              >
                {isExporting
                  ? t('occurrences.registry.exporting')
                  : t('occurrences.registry.exportButton')}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

export default OccurrenceRegistryPage
