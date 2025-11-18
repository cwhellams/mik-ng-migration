import React from 'react'
import { Typography, Box } from '@mui/material'
import { t } from 'i18next'

interface InvoiceDatesCellProps {
  sentAt: string | Date
  dueAt: string | Date
  isPastDue: boolean
  dateFormatter: Intl.DateTimeFormat
}

export const InvoiceDatesCell: React.FC<InvoiceDatesCellProps> = ({
  sentAt,
  dueAt,
  isPastDue,
  dateFormatter,
}) => {
  const dueDate = new Date(dueAt)
  const sentDate = sentAt ? new Date(sentAt) : new Date()

  return (
    <Box display='flex' flexDirection='column' gap={0.5}>
      <Typography
        variant='subtitle2'
        fontWeight='bold'
        color={isPastDue ? 'error.main' : 'text.primary'}
      >
        {t('invoiceItems.dates.due')} {dateFormatter.format(dueDate)}
      </Typography>
      <Typography variant='body2' color='text.secondary'>
        {t('invoiceItems.dates.sent')} {dateFormatter.format(sentDate)}
      </Typography>
    </Box>
  )
}
