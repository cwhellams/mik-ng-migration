import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Paper,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { SnackAlert } from '../../components/SnackAlert'
import { formatPhoneNumber } from '../../utils/format'
import type { Problem } from '@backend/routes/response'
import type {
  NonRenewalListResponse,
  NonRenewalMember,
} from '@backend/routes/members/models'
import { useTimezone } from '../../hooks/useTimezone'

export default function NonRenewals() {
  const { t } = useTranslation()
  const { isMembersAdmin } = useRoles()
  const { formatDate, formatDateTime } = useTimezone()

  const [problem, setProblem] = useState<Problem | undefined>()
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const { data, isLoading, error, mutate } = useApi<NonRenewalListResponse>({
    url: 'v1/members/non-renewals',
  })

  const { mutation } = useApi<void, void>({ url: 'v1/members/non-renewals' })

  const year = data?.year ?? new Date().getFullYear()
  const members = data?.members ?? []

  // ── selection helpers ──────────────────────────────────────────────────────
  const selectableIds = members
    .filter((m) => m.billableFlightCount === 0)
    .map((m) => m.memberId)
  const isAllSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const isIndeterminate = selected.size > 0 && !isAllSelected

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  const toggleSelect = (memberId: string, hasFlights: boolean) => {
    if (hasFlights) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  // ── single-row handlers ────────────────────────────────────────────────────
  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      setProblem({ status: 200, detail: t('member.nonRenewalsEmailCopied') })
    } catch {
      // clipboard not available in some environments
    }
  }

  const handleSendReminder = async (member: NonRenewalMember) => {
    const name = `${member.firstName} ${member.lastName}`
    if (
      !globalThis.confirm(t('member.nonRenewalsSendReminderConfirm', { name }))
    ) {
      return
    }

    setActionLoadingId(`reminder-${member.memberId}`)
    const { error: mutErr } = await mutation.trigger(
      'POST',
      {},
      `/v1/members/${member.memberId}/send-renewal-reminder`
    )
    setActionLoadingId(null)

    if (mutErr) {
      return setProblem(mutErr)
    }

    setProblem({
      status: 200,
      detail: t('member.nonRenewalsSendReminderSuccess', { name }),
    })

    mutate()
  }

  const handleRemoveMember = async (member: NonRenewalMember) => {
    const name = `${member.firstName} ${member.lastName}`
    if (
      !globalThis.confirm(t('member.nonRenewalsRemoveMemberConfirm', { name }))
    ) {
      return
    }

    setActionLoadingId(`remove-${member.memberId}`)
    const { error: mutErr } = await mutation.trigger(
      'POST',
      { reason: 'Membership deactivated due to non-renewal of annual fee' },
      `/v1/members/${member.memberId}/deactivate`
    )
    setActionLoadingId(null)

    if (mutErr) {
      return setProblem(mutErr)
    }

    setProblem({
      status: 200,
      detail: t('member.nonRenewalsRemoveMemberSuccess', { name }),
    })

    mutate()
  }

  // ── bulk handlers ──────────────────────────────────────────────────────────
  const handleBulkSendReminder = async () => {
    const count = selected.size
    if (
      !globalThis.confirm(
        t('member.nonRenewalsBulkSendReminderConfirm', { count })
      )
    ) {
      return
    }

    setBulkLoading(true)
    const ids = [...selected]
    let successCount = 0
    let firstError: Problem | undefined

    for (const memberId of ids) {
      const { error: mutErr } = await mutation.trigger(
        'POST',
        {},
        `/v1/members/${memberId}/send-renewal-reminder`
      )
      if (mutErr) {
        firstError = mutErr
      } else {
        successCount++
      }
    }

    setBulkLoading(false)
    setSelected(new Set())
    mutate()

    if (firstError && successCount === 0) {
      setProblem(firstError)
    } else {
      setProblem({
        status: 200,
        detail: t('member.nonRenewalsBulkSendReminderSuccess', {
          count: successCount,
        }),
      })
    }
  }

  const handleBulkRemove = async () => {
    // Safety net: never deactivate members who have flights this year
    const ids = [...selected].filter((id) => {
      const member = members.find((m) => m.memberId === id)
      return member && member.billableFlightCount === 0
    })
    const count = ids.length
    if (count === 0) return
    if (
      !globalThis.confirm(t('member.nonRenewalsBulkRemoveConfirm', { count }))
    ) {
      return
    }

    setBulkLoading(true)
    let successCount = 0
    let firstError: Problem | undefined

    for (const memberId of ids) {
      const { error: mutErr } = await mutation.trigger(
        'POST',
        { reason: 'Membership deactivated due to non-renewal of annual fee' },
        `/v1/members/${memberId}/deactivate`
      )
      if (mutErr) {
        firstError = mutErr
      } else {
        successCount++
      }
    }

    setBulkLoading(false)
    setSelected(new Set())
    mutate()

    if (firstError && successCount === 0) {
      setProblem(firstError)
    } else {
      setProblem({
        status: 200,
        detail: t('member.nonRenewalsBulkRemoveSuccess', {
          count: successCount,
        }),
      })
    }
  }

  if (!isMembersAdmin) {
    return (
      <Box>
        <Title label={t('member.nonRenewals', 'Non-Renewals')} />
        <Typography>{t('member.noPermission')}</Typography>
      </Box>
    )
  }

  const isBusy = bulkLoading || actionLoadingId !== null

  return (
    <Box>
      <SnackAlert problem={problem} />
      <Title
        label={t(
          'member.nonRenewalsTitle',
          'Members Without Annual Fee {{year}}',
          { year }
        )}
      />

      <Typography variant='body2' color='text.secondary' mb={3}>
        {t('member.nonRenewalsSubtitle')}
      </Typography>

      <RemoteContent error={error} isLoading={isLoading}>
        {members.length === 0 ? (
          <Typography color='text.secondary'>
            {t('member.nonRenewalsEmpty', { year })}
          </Typography>
        ) : (
          <>
            {/* Bulk action toolbar — visible only when rows are selected */}
            {selected.size > 0 && (
              <Stack
                direction='row'
                spacing={1}
                alignItems='center'
                mb={1}
                px={2}
                py={1}
                sx={{ bgcolor: 'action.selected', borderRadius: 1 }}
              >
                <Typography variant='body2' sx={{ flexGrow: 1 }}>
                  {t('member.nonRenewalsBulkSelected', {
                    count: selected.size,
                  })}
                </Typography>

                <Button
                  size='small'
                  variant='contained'
                  color='primary'
                  disabled={isBusy}
                  startIcon={<Icon icon='mdi:email-send-outline' />}
                  onClick={handleBulkSendReminder}
                >
                  {t(
                    'member.nonRenewalsBulkSendReminder',
                    'Send Reminders ({{count}})',
                    { count: selected.size }
                  )}
                </Button>

                <Button
                  size='small'
                  variant='contained'
                  color='error'
                  disabled={isBusy}
                  startIcon={<Icon icon='mdi:account-remove-outline' />}
                  onClick={handleBulkRemove}
                >
                  {t(
                    'member.nonRenewalsBulkRemove',
                    'Remove Members ({{count}})',
                    { count: selected.size }
                  )}
                </Button>
              </Stack>
            )}

            {bulkLoading && <LinearProgress sx={{ mb: 1 }} />}

            <TableContainer component={Paper} variant='outlined'>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell padding='checkbox'>
                      <Checkbox
                        size='small'
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={toggleSelectAll}
                        disabled={isBusy}
                        slotProps={{
                          input: { 'aria-label': 'select all members' },
                        }}
                      />
                    </TableCell>
                    <TableCell>{t('member.name', 'Name')}</TableCell>
                    <TableCell>
                      {t('member.emailPhone', 'Email / Phone')}
                    </TableCell>
                    <TableCell>
                      {t('member.nonRenewalsAutoRenew', 'Opted In')}
                    </TableCell>
                    <TableCell>
                      {t('member.nonRenewalsFeeStatus', 'Fee Status')}
                    </TableCell>
                    <TableCell align='center'>
                      {t('member.nonRenewalsFlights', 'Flights')}
                    </TableCell>
                    <TableCell align='right'>
                      {t('member.nonRenewalsActions', 'Actions')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => {
                    const fullName = `${member.firstName} ${member.lastName}`
                    const isReminderLoading =
                      actionLoadingId === `reminder-${member.memberId}`
                    const isRemoveLoading =
                      actionLoadingId === `remove-${member.memberId}`
                    const isChecked = selected.has(member.memberId)
                    const hasFlightsThisYear = member.billableFlightCount > 0
                    const lastReminderDate = formatDateTime(
                      member.lastReminderSentAt
                    )

                    return (
                      <TableRow
                        key={member.memberId}
                        hover
                        selected={isChecked}
                        onClick={() =>
                          !isBusy &&
                          toggleSelect(member.memberId, hasFlightsThisYear)
                        }
                        sx={{
                          cursor:
                            isBusy || hasFlightsThisYear
                              ? 'default'
                              : 'pointer',
                        }}
                      >
                        <TableCell
                          padding='checkbox'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            size='small'
                            checked={isChecked}
                            onChange={() =>
                              toggleSelect(member.memberId, hasFlightsThisYear)
                            }
                            disabled={isBusy || hasFlightsThisYear}
                            slotProps={{
                              input: { 'aria-label': `select ${fullName}` },
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          <Typography variant='body2' fontWeight='medium'>
                            {fullName}
                          </Typography>
                          <Typography variant='caption' color='text.secondary'>
                            {member.memberId}
                          </Typography>
                        </TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Stack
                            direction='row'
                            alignItems='center'
                            spacing={0.5}
                          >
                            <Typography variant='body2'>
                              {member.email}
                            </Typography>
                            <Tooltip
                              title={t(
                                'member.nonRenewalsEmailCopied',
                                'Copy email'
                              )}
                            >
                              <IconButton
                                size='small'
                                onClick={() => handleCopyEmail(member.email)}
                                aria-label='copy email'
                              >
                                <Icon icon='mdi:content-copy' width={14} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          <Typography variant='body2' color='text.secondary'>
                            {member.phoneNumber
                              ? formatPhoneNumber(member.phoneNumber)
                              : '—'}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          {member.autoRenewAnnualMembership === false ? (
                            <Chip
                              label={t(
                                'member.nonRenewalsAutoRenewOff',
                                'Opted Out'
                              )}
                              size='small'
                              color='warning'
                              variant='outlined'
                            />
                          ) : (
                            <Chip
                              label={t(
                                'member.nonRenewalsAutoRenewOn',
                                'Opted In'
                              )}
                              size='small'
                              color='success'
                              variant='outlined'
                            />
                          )}
                        </TableCell>

                        <TableCell>
                          {member.feeStatus === 'unpaid' ? (
                            <Stack spacing={0.25}>
                              <Chip
                                label={t(
                                  'member.nonRenewalsInvoiceUnpaid',
                                  'Invoice Unpaid'
                                )}
                                size='small'
                                color='warning'
                                variant='filled'
                              />
                              {member.invoiceSentAt && (
                                <Typography
                                  variant='caption'
                                  color='text.secondary'
                                >
                                  {t(
                                    'member.nonRenewalsInvoicedOn',
                                    'Invoiced: {{date}}',
                                    {
                                      date: formatDate(member.invoiceSentAt),
                                    }
                                  )}
                                </Typography>
                              )}
                              {member.invoiceDueAt && (
                                <Typography
                                  variant='caption'
                                  color={
                                    new Date(member.invoiceDueAt) < new Date()
                                      ? 'error'
                                      : 'text.secondary'
                                  }
                                >
                                  {t(
                                    'member.nonRenewalsInvoiceDueOn',
                                    'Due: {{date}}',
                                    {
                                      date: formatDate(member.invoiceDueAt),
                                    }
                                  )}
                                </Typography>
                              )}
                            </Stack>
                          ) : (
                            <Chip
                              label={t(
                                'member.nonRenewalsNoFeeRecord',
                                'No Fee Record'
                              )}
                              size='small'
                              color='default'
                              variant='outlined'
                            />
                          )}
                        </TableCell>

                        <TableCell
                          align='center'
                          onClick={(e) => e.stopPropagation()}
                        >
                          {hasFlightsThisYear ? (
                            <Chip
                              label={member.billableFlightCount}
                              size='small'
                              color='error'
                              variant='filled'
                            />
                          ) : (
                            <Typography variant='body2' color='text.secondary'>
                              0
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell
                          align='right'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Stack
                            direction='row'
                            spacing={1}
                            justifyContent='flex-end'
                            alignItems='flex-start'
                          >
                            <Stack alignItems='center' spacing={0.25}>
                              <Button
                                size='small'
                                variant='outlined'
                                color='primary'
                                disabled={isBusy}
                                startIcon={
                                  isReminderLoading ? (
                                    <Icon icon='mdi:loading' className='spin' />
                                  ) : (
                                    <Icon icon='mdi:email-send-outline' />
                                  )
                                }
                                onClick={() => handleSendReminder(member)}
                              >
                                {lastReminderDate
                                  ? t(
                                      'member.nonRenewalsSendReminderAgain',
                                      'Send Reminder Again'
                                    )
                                  : t(
                                      'member.nonRenewalsSendReminder',
                                      'Send Reminder'
                                    )}
                              </Button>
                              {lastReminderDate && (
                                <Typography
                                  variant='caption'
                                  color='text.secondary'
                                >
                                  {t(
                                    'member.nonRenewalsReminderSentOn',
                                    'Sent: {{date}}',
                                    { date: lastReminderDate }
                                  )}
                                </Typography>
                              )}
                            </Stack>

                            <Tooltip
                              title={t(
                                'member.nonRenewalsRemoveDisabledFlights',
                                'Members with flights in the current year cannot be removed or have their membership cancelled'
                              )}
                              disableHoverListener={!hasFlightsThisYear}
                              disableFocusListener={!hasFlightsThisYear}
                              disableTouchListener={!hasFlightsThisYear}
                            >
                              <span>
                                <Button
                                  size='small'
                                  variant='outlined'
                                  color='error'
                                  disabled={isBusy || hasFlightsThisYear}
                                  startIcon={
                                    isRemoveLoading ? (
                                      <Icon
                                        icon='mdi:loading'
                                        className='spin'
                                      />
                                    ) : (
                                      <Icon icon='mdi:account-remove-outline' />
                                    )
                                  }
                                  onClick={() => handleRemoveMember(member)}
                                >
                                  {t(
                                    'member.nonRenewalsRemoveMember',
                                    'Remove'
                                  )}
                                </Button>
                              </span>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
