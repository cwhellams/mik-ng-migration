import { Problem } from '@backend/routes/response'
import { Alert, Slide, Snackbar } from '@mui/material'
import { useState, useEffect } from 'react'

export const SnackAlert = ({ problem }: { problem?: Problem }) => {
  const [sbState, setSbState] = useState<boolean>(false)

  useEffect(() => {
    if (problem) {
      setSbState(true)
    }
  }, [problem])

  return (
    <Snackbar
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      open={sbState}
      autoHideDuration={3000}
      onClose={() => setSbState(false)}
      slots={{
        transition: Slide,
      }}
    >
      {problem?.status == 200 ? (
        <Alert severity='success'>
          {problem?.detail || problem?.title || 'Success'}
        </Alert>
      ) : (
        <Alert severity={'error'}>
          {problem?.detail || problem?.title || 'Error'}
        </Alert>
      )}
    </Snackbar>
  )
}
