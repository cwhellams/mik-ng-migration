import { Box, Typography, TextField, IconButton, Button, Alert, Stack } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'

interface ReportDefectsSectionProps {
  descriptions: string[]
  onChange: (descriptions: string[]) => void
  disabled?: boolean
}

// Lets a pilot report any defects found on this flight as part of saving the logbook
// entry itself, instead of the old separate "Add in-flight defect" button on the
// logbook view. Each non-blank row becomes its own in-flight defect once the flight
// log entry is saved (see reportDefectsApi.submitReportedDefects).
export const ReportDefectsSection = ({
  descriptions,
  onChange,
  disabled,
}: ReportDefectsSectionProps) => {
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
      <Typography variant='h6'>{t('flightLog.defects.reportSectionTitle')}</Typography>
      <Alert severity='warning'>{t('flightLog.defects.reportSectionNote')}</Alert>

      {descriptions.map((description, index) => {
        const isBlank = description.length > 0 && description.trim().length === 0
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Stack key={index} direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              value={description}
              onChange={(e) => updateAt(index, e.target.value)}
              label={t('flightLog.defects.description')}
              error={isBlank}
              helperText={isBlank ? t('flightLog.defects.blankDescriptionError') : undefined}
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
        {t('flightLog.defects.addDefectRow')}
      </Button>
    </Box>
  )
}
