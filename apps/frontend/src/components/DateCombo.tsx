import React from 'react'
import { TableCell, Typography, Box } from '@mui/material'

interface InvoiceDatesCellProps {
  sentAt: string | Date
  dueAt: string | Date
  isPastDue: boolean
  dateFormatter: Intl.DateTimeFormat
}

const InvoiceDatesCell: React.FC<InvoiceDatesCellProps> = ({
  sentAt,
  dueAt,
  isPastDue,
  dateFormatter,
}) => {
  const dueDate = new Date(dueAt)
  const sentDate = new Date(sentAt)

  return (
    <TableCell>
      <Box display='flex' flexDirection='column' gap={0.5}>
        <Typography
          variant='subtitle2'
          fontWeight='bold'
          color={isPastDue ? 'error.main' : 'text.primary'}
        >
          Due: {dateFormatter.format(dueDate)}
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Sent: {dateFormatter.format(sentDate)}
        </Typography>
      </Box>
    </TableCell>
  )
}

export default InvoiceDatesCell
