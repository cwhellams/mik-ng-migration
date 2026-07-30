import { Box, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Controller } from 'react-hook-form'
import { ButtonPicker } from '../components/ButtonPicker'
import type { WizardFormProps } from '../types'

const QUICK_LANDINGS = [1, 2, 3, 4, 5, 6]

export const LandingsStep = ({ control }: WizardFormProps) => {
  const { t } = useTranslation()

  return (
    <Controller
      name='numberOfLandings'
      control={control}
      render={({ field }) => (
        <Box>
          <ButtonPicker
            columns={3}
            options={QUICK_LANDINGS.map((n) => ({ value: n, label: String(n) }))}
            value={QUICK_LANDINGS.includes(field.value) ? field.value : null}
            onChange={field.onChange}
            overflow={{
              label: t('flightLog.wizard.landingsOverflow'),
              startActive: !!field.value && !QUICK_LANDINGS.includes(field.value),
              render: ({ onBack }) => (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    type='number'
                    autoFocus
                    label={t('flightLog.numberOfLandings')}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                    slotProps={{ htmlInput: { inputMode: 'numeric', min: 7, max: 50 } }}
                  />
                  <Box
                    component='button'
                    type='button'
                    onClick={onBack}
                    sx={{
                      background: 'none',
                      border: 'none',
                      color: 'primary.main',
                      cursor: 'pointer',
                      p: 1,
                    }}
                  >
                    {t('flightLog.wizard.backToQuickPick')}
                  </Box>
                </Box>
              ),
            }}
          />
        </Box>
      )}
    />
  )
}
