import { Alert, Badge, Box, Button, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'

export function DtoInstructorWidget() {
  const { data, isLoading, error } = useApi<{ count: number }>({
    url: 'v1/dto/instructor/pending/count',
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1,
        }}
      >
        <Icon icon='mdi:airplane-check' width={24} />
        <Typography
          variant='subtitle1'
          sx={{
            fontWeight: 600,
          }}
        >
          DTO Verification
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
            You have <strong>{count}</strong> flight{count !== 1 ? 's' : ''} awaiting verification.
          </Alert>
          <Button
            component={Link}
            to='/dto/verify'
            variant='contained'
            color='warning'
            size='small'
            startIcon={<Icon icon='mdi:clipboard-check' />}
          >
            Verify Flights
          </Button>
        </>
      ) : (
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
          }}
        >
          No flights awaiting verification.
        </Typography>
      )}
    </Box>
  )
}
