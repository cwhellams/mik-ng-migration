import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'
import { useState } from 'react'
import useApi from '../../hooks/useApi'
import type { AmeEntry } from '@backend/routes/ame/models'

export function AmeRemovalRequestDialog({
  entry,
  onClose,
  onSubmitted,
}: {
  entry: AmeEntry | null
  onClose: () => void
  onSubmitted: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { mutation } = useApi({ url: 'v1/ame', skipFetch: true })

  const handleSubmit = async () => {
    if (!entry) return
    setError(null)
    const result = await mutation.trigger('POST', { reason }, `${entry.id}/removal-request`)
    if (result.error) {
      setError(result.error.detail ?? 'Submission failed. Please try again.')
    } else {
      setReason('')
      onSubmitted()
    }
  }

  return (
    <Dialog open={!!entry} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Request removal of {entry?.name}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label='Reason for removal'
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          rows={3}
          fullWidth
          required
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color='error'
          variant='contained'
          disabled={!reason.trim() || mutation.isMutating}
          onClick={handleSubmit}
        >
          Submit request
        </Button>
      </DialogActions>
    </Dialog>
  )
}
