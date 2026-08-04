import { useRef } from 'react'
import { Box, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Controller } from 'react-hook-form'
import { ButtonPicker } from '../components/ButtonPicker'
import type { WizardFormProps } from '../types'

const QUICK_OIL = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]

interface Props extends WizardFormProps {
  oilAdded: boolean | null
  onOilAddedChange: (value: boolean) => void
}

export const OilStep = ({ control, setValue, getValues, oilAdded, onOilAddedChange }: Props) => {
  const { t } = useTranslation()
  // Remembers whatever litres the user had typed while "Yes" was selected, so an
  // accidental tap on "No" and back doesn't force blind re-entry.
  const lastEnteredLitres = useRef<number | null>(null)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        value={oilAdded === null ? null : oilAdded ? 'yes' : 'no'}
        onChange={(_, v) => {
          if (v === null) return
          const value = v === 'yes'
          onOilAddedChange(value)
          if (!value) {
            const current = getValues('oilUpliftLitres')
            if (current !== null && current !== undefined) lastEnteredLitres.current = current
            setValue('oilUpliftLitres', 0)
          } else if (setValue) {
            setValue('oilUpliftLitres', lastEnteredLitres.current)
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

      {oilAdded && (
        <Box sx={{ width: '100%' }}>
          <Controller
            name='oilUpliftLitres'
            control={control}
            render={({ field }) => (
              <ButtonPicker
                columns={3}
                options={QUICK_OIL.map((v) => ({ value: v, label: `${v.toFixed(1)}L` }))}
                value={field.value != null && QUICK_OIL.includes(field.value) ? field.value : null}
                onChange={field.onChange}
                overflow={{
                  label: t('flightLog.wizard.oilOverflow'),
                  startActive: field.value != null && !QUICK_OIL.includes(field.value),
                  render: ({ onBack }) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <TextField
                        type='number'
                        autoFocus
                        label={t('flightLog.oilUpliftLitres')}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? Number(e.target.value) : null)
                        }
                        slotProps={{
                          htmlInput: { inputMode: 'decimal', min: 0.7, max: 10, step: 0.1 },
                        }}
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
      )}
    </Box>
  )
}
