import { useRef } from 'react'
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { TxtField } from '../../components/TxtField'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  refueled: boolean | null
  onRefueledChange: (value: boolean) => void
}

export const FuelUpliftStep = ({
  control,
  setValue,
  getValues,
  refueled,
  onRefueledChange,
}: Props) => {
  const { t } = useTranslation()
  // Remembers whatever litres the user had typed while "Yes" was selected, so an
  // accidental tap on "No" and back doesn't force blind re-entry.
  const lastEnteredLitres = useRef<number | null>(null)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        value={refueled === null ? null : refueled ? 'yes' : 'no'}
        onChange={(_, v) => {
          if (v === null) return
          const value = v === 'yes'
          onRefueledChange(value)
          if (!value) {
            const current = getValues('fuelUpliftLitres')
            if (current) lastEnteredLitres.current = current
            setValue('fuelUpliftLitres', 0)
          } else {
            setValue('fuelUpliftLitres', lastEnteredLitres.current)
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

      {refueled && (
        <Box sx={{ width: '100%', maxWidth: 240 }}>
          <TxtField
            name='fuelUpliftLitres'
            control={control}
            props={{
              type: 'number',
              autoFocus: true,
              fullWidth: true,
              slotProps: { htmlInput: { inputMode: 'numeric', min: 0, max: 300, step: 1 } },
            }}
          />
        </Box>
      )}
    </Box>
  )
}
