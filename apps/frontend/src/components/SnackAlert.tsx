import { Problem } from '@mik/contracts/problem'
import { Alert, Slide, Snackbar } from '@mui/material'
import { useState, useEffect } from 'react'

export const SnackAlert = ({ problem }: { problem?: Problem }) => {
  const [sbState, setSbState] = useState<boolean>(false)

  // copy the problem so it's not lost when the prop changes
  const [sbProblem, setSbProblem] = useState<Problem | undefined>(undefined)

  useEffect(() => {
    if (problem) {
      setSbProblem(problem)
      setSbState(true)
    }
  }, [problem])

  if (!sbProblem) {
    return <></>
  }

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
      {sbProblem?.status == 200 ? (
        <Alert severity='success'>{sbProblem?.detail || sbProblem?.title || 'Success'}</Alert>
      ) : (
        <Alert severity={'error'}>{sbProblem?.detail || sbProblem?.title || 'Error'}</Alert>
      )}
    </Snackbar>
  )
}
