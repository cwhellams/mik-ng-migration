import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import { Grid } from '@mui/system'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { dayjs } from '@mik/ui/utils/date'
import type { Dayjs } from 'dayjs'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import Papa from 'papaparse'
import { Download } from '@mui/icons-material'
import { formatHHMM } from '@mik/ui/utils/format'

interface InstructorWorktimeEntry {
  instructorMemberId: string
  instructorName: string
  date: string
  flightCount: number
  totalTimeMins: number
  workTimeMins: number
}

interface InstructorWorktimeResponse {
  data: InstructorWorktimeEntry[]
  filters: {
    startDate: string
    endDate: string
    timeType: 'block' | 'air'
  }
}

type GroupBy = 'day' | 'week' | 'month' | 'year'

interface GroupedEntry {
  instructorName: string
  period: string
  flightCount: number
  totalTimeMins: number
  workTimeMins: number
}

const groupEntries = (data: InstructorWorktimeEntry[], groupBy: GroupBy): GroupedEntry[] => {
  const map = new Map<string, GroupedEntry>()

  for (const entry of data) {
    const d = dayjs(entry.date)
    let period: string
    switch (groupBy) {
      case 'day':
        period = entry.date
        break
      case 'week':
        period = `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`
        break
      case 'month':
        period = d.format('YYYY-MM')
        break
      case 'year':
        period = d.format('YYYY')
        break
    }

    const key = `${entry.instructorMemberId}:${period}`
    const existing = map.get(key)
    if (existing) {
      existing.flightCount += entry.flightCount
      existing.totalTimeMins += entry.totalTimeMins
      existing.workTimeMins += entry.workTimeMins
    } else {
      map.set(key, {
        instructorName: entry.instructorName,
        period,
        flightCount: entry.flightCount,
        totalTimeMins: entry.totalTimeMins,
        workTimeMins: entry.workTimeMins,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const periodCmp = a.period.localeCompare(b.period)
    if (periodCmp !== 0) return periodCmp
    return a.instructorName.localeCompare(b.instructorName)
  })
}

export const InstructorWorktimeReport = () => {
  const { t } = useTranslation()
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().startOf('year'))
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs())
  const [timeType, setTimeType] = useState<'block' | 'air'>('block')
  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [shouldFetch, setShouldFetch] = useState(false)

  const {
    data: reportData,
    isLoading,
    error,
  } = useApi<InstructorWorktimeResponse>({
    url: 'v1/instructor-worktime',
    params:
      shouldFetch && startDate && endDate
        ? {
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            timeType,
          }
        : {},
    skipFetch: !shouldFetch || !startDate || !endDate,
  })

  const groupedData = useMemo(() => {
    if (!reportData?.data) return []
    return groupEntries(reportData.data, groupBy)
  }, [reportData?.data, groupBy])

  const handleGenerateReport = () => {
    if (!startDate || !endDate) return
    setShouldFetch(true)
  }

  const handleExportCSV = () => {
    if (!groupedData.length) return

    const csvData = groupedData.map((entry) => ({
      [t('instructorWorktime.table.instructor')]: entry.instructorName,
      [t('instructorWorktime.table.period')]: entry.period,
      [t('instructorWorktime.table.flights')]: entry.flightCount,
      [t('instructorWorktime.table.totalTime')]: formatHHMM(entry.totalTimeMins),
      [t('instructorWorktime.table.workTime')]: formatHHMM(entry.workTimeMins),
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `instructor-worktime-${startDate?.format('YYYY-MM-DD')}-${endDate?.format('YYYY-MM-DD')}.csv`,
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getValidationError = (): string | null => {
    if (!startDate || !endDate) {
      return t('instructorWorktime.errors.required')
    }
    if (endDate.isAfter(dayjs(), 'day')) {
      return t('instructorWorktime.errors.endDateFuture')
    }
    if (startDate.isAfter(endDate)) {
      return t('instructorWorktime.errors.startAfterEnd')
    }
    return null
  }

  const validationError = getValidationError()

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Typography variant='h5' gutterBottom>
          {t('instructorWorktime.title')}
        </Typography>
        <Typography
          variant='body2'
          gutterBottom
          sx={{
            color: 'text.secondary',
            mb: 3,
          }}
        >
          {t('instructorWorktime.description')}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Grid
            container
            spacing={2}
            sx={{
              alignItems: 'center',
            }}
          >
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('instructorWorktime.filters.startDate')}
                value={startDate}
                onChange={(newValue) => {
                  setStartDate(newValue)
                  setShouldFetch(false)
                }}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label={t('instructorWorktime.filters.endDate')}
                value={endDate}
                onChange={(newValue) => {
                  setEndDate(newValue)
                  setShouldFetch(false)
                }}
                format={t('general.dateFormat')}
                disableFuture
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <ToggleButtonGroup
                value={timeType}
                exclusive
                onChange={(_e, val) => {
                  if (val) {
                    setTimeType(val)
                    setShouldFetch(false)
                  }
                }}
                fullWidth
                sx={{ height: '56px' }}
              >
                <ToggleButton value='block'>
                  {t('instructorWorktime.filters.blockTime')}
                </ToggleButton>
                <ToggleButton value='air'>{t('instructorWorktime.filters.airTime')}</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button
                variant='contained'
                onClick={handleGenerateReport}
                disabled={!!validationError}
                fullWidth
                sx={{ height: '56px' }}
              >
                {t('instructorWorktime.filters.generate')}
              </Button>
            </Grid>
          </Grid>

          {validationError && (
            <Alert severity='error' sx={{ mt: 2 }}>
              {validationError}
            </Alert>
          )}
        </Box>

        <RemoteContent isLoading={isLoading} error={error}>
          {reportData?.data && reportData.data.length > 0 ? (
            <>
              <Box
                sx={{
                  mb: 2,
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <ToggleButtonGroup
                  value={groupBy}
                  exclusive
                  onChange={(_e, val) => {
                    if (val) setGroupBy(val)
                  }}
                  size='small'
                >
                  <ToggleButton value='day'>{t('instructorWorktime.groupBy.day')}</ToggleButton>
                  <ToggleButton value='week'>{t('instructorWorktime.groupBy.week')}</ToggleButton>
                  <ToggleButton value='month'>{t('instructorWorktime.groupBy.month')}</ToggleButton>
                  <ToggleButton value='year'>{t('instructorWorktime.groupBy.year')}</ToggleButton>
                </ToggleButtonGroup>

                <Button
                  variant='outlined'
                  startIcon={<Download />}
                  onClick={handleExportCSV}
                  size='small'
                >
                  {t('instructorWorktime.filters.export')}
                </Button>
              </Box>

              <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size='small' sx={{ minWidth: { xs: 500, md: 'auto' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('instructorWorktime.table.instructor')}</TableCell>
                      <TableCell>{t('instructorWorktime.table.period')}</TableCell>
                      <TableCell align='right'>{t('instructorWorktime.table.flights')}</TableCell>
                      <TableCell align='right'>{t('instructorWorktime.table.totalTime')}</TableCell>
                      <TableCell align='right'>{t('instructorWorktime.table.workTime')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedData.map((row) => (
                      <TableRow key={`${row.instructorName}:${row.period}`}>
                        <TableCell>{row.instructorName}</TableCell>
                        <TableCell>{row.period}</TableCell>
                        <TableCell align='right'>{row.flightCount}</TableCell>
                        <TableCell align='right'>{formatHHMM(row.totalTimeMins)}</TableCell>
                        <TableCell align='right'>{formatHHMM(row.workTimeMins)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : shouldFetch ? (
            <Alert severity='info'>{t('instructorWorktime.noData')}</Alert>
          ) : null}
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
