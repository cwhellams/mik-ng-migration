import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Tooltip, Typography } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Icon } from '@iconify/react'
import type { Dayjs } from 'dayjs'

import { BookingStatus } from '@mik/contracts/bookings'
import {
  DEFAULT_PERIOD_MONTHS,
  HEAD_GAP_THRESHOLD_MINS,
  TAIL_GAP_THRESHOLD_MINS,
  type MemberEfficiencyEntry,
  type MemberEfficiencyResponse,
} from '@mik/contracts/member-efficiency'
import type { Member } from '@mik/contracts/members'

import { endpoints } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { dayjs } from '@mik/ui/utils/date'
import { efficiencyColor, formatEfficiency } from '../../utils/efficiency'
import { formatHHMM } from '@mik/ui/utils/format'

/**
 * One member's reservations measured against what was actually flown out of them
 * (issue #1174).
 *
 * The club-wide report on the Stats page anonymises its "by member" breakdown on
 * purpose, so it can show that efficiency is low without pointing at anybody. This page
 * is the deliberate exception: MEMBER_ADMIN only, one named member at a time, and it
 * exists so an admin can answer "is this member tying up an aircraft they aren't flying"
 * with the individual bookings rather than a single number.
 */

/** Which flag a booking earns, in the order an admin cares about. */
type EntryState = 'cancelled' | 'noFlight' | 'underused' | 'flown'

const stateOf = (entry: MemberEfficiencyEntry): EntryState => {
  if (entry.status === BookingStatus.CANCELLED) return 'cancelled'
  if (entry.flightCount === 0) return 'noFlight'
  return entry.isUnderused ? 'underused' : 'flown'
}

const STATE_COLOR: Record<EntryState, 'default' | 'success' | 'warning' | 'error'> = {
  cancelled: 'error',
  noFlight: 'error',
  underused: 'warning',
  flown: 'success',
}

