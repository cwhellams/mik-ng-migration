import { Typography, useMediaQuery, useTheme } from '@mui/material'
import { Stack } from '@mui/system'

export const Title = ({
  label,
  subtitle = false,
  children,
}: {
  label: string
  subtitle?: boolean
  children?: React.ReactNode
}) => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: !subtitle ? 3 : 0,
        width: '100%',
      }}
    >
      <Typography variant={subtitle ? 'h5' : isXs ? 'h4' : 'h2'} gutterBottom>
        {label}
      </Typography>
      {children}
    </Stack>
  )
}
