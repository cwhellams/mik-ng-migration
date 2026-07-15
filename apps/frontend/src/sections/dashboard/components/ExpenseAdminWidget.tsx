import { Alert, Badge, Box, Button, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'
import useApi from '../../../hooks/useApi'

export function ExpenseAdminWidget() {
  const { data, isLoading, error } = useApi<{ count: number }>({
    url: 'v1/expenses/admin/pending/count',
  })

  if (isLoading) return null
  if (error) return null

  const count = data?.count ?? 0

  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: count > 0 ? 'warning.main' : 'divider',
        borderRadius: 2,
        mb: 2,
      }}
    >
      <Box display='flex' alignItems='center' gap={1} mb={1}>
        <Icon icon='mdi:receipt-text-check' width={24} />
        <Typography variant='subtitle1' fontWeight={600}>
          Expense Claims
        </Typography>
        {count > 0 && (
          <Badge badgeContent={count} color='warning'>
            <span />
          </Badge>
        )}
      </Box>
      {count > 0 ? (
        <>
          <Alert severity='warning' sx={{ mb: 1 }}>
            There {count !== 1 ? 'are' : 'is'} <strong>{count}</strong> expense claim
            {count !== 1 ? 's' : ''} awaiting review.
          </Alert>
          <Button
            component={Link}
            to='/accounting/expenses'
            variant='contained'
            color='warning'
            size='small'
            startIcon={<Icon icon='mdi:clipboard-check' />}
          >
            Review Claims
          </Button>
        </>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          No expense claims awaiting review.
        </Typography>
      )}
    </Box>
  )
}
