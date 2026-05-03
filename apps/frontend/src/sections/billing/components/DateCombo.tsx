import React from 'react'
import { Typography, Box } from '@mui/material'
import { t } from 'i18next'
import { useTimezone } from '../../../hooks/useTimezone'

interface InvoiceDatesCellProps {
  sentAt: string | Date | null
  dueAt: string | Date
  isPastDue: boolean
}

export const InvoiceDatesCell: React.FC<InvoiceDatesCellProps> = ({
  sentAt,
  dueAt,
  isPastDue,
}) => {
  const dueDate = new Date(dueAt)
  const { formatDate } = useTimezone()

  return (
    <Box display='flex' flexDirection='column' gap={0.5}>
      <Typography
        variant='subtitle2'
        fontWeight='bold'
        color={isPastDue ? 'error.main' : 'text.primary'}
      >
        {t('invoiceItems.dates.due')} {formatDate(dueDate)}
      </Typography>
      {sentAt ? (
        <Typography variant='body2' color='text.secondary'>
          {t('invoiceItems.dates.sent')} {formatDate(sentAt)}
        </Typography>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          {t('invoiceItems.dates.notSent', '—')}
        </Typography>
      )}
    </Box>
  )
}
