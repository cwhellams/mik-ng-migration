import { Box, useTheme } from '@mui/material'
import { useMemo } from 'react'

interface RunwaySpec {
  heading: number
  oppositeHeading: number
  length: number
  width: number
}

interface WindRoseProps {
  windRoseData: number[][]
  size?: number
  showRunways?: boolean
  runways?: RunwaySpec[]
}

const EFNU_RUNWAYS: RunwaySpec[] = [
  { heading: 40, oppositeHeading: 220, length: 0.7, width: 0.015 }, // 04/22
  { heading: 90, oppositeHeading: 270, length: 0.5, width: 0.01 }, // 09/27
]

export const WindRose = ({
  windRoseData,
  size = 200,
  showRunways = true,
  runways = EFNU_RUNWAYS,
}: WindRoseProps) => {
  const theme = useTheme()

  const processedData = useMemo(() => {
    // Wind rose data is an array of [min_speed, max_speed, percentage] for each direction
    const directions = windRoseData.length

    // Calculate the maximum percentage for scaling
    const maxPercentage = Math.max(...windRoseData.map((d) => d[2] || 0))

    return windRoseData.map((data, index) => {
      const [, maxSpeed, percentage] = data
      const angle = (index * 360) / directions
      const radius = size / 2
      const innerRadius = radius * 0.1 // Smaller inner circle
      const maxBarLength = radius * 0.85 // Maximum bar length

      // Create segments for different speed ranges
      const segments = []
      if (percentage > 0) {
        const baseLength = innerRadius
        const totalLength = baseLength + (percentage / maxPercentage) * maxBarLength

        segments.push({
          startRadius: baseLength,
          endRadius: totalLength,
          speed: maxSpeed,
        })
      }

      return {
        angle,
        percentage,
        segments,
        innerRadius,
      }
    })
  }, [windRoseData, size])

  const center = size / 2
  const radius = size / 2

  return (
    <Box
      sx={{
        width: size,
        height: size,
        position: 'relative',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Gradient for wind bars - light to dark red */}
          <linearGradient id='windGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
            <stop offset='0%' stopColor='#ffcccb' stopOpacity='0.6' />
            <stop offset='50%' stopColor='#ff6b6b' stopOpacity='0.8' />
            <stop offset='100%' stopColor='#d32f2f' stopOpacity='0.9' />
          </linearGradient>
        </defs>

        {/* Outer circle border */}
        <circle
          cx={center}
          cy={center}
          r={radius * 0.95}
          fill='none'
          stroke={theme.palette.mode === 'dark' ? '#4a5568' : '#cbd5e0'}
          strokeWidth='2'
        />

        {/* Background circles */}
        {[0.25, 0.5, 0.75].map((factor) => (
          <circle
            key={factor}
            cx={center}
            cy={center}
            r={radius * factor * 0.95}
            fill='none'
            stroke={theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0'}
            strokeWidth='1'
            strokeDasharray='2,2'
          />
        ))}

        {/* Cardinal and intercardinal direction lines */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180
          const x1 = center
          const y1 = center
          const x2 = center + Math.sin(rad) * radius * 0.95
          const y2 = center - Math.cos(rad) * radius * 0.95
          const isCardinal = angle % 90 === 0

          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0'}
              strokeWidth={isCardinal ? '1.5' : '1'}
              strokeDasharray={isCardinal ? '0' : '2,2'}
            />
          )
        })}

        {/* Wind direction bars with gradient effect */}
        {processedData.map((item) => {
          if (item.segments.length === 0) return null

          const segment = item.segments[0]
          const rad = (item.angle * Math.PI) / 180
          const x1 = center + Math.sin(rad) * item.innerRadius
          const y1 = center - Math.cos(rad) * item.innerRadius
          const x2 = center + Math.sin(rad) * segment.endRadius
          const y2 = center - Math.cos(rad) * segment.endRadius

          return (
            <line
              key={`wind-bar-${item.angle}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke='url(#windGradient)'
              strokeWidth={Math.max(10, size / 20)}
              strokeLinecap='round'
            />
          )
        })}

        {/* Runway overlays */}
        {showRunways &&
          runways.map((runway) => {
            const runwayLength = radius * runway.length
            const runwayWidth = size * runway.width

            // Draw runway at specified heading
            const rad = (runway.heading * Math.PI) / 180
            const x1 = center - Math.sin(rad) * runwayLength
            const y1 = center + Math.cos(rad) * runwayLength
            const x2 = center + Math.sin(rad) * runwayLength
            const y2 = center - Math.cos(rad) * runwayLength

            return (
              <g key={`runway-${runway.heading}-${runway.oppositeHeading}`}>
                {/* Runway line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.palette.error.main}
                  strokeWidth={runwayWidth}
                  strokeLinecap='round'
                  opacity={0.7}
                />
                {/* Runway outline for visibility */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.palette.mode === 'dark' ? '#fff' : '#000'}
                  strokeWidth={runwayWidth + 1}
                  strokeLinecap='round'
                  opacity={0.3}
                />
              </g>
            )
          })}

        {/* Cardinal direction labels */}
        <text
          x={center}
          y={center - radius * 0.88}
          textAnchor='middle'
          fontSize={size / 10}
          fill={theme.palette.text.primary}
          fontWeight='bold'
        >
          N
        </text>
        <text
          x={center + radius * 0.88}
          y={center}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize={size / 10}
          fill={theme.palette.text.primary}
          fontWeight='bold'
        >
          E
        </text>
        <text
          x={center}
          y={center + radius * 0.88}
          textAnchor='middle'
          fontSize={size / 10}
          fill={theme.palette.text.primary}
          fontWeight='bold'
        >
          S
        </text>
        <text
          x={center - radius * 0.88}
          y={center}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize={size / 10}
          fill={theme.palette.text.primary}
          fontWeight='bold'
        >
          W
        </text>

        {/* Scale indicators on the right */}
        {[1, 2, 3, 4, 5].map((value) => {
          const factor = value / 5
          const x = center + radius * factor * 0.85
          const y = center

          return (
            <g key={`scale-${value}`}>
              <circle cx={x} cy={y} r={2} fill={theme.palette.text.secondary} opacity={0.5} />
              <text
                x={x}
                y={y + size / 30}
                textAnchor='middle'
                fontSize={size / 20}
                fill={theme.palette.text.secondary}
                opacity={0.7}
              >
                {value}
              </text>
            </g>
          )
        })}

        {/* Scale label */}
        <text
          x={center + radius * 0.95}
          y={center}
          textAnchor='start'
          fontSize={size / 18}
          fill={theme.palette.text.secondary}
          opacity={0.7}
        >
          kt
        </text>
      </svg>
    </Box>
  )
}
