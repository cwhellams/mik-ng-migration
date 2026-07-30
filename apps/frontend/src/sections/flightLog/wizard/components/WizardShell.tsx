import { Box, Button, IconButton, LinearProgress, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface WizardShellProps {
  title: string
  stepIndex: number
  stepCount: number
  onBack?: () => void
  onClose: () => void
  onSwitchToClassicForm: () => void
  children: ReactNode
  footer: ReactNode
}

// Slim mobile-native chrome instead of a full MUI Stepper — a 13-step Stepper with
// labels won't fit on a phone screen. Rendered as a fixed full-viewport overlay
// (rather than sizing to 100dvh inside the page's normal flow) so the footer can't
// end up pushed below the fold by the site header/page padding that wraps the
// wizard's route — with minHeight:100dvh inside that flow, total page height was
// header + padding + 100dvh, leaving the Next button below the visible viewport on
// first paint. `position: fixed; inset: 0` makes this exactly viewport-sized
// regardless of surrounding layout, so header/content/footer always fit on screen.
export const WizardShell = ({
  title,
  stepIndex,
  stepCount,
  onBack,
  onClose,
  onSwitchToClassicForm,
  children,
  footer,
}: WizardShellProps) => {
  const { t } = useTranslation()

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.5 }}>
          <IconButton
            onClick={onClose}
            aria-label={t('common.close')}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon icon='mdi:close' />
          </IconButton>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
              {t('flightLog.wizard.stepCounter', { current: stepIndex + 1, total: stepCount })}
            </Typography>
          </Box>
          <Button
            size='small'
            onClick={onSwitchToClassicForm}
            sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 44 }}
          >
            {t('flightLog.wizard.useClassicForm')}
          </Button>
        </Box>
        <LinearProgress variant='determinate' value={((stepIndex + 1) / stepCount) * 100} />
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant='h6'>{title}</Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, px: 2, py: 2, overflowY: 'auto', minHeight: 0 }}>{children}</Box>

      <Box
        sx={{
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: 2,
          py: 1.5,
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          pb: 'calc(12px + env(safe-area-inset-bottom))',
        }}
      >
        {onBack && (
          <IconButton
            onClick={onBack}
            sx={{ minWidth: 44, minHeight: 44 }}
            aria-label={t('common.back')}
          >
            <Icon icon='mdi:arrow-left' />
          </IconButton>
        )}
        <Box sx={{ flex: 1 }}>{footer}</Box>
      </Box>
    </Box>
  )
}
