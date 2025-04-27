import {
  Alert,
  Box,
  CircularProgress,
  TableCell,
  TableRow,
} from '@mui/material'
import { t } from 'i18next'
import { Problem } from '@backend/routes/response'
import { ReactNode } from 'react'

export const RemoteContent = ({
  isLoading,
  error,
  colSpan,
  children,
}: {
  isLoading?: boolean
  error?: Problem | undefined
  colSpan?: number
  children: ReactNode
}) => {
  if (!isLoading && !error) {
    return children
  }

  const content = error ? (
    <Alert severity='error'>
      {error.status == 403
        ? t('error.noAccess')
        : (error.detail ?? error.title)}
    </Alert>
  ) : (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100',
      }}
    >
      <CircularProgress size={24} color='inherit' />
    </Box>
  )

  if (!colSpan) {
    return content
  } else {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} height={150} align='center'>
          {content}
        </TableCell>
      </TableRow>
    )
  }
}
