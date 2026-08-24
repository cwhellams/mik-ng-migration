import React, { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  useMediaQuery,
  useTheme,
  Autocomplete,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { SaveButton } from '../../../components/SaveButton'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { mutate } from 'swr'
import dayjs, { Dayjs } from 'dayjs'
import type { Navdata, NavdataListResponse } from '@mik/contracts/aircraft-navdata'
import type { MemberListResponse } from '@mik/contracts/members'
import type { Problem } from '@mik/contracts/problem'
import { endpoints } from '../../../api/endpoints'

interface NavdataSectionProps {
  aircraftRegistration: string
  isAdmin: boolean
}

const useNavdata = (aircraftRegistration: string) => {
  const params = useMemo(
    () => ({
      aircraftRegistration,
      limit: '100',
      offset: '0',
    }),
    [aircraftRegistration],
  )

  const { isLoading, data, error } = useApi<NavdataListResponse>({
    url: 'v1/aircraft-navdata',
    method: 'GET',
    params,
  })

  return {
    records: data?.records || [],
    total: data?.total || 0,
    isLoading,
    error,
  }
}

const NAVDATA_EXPIRING_THRESHOLD_DAYS = 5

export const getNavdataStatus = (
  expires?: string | null,
): 'expired' | 'expiring' | 'valid' | 'unknown' => {
  if (!expires) return 'unknown'
  const today = dayjs().startOf('day')
  const expiryDate = dayjs(expires)
  if (expiryDate.isBefore(today, 'day')) return 'expired'
  if (expiryDate.diff(today, 'day') <= NAVDATA_EXPIRING_THRESHOLD_DAYS) return 'expiring'
  return 'valid'
}

export const NavdataStatusChip = ({ expires }: { expires?: string | null }) => {
  const { t } = useTranslation()

  if (!expires) {
    return (
      <Chip
        label={t('aircraft.navdata.status.unknown', 'Unknown')}
        color='default'
        size='small'
        variant='outlined'
      />
    )
  }

  const status = getNavdataStatus(expires)
  const colorMap: Record<string, 'error' | 'warning' | 'success'> = {
    expired: 'error',
    expiring: 'warning',
    valid: 'success',
  }
  const labelMap: Record<string, string> = {
    expired: t('aircraft.navdata.status.expired', 'Expired'),
    expiring: t('aircraft.navdata.status.expiring', 'Expires Soon'),
    valid: t('aircraft.navdata.status.valid', 'Valid'),
  }

  return (
    <Chip
      label={`${labelMap[status]} ${expires}`}
      color={colorMap[status]}
      size='small'
      variant='outlined'
    />
  )
}

export const NavdataInfoStatus = ({ aircraftRegistration }: { aircraftRegistration: string }) => {
  const { t } = useTranslation()
  const params = useMemo(
    () => ({ aircraftRegistration, limit: '1', offset: '0' }),
    [aircraftRegistration],
  )
  const { data } = useApi<NavdataListResponse>({
    url: 'v1/aircraft-navdata',
    method: 'GET',
    params,
  })
  const latest = data?.records?.[0]

  return (
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
          color: 'text.secondary',
        }}
      >
        {t('aircraft.navdata.navdataLabel', 'Navdata:')}
      </Typography>
      <NavdataStatusChip expires={latest?.expires} />
    </Stack>
  )
}

interface AddNavdataModalProps {
  open: boolean
  aircraftRegistration: string
  onClose: () => void
}

