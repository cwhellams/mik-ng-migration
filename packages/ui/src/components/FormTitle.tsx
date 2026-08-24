import { type SxProps, type Theme, Typography } from '@mui/material'
import { Icon } from '@iconify/react'

export const FormTitle = ({
  title,
  icon,
  sx,
}: {
  title: string
  icon?: string
  sx?: SxProps<Theme>
}) => (
  <Typography variant='h6' sx={{ mb: 2, display: 'flex', alignItems: 'center', ...sx }}>
    {icon && <Icon icon={icon} style={{ marginRight: 8 }} />}
    {title}
  </Typography>
)
