import { IconButton, SxProps, Theme, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'

export const EditButton = ({
  title,
  onClick,
  icon = 'mdi:pencil',
  sx,
}: {
  title: string
  onClick?: () => void
  icon?: string
  sx?: SxProps<Theme>
}) => {
  return (
    <Tooltip title={title}>
      <IconButton
        size='small'
        aria-label={title}
        onClick={onClick}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: 'background.paper',
          boxShadow: 0,
          '&:hover': { backgroundColor: 'background.default' },
          ...sx,
        }}
      >
        <Icon icon={icon} width={18} />
      </IconButton>
    </Tooltip>
  )
}
