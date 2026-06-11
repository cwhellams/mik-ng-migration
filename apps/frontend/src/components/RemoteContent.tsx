import { Alert, Box, CircularProgress } from '@mui/material'
import { t } from 'i18next'
import { Problem } from '@backend/routes/response'
import { ReactNode } from 'react'

export const RemoteContent = ({
  isLoading,
  error,
  children,
}: {
  isLoading?: boolean
  error?: Problem | undefined
  children: ReactNode
}) => {
  if (error) {
    return (
      <Alert severity='error'>
        {error.status == 403 ? t('error.noAccess') : (error.detail ?? error.title)}
      </Alert>
    )
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {children}

      {isLoading && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <CircularProgress size={24} color='inherit' />
        </Box>
      )}
    </Box>
  )
}