const AddNavdataModal = ({ open, aircraftRegistration, onClose }: AddNavdataModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const { data: membersData } = useApi<MemberListResponse>({
    url: endpoints.members.root,
    skipFetch: !open,
  })

  const api = useApi<Navdata>({ url: 'v1/aircraft-navdata', skipFetch: true })

  const [updaterMemberId, setUpdaterMemberId] = useState<string>('')
  const [updateDate, setUpdateDate] = useState<Dayjs | null>(dayjs())
  const [cycle, setCycle] = useState<string>('')
  const [expires, setExpires] = useState<Dayjs | null>(null)
  const [problem, setProblem] = useState<Problem | undefined>()

  const members = membersData?.members ?? []

  const selectedMember = members.find((m) => m.memberId === updaterMemberId) ?? null

  const handleClose = () => {
    setUpdaterMemberId('')
    setUpdateDate(dayjs())
    setCycle('')
    setExpires(null)
    setProblem(undefined)
    onClose()
  }

  const handleSave = async () => {
    if (!updaterMemberId) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.navdata.updaterRequired', 'Updater is required'),
        status: 400,
      })
      return
    }
    if (!updateDate?.isValid()) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.navdata.updateDateRequired', 'Update date is required'),
        status: 400,
      })
      return
    }
    if (!cycle.trim()) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.navdata.cycleRequired', 'Cycle is required'),
        status: 400,
      })
      return
    }
    if (!expires?.isValid()) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.navdata.expiresRequired', 'Expiry date is required'),
        status: 400,
      })
      return
    }

    setProblem(undefined)

    const { error } = await api.mutation.trigger('POST', {
      aircraftRegistration,
      updaterMemberId,
      updateDate: updateDate.format('YYYY-MM-DD'),
      cycle: cycle.trim(),
      expires: expires.format('YYYY-MM-DD'),
    })

    if (error) {
      setProblem(error)
      return
    }

    await mutate(
      (key: unknown) =>
        Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-navdata'),
    )
    handleClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth fullScreen={isXs}>
      <EditDialogTitle
        title={t('aircraft.navdata.add', 'Add Navdata Update')}
        onClose={handleClose}
      />
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <SnackAlert problem={problem} />

          <Autocomplete
            options={members}
            getOptionLabel={(m) => `${m.first} ${m.last}`}
            value={selectedMember}
            onChange={(_, val) => setUpdaterMemberId(val?.memberId ?? '')}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('aircraft.navdata.updater', 'Updated By')}
                required
                helperText={t(
                  'aircraft.navdata.updaterHelp',
                  'Member who performed the navdata update',
                )}
              />
            )}
          />

          <DatePicker
            label={t('aircraft.navdata.updateDate', 'Update Date')}
            value={updateDate}
            onChange={(v) => setUpdateDate(v)}
            slotProps={{ textField: { fullWidth: true, required: true } }}
          />

          <TextField
            label={t('aircraft.navdata.cycle', 'Cycle')}
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            required
            fullWidth
            helperText={t('aircraft.navdata.cycleHelp', 'E.g. 2604')}
          />

          <DatePicker
            label={t('aircraft.navdata.expires', 'Expires')}
            value={expires}
            onChange={(v) => setExpires(v)}
            slotProps={{ textField: { fullWidth: true, required: true } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t('general.cancel', 'Cancel')}</Button>
        <SaveButton onClick={handleSave} disabled={api.mutation.isMutating} />
      </DialogActions>
    </Dialog>
  )
}

export const NavdataSection: React.FC<NavdataSectionProps> = ({
  aircraftRegistration,
  isAdmin,
}) => {
  const { t } = useTranslation()
  const { records, isLoading, error } = useNavdata(aircraftRegistration)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<Navdata | undefined>()

  const deleteApi = useApi({ url: 'v1/aircraft-navdata', skipFetch: true })

  const handleDeleteConfirm = (record: Navdata) => {
    setRecordToDelete(record)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    await deleteApi.mutation.trigger('DELETE', undefined, `${recordToDelete.navdataId}`)
    setDeleteConfirmOpen(false)
    setRecordToDelete(undefined)
    await mutate(
      (key: unknown) =>
        Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-navdata'),
    )
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Stack
        direction='row'
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Typography
          variant='subtitle1'
          sx={{
            color: 'text.primary',
          }}
        >
          {t('aircraft.navdata.title', 'Navdata')}
        </Typography>
        {isAdmin && (
          <Tooltip title={t('aircraft.navdata.add', 'Add Navdata Update')}>
            <IconButton size='small' color='primary' onClick={() => setAddModalOpen(true)}>
              <Icon icon='mdi:plus-circle' />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <RemoteContent isLoading={isLoading} error={error}>
        {records.length === 0 ? (
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('aircraft.navdata.noRecords', 'No navdata records')}
          </Typography>
        ) : (
          <TableContainer component={Paper} variant='outlined'>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('aircraft.navdata.updater', 'Updated By')}</TableCell>
                  <TableCell>{t('aircraft.navdata.updateDate', 'Update Date')}</TableCell>
                  <TableCell>{t('aircraft.navdata.cycle', 'Cycle')}</TableCell>
                  <TableCell>{t('aircraft.navdata.expires', 'Expires')}</TableCell>
                  <TableCell>{t('aircraft.navdata.status.label', 'Status')}</TableCell>
                  {isAdmin && (
                    <TableCell align='right'>{t('aircraft.cards.actions', 'Actions')}</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.navdataId} hover>
                    <TableCell>
                      <Typography variant='body2'>{record.updaterName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{record.updateDate}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant='body2'
                        sx={{
                          fontWeight: 'medium',
                        }}
                      >
                        {record.cycle}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{record.expires}</Typography>
                    </TableCell>
                    <TableCell>
                      <NavdataStatusChip expires={record.expires} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell align='right'>
                        <Tooltip title={t('general.delete', 'Delete')}>
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => handleDeleteConfirm(record)}
                          >
                            <Icon icon='mdi:delete' />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </RemoteContent>
      <AddNavdataModal
        open={addModalOpen}
        aircraftRegistration={aircraftRegistration}
        onClose={() => setAddModalOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('aircraft.navdata.delete.title', 'Delete Navdata Record')}
        message={t(
          'aircraft.navdata.delete.confirm',
          'Are you sure you want to delete this navdata record?',
        )}
        confirmText={t('general.delete', 'Delete')}
        cancelText={t('general.cancel', 'Cancel')}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setRecordToDelete(undefined)
        }}
        severity='error'
      />
    </Box>
  )
}
