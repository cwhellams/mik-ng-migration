import { useState, type ReactNode } from 'react'
import { Box, Button, Grid } from '@mui/material'

export interface ButtonPickerOption<V extends string | number> {
  value: V
  label: string
}

interface OverflowConfig {
  label: string
  // whether the current value falls outside the quick-pick options, so the picker
  // should start in typed/overflow mode rather than the button grid
  startActive?: boolean
  render: (props: { onBack: () => void }) => ReactNode
}

interface ButtonPickerProps<V extends string | number> {
  options: ButtonPickerOption<V>[]
  value: V | null
  onChange: (value: V) => void
  disabled?: boolean
  columns?: number
  overflow?: OverflowConfig
}

// A grid of large, thumb-friendly buttons standing in for a dropdown — used wherever
// the option set is small and bounded (aircraft, flight type, landings count, oil
// quantity). An optional trailing ">N"-style button swaps the grid for a typed input
// for values outside the quick-pick range.
export function ButtonPicker<V extends string | number>({
  options,
  value,
  onChange,
  disabled,
  columns = 3,
  overflow,
}: ButtonPickerProps<V>) {
  const [overflowActive, setOverflowActive] = useState(overflow?.startActive ?? false)

  if (overflow && overflowActive) {
    return <Box>{overflow.render({ onBack: () => setOverflowActive(false) })}</Box>
  }

  return (
    <Grid container spacing={1.5}>
      {options.map((opt) => (
        <Grid key={opt.value} size={12 / columns}>
          <Button
            fullWidth
            variant={value === opt.value ? 'contained' : 'outlined'}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            sx={{ minHeight: 56, minWidth: 44, fontSize: '1.05rem' }}
          >
            {opt.label}
          </Button>
        </Grid>
      ))}
      {overflow && (
        <Grid size={12}>
          <Button
            fullWidth
            variant='text'
            disabled={disabled}
            onClick={() => setOverflowActive(true)}
            sx={{ minHeight: 44 }}
          >
            {overflow.label}
          </Button>
        </Grid>
      )}
    </Grid>
  )
}
