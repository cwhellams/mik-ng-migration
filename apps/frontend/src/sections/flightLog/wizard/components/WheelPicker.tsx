import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { vibrate } from '../../../../utils/haptics'

interface WheelPickerProps {
  value: number
  options: readonly number[]
  onChange: (value: number) => void
  disabled?: boolean
  format?: (n: number) => string
  ariaLabel?: string
}

const ITEM_HEIGHT = 40
const VISIBLE_ROWS = 5
const PADDING = (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2

// A single scrollable, snap-to-item column — the iOS-style "wheel" the user swipes up
// and down to change hours/minutes, relying on the browser's native momentum + snap
// scrolling rather than any custom drag/inertia logic.
export const WheelPicker = ({
  value,
  options,
  onChange,
  disabled,
  format = (n) => String(n).padStart(2, '0'),
  ariaLabel,
}: WheelPickerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastCommitted = useRef(value)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Suppress the onScroll handler while we're programmatically scrolling to a new
  // external value, so it doesn't re-fire onChange for a value that didn't come from
  // the user's own swipe.
  const isProgrammaticScroll = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const idx = options.indexOf(value)
    if (idx === -1) return
    const top = idx * ITEM_HEIGHT
    if (containerRef.current.scrollTop === top) return
    isProgrammaticScroll.current = true
    containerRef.current.scrollTo({ top, behavior: 'auto' })
    lastCommitted.current = value
    // scroll events settle asynchronously — clear the guard shortly after
    setTimeout(() => (isProgrammaticScroll.current = false), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleScroll = () => {
    if (!containerRef.current || isProgrammaticScroll.current) return
    window.clearTimeout(scrollTimeout.current)
    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return
      const idx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT)
      const clamped = Math.min(Math.max(idx, 0), options.length - 1)
      const settled = options[clamped]
      // With scroll-snap-type: proximity (below) the browser won't force-align short
      // drags to an exact row boundary the way "mandatory" does, so re-snap precisely
      // ourselves once the scroll settles — this is what makes a one-row nudge (e.g.
      // 0 -> 1 minute) land reliably instead of springing back to where it started.
      const target = clamped * ITEM_HEIGHT
      if (containerRef.current.scrollTop !== target) {
        containerRef.current.scrollTo({ top: target, behavior: 'smooth' })
      }
      if (settled !== lastCommitted.current) {
        lastCommitted.current = settled
        vibrate()
        onChange(settled)
      }
    }, 120)
  }

  return (
    <Box
      sx={{
        position: 'relative',
        height: ITEM_HEIGHT * VISIBLE_ROWS,
        width: 64,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: PADDING,
          height: ITEM_HEIGHT,
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pointerEvents: 'none',
        }}
      />
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        role='listbox'
        aria-label={ariaLabel}
        sx={{
          height: '100%',
          overflowY: disabled ? 'hidden' : 'scroll',
          // "proximity" (not "mandatory") lets a short, deliberate one-row drag settle
          // where the user left it instead of the browser fighting it back to the
          // nearest snap point mid-gesture — handleScroll re-snaps precisely afterward.
          scrollSnapType: disabled ? 'none' : 'y proximity',
          overscrollBehavior: 'contain',
          pointerEvents: disabled ? 'none' : 'auto',
          opacity: disabled ? 0.35 : 1,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          maskImage:
            'linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.85) 25%, rgba(0,0,0,0.85) 75%, transparent 100%)',
        }}
      >
        <Box sx={{ height: PADDING }} />
        {options.map((opt) => (
          <Box
            key={opt}
            role='option'
            aria-selected={opt === value}
            onClick={() => {
              if (disabled) return
              containerRef.current?.scrollTo({
                top: options.indexOf(opt) * ITEM_HEIGHT,
                behavior: 'smooth',
              })
            }}
            sx={{
              height: ITEM_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'start',
              fontVariantNumeric: 'tabular-nums',
              fontSize: opt === value ? '1.5rem' : '1.15rem',
              fontWeight: opt === value ? 700 : 400,
              color: opt === value ? 'text.primary' : 'text.secondary',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {format(opt)}
          </Box>
        ))}
        <Box sx={{ height: PADDING }} />
      </Box>
    </Box>
  )
}
