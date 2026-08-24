import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useState } from 'react'

export default function PublishSyllabusDialog({
  open,
  onClose,
  onConfirm,
}: Readonly<{
  open: boolean
  onClose: () => void
  onConfirm: (approvalReference: string | null) => void | Promise<void>
}>) {
  const [reference, setReference] = useState('')

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Publish Syllabus</DialogTitle>
      <DialogContent>
        <TextField
          label='Approval reference (optional)'
          helperText='Authority approval letter number / notes — recorded permanently on this version'
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          fullWidth
          multiline
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          color='success'
          onClick={() => onConfirm(reference.trim() || null)}
        >
          Publish
        </Button>
      </DialogActions>
    </Dialog>
  )
}
