import { Box, Typography, TextField, IconButton, Button, Stack } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'

interface ReportRemarksSectionProps {
  descriptions: string[]
  onChange: (descriptions: string[]) => void
  disabled?: boolean
}

// Mirrors ReportDefectsSection's "add a row per item, submit once the flight is saved"
// shape (#1226), but for informational remarks: no grounding consequence, so no
// warning note and no fleet manager contact block.
export const ReportRemarksSection = ({
  descriptions,
  onChange,
  disabled,
}: ReportRemarksSectionProps) => {
  const { t } = useTranslation()

  const updateAt = (index: number, value: string) => {
    const next = [...descriptions]
    next[index] = value
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(descriptions.filter((_, i) => i !== index))
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant='h6'>{t('flightLog.remarks.reportSectionTitle')}</Typography>
      <Typography variant='body2' sx={{ color: 'text.secondary' }}>
        {t('flightLog.remarks.reportSectionNote')}
      </Typography>

      {descriptions.map((description, index) => {
        const isBlank = description.length > 0 && description.trim().length === 0
        return (
          // The rows have no stable id until saved, so the index is the key.
          <Stack key={index} direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              value={description}
              onChange={(e) => updateAt(index, e.target.value)}
              label={t('flightLog.remarks.description')}
              error={isBlank}
              helperText={isBlank ? t('flightLog.remarks.blankDescriptionError') : undefined}
              disabled={disabled}
              multiline
              minRows={2}
              fullWidth
              autoFocus
            />
            <IconButton
              aria-label={t('general.delete')}
              onClick={() => removeAt(index)}
              disabled={disabled}
              sx={{ mt: 1 }}
            >
              <Icon icon='mdi:delete' width={20} />
            </IconButton>
          </Stack>
        )
      })}

      <Button
        variant='outlined'
        startIcon={<Icon icon='mdi:plus' width={18} />}
        onClick={() => onChange([...descriptions, ''])}
        disabled={disabled}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('flightLog.remarks.addRemarkRow')}
      </Button>
    </Box>
  )
}
