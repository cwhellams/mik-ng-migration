import { DialogTitle, Box, Typography, IconButton } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'

interface EditDialogProps {
  title?: string
  onClose: () => void
}

export const EditDialogTitle = ({ title, onClose }: EditDialogProps) => {
  const { t } = useTranslation()

  return (
    <DialogTitle>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant='h6'>{title && t(title)}</Typography>
        <IconButton onClick={onClose} aria-label='close'>
          <Icon icon='mdi:close' />
        </IconButton>
      </Box>
    </DialogTitle>
  )
}
