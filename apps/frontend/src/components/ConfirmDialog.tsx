import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  useTheme,
} from '@mui/material'
import { Icon } from '@iconify/react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText: string
  cancelText: string
  severity?: 'error' | 'warning' | 'info'
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  severity = 'warning',
}) => {
  const theme = useTheme()

  const getColor = () => {
    switch (severity) {
      case 'error':
        return theme.palette.error.main
      case 'warning':
        return theme.palette.warning.main
      case 'info':
        return theme.palette.info.main
      default:
        return theme.palette.warning.main
    }
  }

  const getIcon = () => {
    switch (severity) {
      case 'error':
        return 'mdi:alert-circle'
      case 'warning':
        return 'mdi:alert'
      case 'info':
        return 'mdi:information'
      default:
        return 'mdi:alert'
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: getColor(),
        }}
      >
        <Icon icon={getIcon()} width={24} height={24} />
        {title}
      </DialogTitle>

      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant='outlined'>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          variant='contained'
          color={severity}
          autoFocus
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
