import { Typography, useMediaQuery, useTheme } from '@mui/material'
import { Stack } from '@mui/system'

export const Title = ({
  label,
  children,
}: {
  label: string
  children?: React.ReactNode
}) => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent='space-between'
      alignItems='center'
      mb={3}
    >
      <Typography variant={isXs ? 'h4' : 'h2'} gutterBottom>
        {label}
      </Typography>

      {children}
    </Stack>
  )
}