const MemberEfficiencyReport = () => {
  const { t } = useTranslation()
  const { memberId } = useParams()
  const { formatDate, formatTime, formatDateTime } = useTimezone()

  const [from, setFrom] = useState<Dayjs | null>(dayjs().subtract(DEFAULT_PERIOD_MONTHS, 'month'))
  const [to, setTo] = useState<Dayjs | null>(dayjs())

  const validationError = useMemo(() => {
    if (!from?.isValid() || !to?.isValid()) return t('member.efficiency.errors.required')
    if (from.isAfter(to, 'day')) return t('member.efficiency.errors.startAfterEnd')
    return null
  }, [from, to, t])

  const { data: member } = useApi<Member>({
    url: memberId ? endpoints.members.byId(memberId) : endpoints.members.root,
    skipFetch: !memberId,
    alwaysSudo: true,
  })

  const { data, isLoading, error } = useApi<MemberEfficiencyResponse>(
    {
      url: memberId ? endpoints.members.reservationEfficiency(memberId) : endpoints.members.root,
      params: validationError
        ? {}
        : { from: from!.startOf('day').toISOString(), to: to!.endOf('day').toISOString() },
      skipFetch: !memberId || !!validationError,
      alwaysSudo: true,
    },
    { keepPreviousData: true },
  )

  const summary = data?.summary
  const memberName = member ? `${member.firstName} ${member.lastName}` : ''

  const summaryCard = (label: string, value: string, hint?: string, color?: string) => (
    <Grid size={{ xs: 6, sm: 4, md: 2 }}>
      <Paper sx={{ p: 2, height: '100%' }}>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography variant='h4' sx={{ color }}>
          {value}
        </Typography>
        {hint && (
          <Typography variant='caption' sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        )}
      </Paper>
    </Grid>
  )

  const stateChip = (entry: MemberEfficiencyEntry) => {
    const state = stateOf(entry)
    const chip = (
      <Chip
        size='small'
        color={STATE_COLOR[state]}
        variant={state === 'flown' ? 'outlined' : 'filled'}
        label={t(`member.efficiency.state.${state}`)}
      />
    )

    if (state === 'underused') {
      return (
        <Tooltip
          title={t('member.efficiency.underusedExplanation', {
            head: formatHHMM(entry.headGapMins ?? 0),
            tail: formatHHMM(entry.tailGapMins ?? 0),
            headLimit: HEAD_GAP_THRESHOLD_MINS,
            tailLimit: TAIL_GAP_THRESHOLD_MINS,
          })}
        >
          {chip}
        </Tooltip>
      )
    }
    return chip
  }

  const cancellationNote = (entry: MemberEfficiencyEntry) => {
    if (entry.status !== BookingStatus.CANCELLED) return null
    const reason = entry.cancellationReason
      ? t(`schedule.cancellationReasons.${entry.cancellationReason}`, entry.cancellationReason)
      : t('member.efficiency.noReasonGiven')
    const notice =
      entry.cancelledNoticeHours == null
        ? null
        : entry.cancelledNoticeHours < 0
          ? t('member.efficiency.cancelledAfterStart')
          : t('member.efficiency.cancelledNotice', {
              hours: entry.cancelledNoticeHours.toFixed(1),
            })

    return (
      <Tooltip title={entry.cancellationNote ?? formatDateTime(entry.cancelledAt)}>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          {[reason, notice].filter(Boolean).join(' · ')}
        </Typography>
      </Tooltip>
    )
  }

  return (
    <Box>
      <Title label={t('member.efficiency.title')}>
        {memberId && (
          <Button
            component={Link}
            to={`/club/members/${memberId}`}
            startIcon={<Icon icon='mdi:account' />}
          >
            {t('member.efficiency.backToProfile')}
          </Button>
        )}
      </Title>
      <Typography variant='body2' sx={{ color: 'text.secondary', mb: 3 }}>
        {memberName
          ? t('member.efficiency.descriptionFor', { name: memberName })
          : t('member.efficiency.description')}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <DatePicker
            label={t('member.efficiency.filters.from')}
            value={from}
            onChange={setFrom}
            format={t('general.dateFormat')}
            disableFuture
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <DatePicker
            label={t('member.efficiency.filters.to')}
            value={to}
            onChange={setTo}
            format={t('general.dateFormat')}
            disableFuture
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Grid>
      </Grid>

      {validationError && (
        <Alert severity='error' sx={{ mb: 3 }}>
          {validationError}
        </Alert>
      )}

      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {summaryCard(
            t('member.efficiency.summary.memberEfficiency'),
            formatEfficiency(summary.memberEfficiencyPct),
            t('member.efficiency.summary.flownOfReserved', {
              flown: formatHHMM(summary.totalFlightMins),
              reserved: formatHHMM(summary.totalReservedMins),
            }),
          )}
          {summaryCard(
            t('member.efficiency.summary.clubEfficiency'),
            formatEfficiency(summary.clubEfficiencyPct),
            t('member.efficiency.summary.samePeriod'),
          )}
          {summaryCard(
            t('member.efficiency.summary.bookings'),
            String(summary.bookingCount),
            t('member.efficiency.summary.inPeriod'),
          )}
          {summaryCard(
            t('member.efficiency.summary.cancelled'),
            String(summary.cancelledCount),
            undefined,
            summary.cancelledCount > 0 ? 'error.main' : undefined,
          )}
          {summaryCard(
            t('member.efficiency.summary.underused'),
            String(summary.underusedCount),
            undefined,
            summary.underusedCount > 0 ? 'warning.main' : undefined,
          )}
          {summaryCard(
            t('member.efficiency.summary.noShow'),
            String(summary.noShowCount),
            undefined,
            summary.noShowCount > 0 ? 'error.main' : undefined,
          )}
        </Grid>
      )}

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={2}>{t('member.efficiency.table.date')}</Grid>
              <Grid size={1}>{t('member.efficiency.table.aircraft')}</Grid>
              <Grid size={2}>{t('member.efficiency.table.reserved')}</Grid>
              <Grid size={1}>{t('member.efficiency.table.reservedTime')}</Grid>
              <Grid size={1}>{t('member.efficiency.table.flightTime')}</Grid>
              <Grid size={1}>{t('member.efficiency.table.efficiency')}</Grid>
              <Grid size={2}>{t('member.efficiency.table.status')}</Grid>
              <Grid size='grow'>{t('member.efficiency.table.notes')}</Grid>
            </>
          }
          notFoundMsg={t('member.efficiency.noBookings')}
          rows={data?.entries}
          row={(entry: MemberEfficiencyEntry) => (
            <>
              <Grid size={{ xs: 12, md: 2 }}>{formatDate(entry.startTime)}</Grid>
              <Grid size={{ xs: 12, md: 1 }}>{entry.registration}</Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
              </Grid>
              <Grid size={{ xs: 12, md: 1 }}>{formatHHMM(entry.reservedMins)}</Grid>
              <Grid size={{ xs: 12, md: 1 }}>{formatHHMM(entry.flightMins)}</Grid>
              <Grid size={{ xs: 12, md: 1 }}>
                <Chip
                  size='small'
                  label={formatEfficiency(entry.efficiencyPct)}
                  color={efficiencyColor(entry.efficiencyPct)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Stack direction='row' sx={{ gap: '4px', flexWrap: 'wrap' }}>
                  {stateChip(entry)}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 'grow' }}>{cancellationNote(entry)}</Grid>
            </>
          )}
        />
      </RemoteContent>
    </Box>
  )
}

export default MemberEfficiencyReport
