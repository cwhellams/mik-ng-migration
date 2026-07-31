import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { Title } from '../../../components/Title'
import { RemoteContent } from '../../../components/RemoteContent'
import useApi from '../../../hooks/useApi'
import type { AmeListResponse, AmeEntry } from '@backend/routes/ame/models'

const MEDICAL_TYPE_LABELS: Record<string, string> = {
  EASA_CLASS_1: 'EASA Class 1',
  EASA_CLASS_2: 'EASA Class 2',
  LAPL: 'LAPL',
  FAA: 'FAA',
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
}

export default function AmeAdminList() {
  const [statusFilter, setStatusFilter] = useState('SUBMITTED')
  const [rejectDialogEntry, setRejectDialogEntry] = useState<AmeEntry | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, error, mutate } = useApi<AmeListResponse>({
    url: 'v1/ame/admin/all',
    params: { status: statusFilter || undefined, pageSize: 100 },
  })

  const { mutation } = useApi({ url: 'v1/ame', skipFetch: true })

  const handleApprove = async (entry: AmeEntry) => {
    setActionError(null)
    const result = await mutation.trigger('POST', undefined, `${entry.id}/approve`)
    if (result.error) {
      setActionError(result.error.detail ?? 'Approval failed')
    } else {
      mutate()
    }
  }

  const handleReject = async () => {
    if (!rejectDialogEntry) return
    setActionError(null)
    const result = await mutation.trigger(
      'POST',
      { reason: rejectReason },
      `${rejectDialogEntry.id}/reject`,
    )
    if (result.error) {
      setActionError(result.error.detail ?? 'Rejection failed')
    } else {
      setRejectDialogEntry(null)
      setRejectReason('')
      mutate()
    }
  }

  return (
    <Box>
      <Title label='AME Approvals' />

      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label='Status'
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value=''>All</MenuItem>
            <MenuItem value='SUBMITTED'>Pending</MenuItem>
            <MenuItem value='APPROVED'>Approved</MenuItem>
            <MenuItem value='REJECTED'>Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {actionError && (
        <Alert severity='error' sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      <RemoteContent isLoading={isLoading} error={error}>
        {data?.entries.length === 0 ? (
          <Typography color='text.secondary'>No entries found.</Typography>
        ) : (
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Medical Centre</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Types</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Report Date</TableCell>
                <TableCell>Submitted By</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.entries.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{entry.name}</Typography>
                    {entry.notes && (
                      <Typography variant='caption' color='text.secondary'>
                        {entry.notes}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{entry.medicalCentre}</TableCell>
                  <TableCell>{entry.location}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {entry.medicalTypes.map((mt) => (
                        <Chip
                          key={mt}
                          label={MEDICAL_TYPE_LABELS[mt] ?? mt}
                          size='small'
                          variant='outlined'
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{entry.price != null ? `€${entry.price.toFixed(0)}` : '—'}</TableCell>
                  <TableCell>{entry.reportDate}</TableCell>
                  <TableCell>{entry.submittedByName ?? entry.submittedBy}</TableCell>
                  <TableCell>
                    <Chip
                      label={entry.status}
                      size='small'
                      color={STATUS_COLOR[entry.status] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {entry.status === 'SUBMITTED' && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size='small'
                          variant='contained'
                          color='success'
                          startIcon={<Icon icon='mdi:check' />}
                          onClick={() => handleApprove(entry)}
                        >
                          Approve
                        </Button>
                        <Button
                          size='small'
                          variant='outlined'
                          color='error'
                          startIcon={<Icon icon='mdi:close' />}
                          onClick={() => {
                            setRejectDialogEntry(entry)
                            setRejectReason('')
                          }}
                        >
                          Reject
                        </Button>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </RemoteContent>

      <Dialog
        open={!!rejectDialogEntry}
        onClose={() => setRejectDialogEntry(null)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Reject AME Entry</DialogTitle>
        <DialogContent>
          <TextField
            label='Reason for rejection'
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogEntry(null)}>Cancel</Button>
          <Button
            color='error'
            variant='contained'
            disabled={!rejectReason.trim()}
            onClick={handleReject}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
