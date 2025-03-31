import { Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { t } from 'i18next'

export const FormTitle = ({ title, icon }: { title: string; icon: string }) => (
  <Typography
    variant='h6'
    sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
  >
    <Icon icon={icon} style={{ marginRight: 8 }} />
    {t(title)}
  </Typography>
)
