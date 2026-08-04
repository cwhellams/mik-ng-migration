import { Alert, Badge, Box, Button, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import useApi from '../../../hooks/useApi'

export function AmeAdminWidget() {
  const { data, isLoading, error } = useApi<{ count: number }>({
    url: 'v1/ame/admin/pending/count',
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Icon icon='mdi:stethoscope' width={24} />
        <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
          AME Directory
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
            There {count !== 1 ? 'are' : 'is'} <strong>{count}</strong> AME submission
            {count !== 1 ? 's' : ''} awaiting review.
          </Alert>
          <Button
            component={Link}
            to='/admin/ame'
            variant='contained'
            color='warning'
            size='small'
            startIcon={<Icon icon='mdi:clipboard-check' />}
          >
            Review Submissions
          </Button>
        </>
      ) : (
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          No AME submissions awaiting review.
        </Typography>
      )}
    </Box>
  )
}
