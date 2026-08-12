import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Link } from 'react-router'
import { Icon } from '@iconify/react'
import Papa from 'papaparse'
import type { Dayjs } from 'dayjs'
import {
  MemberChangeType,
  MIKMemberTypes,
  type MemberChangeLogEntry,
  type MemberChangeLogResponse,
} from '@mik/contracts/members'
import useApi from '../../hooks/useApi'
import { dayjs } from '../../utils/date'
import { RemoteContent } from '../../components/RemoteContent'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Title } from '../../components/Title'
import { useTimezone } from '../../hooks/useTimezone'

/** The secretary's default reporting window */
const DEFAULT_PERIOD_DAYS = 30

/** Longest period the API accepts in a single request */
const MAX_PERIOD_DAYS = 366

// System accounts are never part of the registry change log
const FILTERABLE_MEMBER_TYPES = Object.values(MIKMemberTypes).filter(
  (type) => type !== MIKMemberTypes.SYSTEM,
)

const CHANGE_TYPE_COLOR: Record<
  MemberChangeType,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  [MemberChangeType.REGISTERED]: 'info',
  [MemberChangeType.APPROVED]: 'success',
  [MemberChangeType.LEFT]: 'error',
  [MemberChangeType.DELETED]: 'error',
  [MemberChangeType.RESTORED]: 'success',
  [MemberChangeType.TYPE_CHANGED]: 'warning',
  [MemberChangeType.UPDATED]: 'default',
}

