import { Box, Typography, ToggleButton, ToggleButtonGroup, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Controller } from 'react-hook-form'
import { NumericTimeEntry } from '../components/NumericTimeEntry'
import { ButtonPicker } from '../components/ButtonPicker'
import type { WizardFormProps } from '../types'

const QUICK_NIGHT_LANDINGS = [0, 1, 2, 3, 4, 5, 6]

interface Props extends WizardFormProps {
  nightOrIfr: boolean | null
  onNightOrIfrChange: (value: boolean) => void
}

// Minutes<->HH:MM helpers for the duration fields — these are plain durations (not
// clock times), so unlike TimeStep there's no cross-midnight/reference-epoch chaining.
const minsToHM = (mins: number | null | undefined) => {
  const total = mins ?? 0
  return { hour: Math.floor(total / 60), minute: total % 60 }
}

export const NightIfrStep = ({ control, setValue, nightOrIfr, onNightOrIfrChange }: Props) => {
  const { t } = useTranslation()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <Typography variant='body2' sx={{ color: 'text.secondary', textAlign: 'center' }}>
        {t('flightLog.wizard.question.nightOrIfr')}
      </Typography>
      <ToggleButtonGroup
        exclusive
        value={nightOrIfr === null ? null : nightOrIfr ? 'yes' : 'no'}
        onChange={(_, v) => {
          if (v === null) return
          const value = v === 'yes'
          onNightOrIfrChange(value)
          if (!value) {
            setValue('nightFlyingMins', 0)
            setValue('numberOfNightLandings', 0)
            setValue('instrumentFlyingMins', 0)
          }
        }}
        size='large'
      >
        <ToggleButton value='yes' sx={{ minWidth: 120, minHeight: 56 }}>
          {t('common.yes')}
        </ToggleButton>
        <ToggleButton value='no' sx={{ minWidth: 120, minHeight: 56 }}>
          {t('common.no')}
        </ToggleButton>
      </ToggleButtonGroup>

      {nightOrIfr && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant='body2' sx={{ color: 'text.secondary', mb: 0.5 }}>
              {t('flightLog.nightFlyingMins')}
            </Typography>
            <Controller
              name='nightFlyingMins'
              control={control}
              render={({ field }) => {
                const { hour, minute } = minsToHM(field.value)
                return (
                  <NumericTimeEntry
                    hour={field.value != null ? hour : null}
                    minute={field.value != null ? minute : null}
                    onChange={(h, m) => field.onChange(h * 60 + m)}
                  />
                )
              }}
            />
          </Box>

          <Box>
            <Typography
              variant='body2'
              sx={{ color: 'text.secondary', mb: 0.5, textAlign: 'center' }}
            >
              {t('flightLog.numberOfNightLandings')}
            </Typography>
            <Controller
              name='numberOfNightLandings'
              control={control}
              render={({ field }) => (
                <ButtonPicker
                  columns={4}
                  options={QUICK_NIGHT_LANDINGS.map((n) => ({ value: n, label: String(n) }))}
                  value={QUICK_NIGHT_LANDINGS.includes(field.value) ? field.value : null}
                  onChange={field.onChange}
                  overflow={{
                    label: t('flightLog.wizard.landingsOverflow'),
                    startActive: field.value != null && !QUICK_NIGHT_LANDINGS.includes(field.value),
                    render: ({ onBack }) => (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <TextField
                          type='number'
                          autoFocus
                          label={t('flightLog.numberOfNightLandings')}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value ? Number(e.target.value) : 0)
                          }
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
              )}
            />
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant='body2' sx={{ color: 'text.secondary', mb: 0.5 }}>
              {t('flightLog.instrumentFlyingMins')}
            </Typography>
            <Controller
              name='instrumentFlyingMins'
              control={control}
              render={({ field }) => {
                const { hour, minute } = minsToHM(field.value)
                return (
                  <NumericTimeEntry
                    hour={field.value != null ? hour : null}
                    minute={field.value != null ? minute : null}
                    onChange={(h, m) => field.onChange(h * 60 + m)}
                  />
                )
              }}
            />
          </Box>
        </Box>
      )}
    </Box>
  )
}
