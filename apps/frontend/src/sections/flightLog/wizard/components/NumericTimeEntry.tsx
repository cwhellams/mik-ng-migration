import { useEffect, useRef, useState } from 'react'
import { Box, TextField } from '@mui/material'

interface NumericTimeEntryProps {
  hour: number | null
  minute: number | null
  onChange: (hour: number, minute: number) => void
  disabled?: boolean
}

const bigDigitStyle = {
  textAlign: 'center' as const,
  fontSize: '2rem',
  fontWeight: 700,
  width: '2.1ch',
  padding: '14px 6px',
}

// Two real <input> segments (not a masked/contenteditable picker) so mobile browsers
// reliably show a numeric keypad — see NumericTimeEntry usage notes in the wizard plan.
export const NumericTimeEntry = ({ hour, minute, onChange, disabled }: NumericTimeEntryProps) => {
  const [hh, setHh] = useState(hour != null ? String(hour).padStart(2, '0') : '')
  const [mm, setMm] = useState(minute != null ? String(minute).padStart(2, '0') : '')
  const minuteRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHh(hour != null ? String(hour).padStart(2, '0') : '')
  }, [hour])
  useEffect(() => {
    setMm(minute != null ? String(minute).padStart(2, '0') : '')
  }, [minute])

  const commit = (newHh: string, newMm: string) => {
    const h = Number(newHh)
    const m = Number(newMm)
    if (
      newHh.length === 2 &&
      newMm.length === 2 &&
      !Number.isNaN(h) &&
      !Number.isNaN(m) &&
      h <= 23 &&
      m <= 59
    ) {
      onChange(h, m)
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
      <TextField
        value={hh}
        disabled={disabled}
        placeholder='HH'
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 2)
          const clamped = Number(v) > 23 ? '23' : v
          setHh(clamped)
          if (clamped.length === 2) {
            commit(clamped, mm)
            minuteRef.current?.focus()
            minuteRef.current?.select()
          }
        }}
        slotProps={{
          htmlInput: {
            type: 'text',
            inputMode: 'numeric',
            pattern: '[0-9]*',
            maxLength: 2,
            style: bigDigitStyle,
            'aria-label': 'hours',
          },
        }}
      />
      <Box sx={{ fontSize: '2rem', fontWeight: 700 }}>:</Box>
      <TextField
        inputRef={minuteRef}
        value={mm}
        disabled={disabled}
        placeholder='MM'
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 2)
          const clamped = Number(v) > 59 ? '59' : v
          setMm(clamped)
          if (clamped.length === 2) {
            commit(hh, clamped)
          }
        }}
        slotProps={{
          htmlInput: {
            type: 'text',
            inputMode: 'numeric',
            pattern: '[0-9]*',
            maxLength: 2,
            style: bigDigitStyle,
            'aria-label': 'minutes',
          },
        }}
      />
    </Box>
  )
}
