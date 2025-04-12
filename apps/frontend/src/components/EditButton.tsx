import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'

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
  return (
    <Tooltip title={title}>
      <IconButton
        size='small'
        aria-label={title}
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
