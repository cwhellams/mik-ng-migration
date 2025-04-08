import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { t } from 'i18next'

export const EditButton = ({
  title,
  onClick,
  position = 'absolute',
  icon = 'mdi:pencil',
}: {
  title: string
  onClick?: () => void
  position?: 'absolute' | 'static'
  icon?: string
}) => {
  const translated = t(title)
  return (
    <Tooltip title={translated}>
      <IconButton
        size='small'
        aria-label={translated}
        onClick={onClick}
        sx={{
          position,
          top: 8,
          right: 8,
          backgroundColor: 'background.paper',
          boxShadow: 0,
          '&:hover': { backgroundColor: 'background.default' },
        }}
      >
        <Icon icon={icon} width={18} />
      </IconButton>
    </Tooltip>
  )
}
