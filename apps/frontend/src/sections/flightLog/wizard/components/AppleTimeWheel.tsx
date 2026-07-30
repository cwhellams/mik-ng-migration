import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { WheelPicker } from './WheelPicker'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

interface AppleTimeWheelProps {
  hour: number | null
  minute: number | null
  onChange: (hour: number, minute: number) => void
  disabled?: boolean
}

// iOS-style 24h wheel time entry: two independent swipeable columns (hours, minutes)
// instead of a clock-face dial or typed digits.
export const AppleTimeWheel = ({ hour, minute, onChange, disabled }: AppleTimeWheelProps) => {
  const [h, setH] = useState(hour ?? 0)
  const [m, setM] = useState(minute ?? 0)

  useEffect(() => {
    if (hour != null) setH(hour)
  }, [hour])
  useEffect(() => {
    if (minute != null) setM(minute)
  }, [minute])

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
      <WheelPicker
        value={h}
        options={HOURS}
        disabled={disabled}
        ariaLabel='hours'
        onChange={(value) => {
          setH(value)
          onChange(value, m)
        }}
      />
      <Typography variant='h5' sx={{ fontWeight: 700, color: 'text.secondary' }}>
        :
      </Typography>
      <WheelPicker
        value={m}
        options={MINUTES}
        disabled={disabled}
        ariaLabel='minutes'
        onChange={(value) => {
          setM(value)
          onChange(h, value)
        }}
      />
    </Box>
  )
}
