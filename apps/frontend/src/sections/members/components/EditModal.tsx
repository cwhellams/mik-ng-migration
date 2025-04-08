import { ReactNode } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'

interface EditModalProps {
  title?: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export const EditModal = ({
  title,
  open,
  onClose,
  children,
}: EditModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
    >
      <DialogTitle>
        <Box display='flex' alignItems='center' justifyContent='space-between'>
          <Typography variant='h6'>{title && t(title)}</Typography>
          <IconButton onClick={onClose} aria-label='close'>
            <Icon icon='mdi:close' />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>{children}</DialogContent>
    </Dialog>
  )
}
