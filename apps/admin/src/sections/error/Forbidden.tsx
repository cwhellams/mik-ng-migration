import { Box, Typography, Button } from '@mui/material'
import { useNavigate } from 'react-router'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { ALL_ADMIN_PERMISSIONS } from '../../config/navItems'
import { memberBase } from '../../components/MemberAppLink'

const Forbidden = () => {
  const navigate = useNavigate()
  const { hasAccess } = useRoles()

  // The dashboard is gated the same as everything else here (see AppRoutes.tsx),
  // so "back to dashboard" is not always a safe CTA: a member holding none of
  // ALL_ADMIN_PERMISSIONS would just land on another Forbidden. Send those
  // members back across the app boundary instead, to somewhere they actually
  // have access.
  const hasAnyAdminAccess = hasAccess(...ALL_ADMIN_PERMISSIONS)

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        textAlign: 'center',
      }}
    >
      <Typography variant='h1' sx={{ fontSize: '6rem', fontWeight: 700, color: 'text.disabled' }}>
        403
      </Typography>
      <Typography variant='h5' sx={{ fontWeight: 600 }}>
        Access denied
      </Typography>
      <Typography variant='body1' color='text.secondary'>
        {hasAnyAdminAccess
          ? 'You do not have permission to view this page.'
          : 'Your account does not have access to the admin area.'}
      </Typography>
      {hasAnyAdminAccess ? (
        <Button
          variant='contained'
          onClick={() => navigate('/dashboard')}
          sx={{ mt: 2, borderRadius: 2, textTransform: 'none' }}
        >
          Back to dashboard
        </Button>
      ) : (
        <Button
          variant='contained'
          href={memberBase()}
          sx={{ mt: 2, borderRadius: 2, textTransform: 'none' }}
        >
          Back to member site
        </Button>
      )}
    </Box>
  )
}

export default Forbidden
