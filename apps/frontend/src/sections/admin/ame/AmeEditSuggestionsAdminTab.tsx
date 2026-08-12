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
import { RemoteContent } from '../../../components/RemoteContent'
import useApi from '../../../hooks/useApi'
import type { AmeEditSuggestion, AmeEditSuggestionListResponse } from '@mik/contracts/ame'

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
}

const diffField = (label: string, current: unknown, proposed: unknown) => {
  const same = JSON.stringify(current) === JSON.stringify(proposed)
  return (
    <Typography
      key={label}
      variant='caption'
      component='div'
      color={same ? 'text.secondary' : 'warning.main'}
    >
      <strong>{label}:</strong>{' '}
      {same ? String(proposed) : `${String(current)} → ${String(proposed)}`}
    </Typography>
  )
}

export function AmeEditSuggestionsAdminTab() {
  const [statusFilter, setStatusFilter] = useState('SUBMITTED')
  const [rejectDialogEntry, setRejectDialogEntry] = useState<AmeEditSuggestion | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, error, mutate } = useApi<AmeEditSuggestionListResponse>({
    url: 'v1/ame/admin/edit-suggestions',
    params: { status: statusFilter || undefined, pageSize: 100 },
  })

  const { mutation } = useApi({ url: 'v1/ame/edit-suggestions', skipFetch: true })

  const handleApprove = async (suggestion: AmeEditSuggestion) => {
    setActionError(null)
    const result = await mutation.trigger('POST', undefined, `${suggestion.id}/approve`)
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
          <Typography color='text.secondary'>No edit suggestions found.</Typography>
        ) : (
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Proposed changes (current → proposed)</TableCell>
                <TableCell>Submitted By</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.entries.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    {diffField('Name', s.currentName, s.name)}
                    {diffField('Medical Centre', s.currentMedicalCentre, s.medicalCentre)}
                    {diffField('Location', s.currentLocation, s.location)}
                    {diffField('Price', s.currentPrice, s.price)}
                    {diffField('Types', s.currentMedicalTypes, s.medicalTypes)}
                    {diffField('Report Date', s.currentReportDate, s.reportDate)}
                    {diffField('Notes', s.currentNotes, s.notes)}
                  </TableCell>
                  <TableCell>{s.submittedByName ?? s.submittedBy}</TableCell>
                  <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={s.status}
                      size='small'
                      color={STATUS_COLOR[s.status] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {s.status === 'SUBMITTED' && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size='small'
                          variant='contained'
                          color='success'
                          startIcon={<Icon icon='mdi:check' />}
                          onClick={() => handleApprove(s)}
                        >
                          Approve
                        </Button>
                        <Button
                          size='small'
                          variant='outlined'
                          color='error'
                          startIcon={<Icon icon='mdi:close' />}
                          onClick={() => {
                            setRejectDialogEntry(s)
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
        <DialogTitle>Reject edit suggestion</DialogTitle>
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
