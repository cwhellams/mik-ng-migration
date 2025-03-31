import { Box, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { t } from 'i18next'
import { ReactNode } from 'react'

export const FormField = ({
  label,
  width,
  icon,
  children,
}: {
  label: string
  width?: number
  icon?: string
  children?: ReactNode
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center' }}>
    <Typography
      variant='body2'
      color='text.secondary'
      sx={{ width: width ?? 150 }}
    >
      {t(label)}:
    </Typography>
    {icon && <Icon icon={icon} />}
    <Typography variant='body1'>{children}</Typography>
  </Box>
)