const MemberChangeLog = () => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  const [startDate, setStartDate] = useState<Dayjs | null>(
    dayjs().subtract(DEFAULT_PERIOD_DAYS, 'day'),
  )
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs())
  const [memberTypes, setMemberTypes] = useState<MIKMemberTypes[]>([])

  const validationError = useMemo(() => {
    if (!startDate?.isValid() || !endDate?.isValid()) {
      return t('member.changeLog.errors.required')
    }
    if (startDate.isAfter(endDate, 'day')) {
      return t('member.changeLog.errors.startAfterEnd')
    }
    if (endDate.diff(startDate, 'day') > MAX_PERIOD_DAYS) {
      return t('member.changeLog.errors.periodTooLong', { days: MAX_PERIOD_DAYS })
    }
    return null
  }, [startDate, endDate, t])

  const { data, isLoading, error } = useApi<MemberChangeLogResponse>(
    {
      url: 'v1/members/changelog',
      params: validationError
        ? {}
        : {
            startDate: startDate!.format('YYYY-MM-DD'),
            endDate: endDate!.format('YYYY-MM-DD'),
            ...(memberTypes.length > 0 ? { memberType: memberTypes } : {}),
          },
      skipFetch: !!validationError,
    },
    {
      keepPreviousData: true,
    },
  )

  const memberTypeLabel = (type: MIKMemberTypes | null) =>
    type ? t(`member.types.${type.toLowerCase()}`) : ''

  const fieldLabel = (column: string) =>
    // Falls back to the raw column name (humanised) for columns without a translation
    t(`member.changeLog.fields.${column}`, column.replace(/_/g, ' '))

  const handleExportCsv = () => {
    if (!data?.entries.length) return

    const csv = Papa.unparse(
      data.entries.map((entry) => ({
        [t('member.changeLog.table.changedAt')]: formatDateTime(entry.changedAt),
        [t('member.changeLog.table.member')]: `${entry.firstName} ${entry.lastName}`,
        [t('member.changeLog.table.memberType')]: entry.previousMemberType
          ? `${memberTypeLabel(entry.previousMemberType)} → ${memberTypeLabel(entry.memberType)}`
          : memberTypeLabel(entry.memberType),
        [t('member.changeLog.table.change')]: t(`member.changeLog.changeType.${entry.changeType}`),
        [t('member.changeLog.table.changedFields')]: entry.changedFields.map(fieldLabel).join(', '),
        [t('member.changeLog.table.changedBy')]: entry.changedByName ?? entry.changedBy,
      })),
    )

    const link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `member-changelog-${startDate?.format('YYYY-MM-DD')}-${endDate?.format('YYYY-MM-DD')}.csv`,
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const summaryCard = (label: string, value: number, color?: string) => (
    <Grid size={{ xs: 4 }}>
      <Paper sx={{ p: 2, height: '100%' }}>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography variant='h4' sx={{ color }}>
          {value}
        </Typography>
      </Paper>
    </Grid>
  )

  return (
    <Box>
      <Title label={t('member.changeLog.title')} />
      <Typography variant='body2' sx={{ color: 'text.secondary', mb: 3 }}>
        {t('member.changeLog.description')}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <DatePicker
            label={t('member.changeLog.filters.startDate')}
            value={startDate}
            onChange={setStartDate}
            format={t('general.dateFormat')}
            disableFuture
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <DatePicker
            label={t('member.changeLog.filters.endDate')}
            value={endDate}
            onChange={setEndDate}
            format={t('general.dateFormat')}
            disableFuture
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <FormControl fullWidth>
            <InputLabel id='member-type-label'>
              {t('member.changeLog.filters.memberType')}
            </InputLabel>
            <Select
              multiple
              labelId='member-type-label'
              id='member-type'
              value={memberTypes}
              input={<OutlinedInput label={t('member.changeLog.filters.memberType')} />}
              onChange={({ target }) =>
                setMemberTypes(
                  typeof target.value === 'string'
                    ? (target.value.split(',') as MIKMemberTypes[])
                    : target.value,
                )
              }
              renderValue={(selected) =>
                selected.length === 0
                  ? t('member.changeLog.filters.allTypes')
                  : selected.map((type) => memberTypeLabel(type)).join(', ')
              }
              displayEmpty
            >
              {FILTERABLE_MEMBER_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  <Checkbox checked={memberTypes.includes(type)} />
                  <ListItemText primary={memberTypeLabel(type)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Button
            variant='outlined'
            startIcon={<Icon icon='mdi:download' />}
            onClick={handleExportCsv}
            disabled={!data?.entries.length}
            fullWidth
            sx={{ height: '56px' }}
          >
            {t('member.changeLog.export')}
          </Button>
        </Grid>
      </Grid>

      {validationError && (
        <Alert severity='error' sx={{ mb: 3 }}>
          {validationError}
        </Alert>
      )}

      {data && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {summaryCard(
            t('member.changeLog.summary.newMembers'),
            data.summary.newMembers,
            'success.main',
          )}
          {summaryCard(
            t('member.changeLog.summary.leftMembers'),
            data.summary.leftMembers,
            'error.main',
          )}
          {summaryCard(t('member.changeLog.summary.totalChanges'), data.summary.totalChanges)}
        </Grid>
      )}

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={2}>{t('member.changeLog.table.changedAt')}</Grid>
              <Grid size={2}>{t('member.changeLog.table.member')}</Grid>
              <Grid size={2}>{t('member.changeLog.table.memberType')}</Grid>
              <Grid size={2}>{t('member.changeLog.table.change')}</Grid>
              <Grid size='grow'>{t('member.changeLog.table.changedFields')}</Grid>
              <Grid size={2}>{t('member.changeLog.table.changedBy')}</Grid>
            </>
          }
          notFoundMsg={t('member.changeLog.noChanges')}
          rows={data?.entries}
          row={(entry: MemberChangeLogEntry) => (
            <>
              <Grid size={{ xs: 12, md: 2 }}>{formatDateTime(entry.changedAt)}</Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                {entry.changeType === MemberChangeType.DELETED ? (
                  `${entry.firstName} ${entry.lastName}`
                ) : (
                  <Link to={`/club/members/${entry.memberId}`}>
                    {entry.firstName} {entry.lastName}
                  </Link>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                {entry.previousMemberType && entry.previousMemberType !== entry.memberType
                  ? `${memberTypeLabel(entry.previousMemberType)} → ${memberTypeLabel(entry.memberType)}`
                  : memberTypeLabel(entry.memberType)}
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Chip
                  size='small'
                  color={CHANGE_TYPE_COLOR[entry.changeType]}
                  label={t(`member.changeLog.changeType.${entry.changeType}`)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 'grow' }}>
                <Stack direction='row' sx={{ flexWrap: 'wrap', gap: '4px' }}>
                  {entry.changedFields.slice(0, 4).map((field) => (
                    <Chip key={field} size='small' variant='outlined' label={fieldLabel(field)} />
                  ))}
                  {entry.changedFields.length > 4 && (
                    <Tooltip title={entry.changedFields.slice(4).map(fieldLabel).join(', ')}>
                      <Chip
                        size='small'
                        variant='outlined'
                        label={`+${entry.changedFields.length - 4}`}
                      />
                    </Tooltip>
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>{entry.changedByName ?? entry.changedBy}</Grid>
            </>
          )}
        />
      </RemoteContent>
    </Box>
  )
}

export default MemberChangeLog
