import { Box, type SxProps, type Theme, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import type { ReactNode } from 'react'

export const FormField = ({
  label,
  width,
  icon,
  children,
  sx,
}: {
  label: string
  width?: number
  icon?: string
  children?: ReactNode
  sx?: SxProps<Theme>
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', ...sx }}>
    <Typography
      variant='body2'
      sx={{
        color: 'text.secondary',
        width: width ?? 150,
      }}
    >
      {label}:
    </Typography>
    {icon && <Icon icon={icon} />}
    {children}
  </Box>
)
