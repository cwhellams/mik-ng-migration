import { Box, Grid, Card, CardContent, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useMe } from '@mik/ui/hooks/useMe'
import { useRoles } from '@mik/ui/hooks/useRoles'

const StatCard = ({ title, icon, color }: { title: string; icon: string; color: string }) => (
  <Card>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon icon={icon} width={24} color={color} />
      </Box>
      <Typography variant='body1' sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
    </CardContent>
  </Card>
)

const Dashboard = () => {
  const { me } = useMe()
  const { permissions } = useRoles()

  return (
    <Box>
      <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
        Welcome back, {me?.firstName ?? 'Admin'}
      </Typography>
      <Typography variant='body1' color='text.secondary' sx={{ mb: 4 }}>
        MIK Admin Panel — manage club operations from here.
      </Typography>

      <Grid container spacing={3}>
        {permissions.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Typography variant='h6' sx={{ fontWeight: 600, mb: 1 }}>
              Quick access
            </Typography>
          </Grid>
        )}

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard title='Members' icon='mdi:account-group' color='#002385' />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard title='Aircraft' icon='mdi:airplane' color='#535bf2' />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard title='Accounting' icon='mdi:cash-multiple' color='#2e7d32' />
        </Grid>
      </Grid>

      <Box
        sx={{
          mt: 6,
          p: 3,
          bgcolor: 'background.paper',
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'divider',
        }}
      >
        <Typography variant='body1' color='text.secondary' sx={{ textAlign: 'center' }}>
          Admin sections are being migrated here progressively. More features coming soon.
        </Typography>
      </Box>
    </Box>
  )
}

export default Dashboard
