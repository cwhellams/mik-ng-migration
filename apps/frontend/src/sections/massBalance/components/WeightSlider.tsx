import { Box, IconButton, Slider, useMediaQuery, useTheme } from '@mui/material'
import RemoveIcon from '@mui/icons-material/Remove'
import AddIcon from '@mui/icons-material/Add'

interface WeightSliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  isOverLimit?: boolean
  valueLabelDisplay?: 'auto' | 'on' | 'off'
}

const WeightSlider = ({
  value,
  onChange,
  min,
  max,
  step,
  isOverLimit = false,
  valueLabelDisplay = 'auto',
}: WeightSliderProps) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleDecrement = () => {
    onChange(Math.max(min, value - step))
  }

  const handleIncrement = () => {
    onChange(Math.min(max, value + step))
  }

  const sliderColor = isOverLimit ? 'error' : 'primary'
  const sliderSx = {
    color: isOverLimit ? 'error.main' : 'primary.main',
    ...(isMobile && {
      '& .MuiSlider-thumb': {
        width: 28,
        height: 28,
      },
      '& .MuiSlider-rail': {
        height: 6,
      },
      '& .MuiSlider-track': {
        height: 6,
      },
    }),
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {isMobile && (
        <IconButton
          size='small'
          onClick={handleDecrement}
          disabled={value <= min}
          color={sliderColor}
          aria-label='decrease'
        >
          <RemoveIcon fontSize='small' />
        </IconButton>
      )}
      <Box sx={{ flex: 1 }}>
        <Slider
          value={value}
          onChange={(_, newValue) => onChange(newValue as number)}
          min={min}
          max={max}
          step={step}
          valueLabelDisplay={valueLabelDisplay}
          sx={sliderSx}
        />
      </Box>
      {isMobile && (
        <IconButton
          size='small'
          onClick={handleIncrement}
          disabled={value >= max}
          color={sliderColor}
          aria-label='increase'
        >
          <AddIcon fontSize='small' />
        </IconButton>
      )}
    </Box>
  )
}

export default WeightSlider
