import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { MemberEditMode } from './EditMemberModal'
import { t } from 'i18next'

export const EditButton = ({
  mode,
  onClick,
  positionStatic,
  icon = 'mdi:pencil',
}: {
  mode: MemberEditMode
  onClick?: () => void
  positionStatic?: boolean
  icon?: string
}) => {
  const title = t(`member.edit.${mode}`)
  return (
    <Tooltip title={title}>
      <IconButton
        size='small'
        aria-label={title}
        onClick={onClick}
        sx={{
          position: positionStatic == true ? 'static' : 'absolute',
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
