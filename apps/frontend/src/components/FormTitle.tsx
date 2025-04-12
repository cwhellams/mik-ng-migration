import { Typography } from '@mui/material'
import { Icon } from '@iconify/react'

export const FormTitle = ({
  title,
  icon,
}: {
  title: string
  icon?: string
}) => (
  <Typography
    variant='h6'
    sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
  >
    {icon && <Icon icon={icon} style={{ marginRight: 8 }} />}
    {title}
  </Typography>
)
