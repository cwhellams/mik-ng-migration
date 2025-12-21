import { IconButton, SxProps, Theme, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'

export const EditButton = ({
  title,
  onClick,
  icon = 'mdi:pencil',
  sx,
  width = 20,
  color = 'primary.main',
  viewOnly = false,
}: {
  title: string
  onClick?: () => void
  icon?: string
  sx?: SxProps<Theme>
  width?: number
  color?: string
  viewOnly?: boolean
}) => {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton
          size='small'
          aria-label={title}
          onClick={onClick}
          disabled={viewOnly}
          sx={{
            backgroundColor: 'background.paper',
            boxShadow: 0,
            '&:hover': { backgroundColor: 'background.default' },
            ...sx,
          }}
        >
          <Icon icon={icon} color={color} width={width} />
        </IconButton>
      </span>
    </Tooltip>
  )
}
