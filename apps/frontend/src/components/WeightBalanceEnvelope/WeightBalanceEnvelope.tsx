import React from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { AircraftSpecs, isPointInFlightEnvelope } from '../../utils/specsParser'

interface WeightBalanceEnvelopeProps {
  aircraft: AircraftSpecs
  takeoffWeight: number
  takeoffCG: number
  landingWeight: number
  landingCG: number
}

const WeightBalanceEnvelope: React.FC<WeightBalanceEnvelopeProps> = ({
  aircraft,
  takeoffWeight,
  takeoffCG,
  landingWeight,
  landingCG,
}) => {
  // Calculate chart dimensions and scales - make chart larger for full width display
  const chartWidth = 800
  const chartHeight = 500
  const margin = { top: 20, right: 180, bottom: 80, left: 100 }
  const innerWidth = chartWidth - margin.left - margin.right
  const innerHeight = chartHeight - margin.top - margin.bottom

  // Weight and CG ranges - calculate from envelope points if available, otherwise use limits
  let minWeight: number, maxWeight: number, minCG: number, maxCG: number

  if (
    aircraft.flightEnvelopePoints &&
    aircraft.flightEnvelopePoints.length > 0
  ) {
    const weights = aircraft.flightEnvelopePoints.map((p) => p.weight)
    const cgs = aircraft.flightEnvelopePoints.map((p) => p.momentArm)
    minWeight = Math.min(...weights) - 50
    maxWeight = Math.max(...weights) + 50
    minCG = Math.min(...cgs) - 5
    maxCG = Math.max(...cgs) + 5
  } else {
    // Fallback to basic limits
    minWeight =
      aircraft.weightLimits.minTakeoff ||
      Math.max(0, aircraft.weightLimits.basicEmptyWeight - 50)
    maxWeight = aircraft.weightLimits.maxTakeoff + 50
    minCG = aircraft.cgLimits.forward - 5
    maxCG = aircraft.cgLimits.aft + 5
  }

  const weightRange = maxWeight - minWeight
  const cgRange = maxCG - minCG

  // Scale functions
  const xScale = (cg: number) => ((cg - minCG) / cgRange) * innerWidth
  const yScale = (weight: number) =>
    innerHeight - ((weight - minWeight) / weightRange) * innerHeight

  // Use aircraft-specific flight envelope points if available, otherwise fallback to rectangular envelope
  const envelopePoints =
    aircraft.flightEnvelopePoints && aircraft.flightEnvelopePoints.length > 0
      ? aircraft.flightEnvelopePoints.map((point) => ({
          weight: point.weight,
          cg: point.momentArm,
        }))
      : [
          {
            weight:
              aircraft.weightLimits.minTakeoff ||
              aircraft.weightLimits.basicEmptyWeight,
            cg: aircraft.cgLimits.forward,
          },
          {
            weight: aircraft.weightLimits.maxTakeoff,
            cg: aircraft.cgLimits.forward,
          },
          {
            weight: aircraft.weightLimits.maxTakeoff,
            cg: aircraft.cgLimits.aft,
          },
          {
            weight:
              aircraft.weightLimits.minTakeoff ||
              aircraft.weightLimits.basicEmptyWeight,
            cg: aircraft.cgLimits.aft,
          },
        ]

  const envelopePath =
    envelopePoints
      .map((point, index) => {
        const x = xScale(point.cg)
        const y = yScale(point.weight)
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ') + ' Z'

  // Create grid lines
  const weightGridLines = []
  const weightStep = 200
  for (
    let w = Math.ceil(minWeight / weightStep) * weightStep;
    w <= maxWeight;
    w += weightStep
  ) {
    if (w >= minWeight && w <= maxWeight) {
      weightGridLines.push({
        y: yScale(w),
        label: `${w}kg`,
      })
    }
  }

  const cgGridLines = []
  const cgStep = aircraft.registration === 'OH-IHQ' ? 3 : 4 // Larger steps to prevent overlap
  for (let cg = Math.ceil(minCG / cgStep) * cgStep; cg <= maxCG; cg += cgStep) {
    if (cg >= minCG && cg <= maxCG) {
      cgGridLines.push({
        x: xScale(cg),
        label: `${cg}cm`,
      })
    }
  }

  // Point styles - check against actual flight envelope using shared utility
  const getPointColor = (weight: number, cg: number) => {
    return isPointInFlightEnvelope(aircraft, weight, cg) ? '#4caf50' : '#f44336'
  }

  return (
    <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
      <Typography variant='h6' gutterBottom>
        Weight & Balance Envelope - {aircraft.aircraftType}
      </Typography>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ mb: 2, display: 'block' }}
      >
        Data Source: {aircraft.dataOrigin}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={chartWidth} height={chartHeight}>
          {/* Grid lines */}
          <g>
            {/* Weight grid lines */}
            {weightGridLines.map((line, index) => (
              <g key={`weight-${index}`}>
                <line
                  x1={margin.left}
                  y1={margin.top + line.y}
                  x2={margin.left + innerWidth}
                  y2={margin.top + line.y}
                  stroke='#e0e0e0'
                  strokeWidth={1}
                />
                <text
                  x={margin.left - 5}
                  y={margin.top + line.y + 4}
                  textAnchor='end'
                  fontSize='12'
                  fill='#666'
                >
                  {line.label}
                </text>
              </g>
            ))}

            {/* CG grid lines */}
            {cgGridLines.map((line, index) => (
              <g key={`cg-${index}`}>
                <line
                  x1={margin.left + line.x}
                  y1={margin.top}
                  x2={margin.left + line.x}
                  y2={margin.top + innerHeight}
                  stroke='#e0e0e0'
                  strokeWidth={1}
                />
                <text
                  x={margin.left + line.x}
                  y={margin.top + innerHeight + 20}
                  textAnchor='middle'
                  fontSize='11'
                  fill='#666'
                >
                  {line.label}
                </text>
              </g>
            ))}
          </g>

          {/* Chart border */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill='none'
            stroke='#333'
            strokeWidth={2}
          />

          {/* Envelope area */}
          <path
            d={envelopePath}
            fill='rgba(76, 175, 80, 0.1)'
            stroke='#4caf50'
            strokeWidth={2}
            transform={`translate(${margin.left}, ${margin.top})`}
          />

          {/* Flight progression: Takeoff to Landing */}
          {takeoffWeight > 0 && landingWeight > 0 && (
            <g>
              {/* Dotted line with arrow from takeoff to landing */}
              <defs>
                <marker
                  id='arrowhead'
                  markerWidth='10'
                  markerHeight='7'
                  refX='9'
                  refY='3.5'
                  orient='auto'
                  fill='#2196f3'
                >
                  <polygon points='0 0, 10 3.5, 0 7' />
                </marker>
              </defs>

              <line
                x1={margin.left + xScale(takeoffCG)}
                y1={margin.top + yScale(takeoffWeight)}
                x2={margin.left + xScale(landingCG)}
                y2={margin.top + yScale(landingWeight)}
                stroke='#2196f3'
                strokeWidth={2}
                strokeDasharray='5,5'
                markerEnd='url(#arrowhead)'
              />
            </g>
          )}

          {/* Takeoff point (circle) */}
          {takeoffWeight > 0 && (
            <circle
              cx={margin.left + xScale(takeoffCG)}
              cy={margin.top + yScale(takeoffWeight)}
              r={7}
              fill={getPointColor(takeoffWeight, takeoffCG)}
              stroke='#fff'
              strokeWidth={2}
            />
          )}

          {/* Landing point (square) */}
          {landingWeight > 0 && (
            <rect
              x={margin.left + xScale(landingCG) - 6}
              y={margin.top + yScale(landingWeight) - 6}
              width={12}
              height={12}
              fill={getPointColor(landingWeight, landingCG)}
              stroke='#fff'
              strokeWidth={2}
            />
          )}

          {/* Axis labels */}
          <text
            x={chartWidth / 2}
            y={chartHeight - 5}
            textAnchor='middle'
            fontSize='14'
            fontWeight='bold'
            fill='#333'
          >
            Center of Gravity (cm)
          </text>

          <text
            x={15}
            y={chartHeight / 2}
            textAnchor='middle'
            fontSize='14'
            fontWeight='bold'
            fill='#333'
            transform={`rotate(-90, 15, ${chartHeight / 2})`}
          >
            Weight (kg)
          </text>

          {/* Legend - positioned outside the graph area */}
          <g
            transform={`translate(${margin.left + innerWidth + 20}, ${margin.top + 10})`}
          >
            <rect
              x={0}
              y={0}
              width={130}
              height={85}
              fill='rgba(255,255,255,0.95)'
              stroke='#ccc'
              strokeWidth={1}
              rx={4}
            />
            <text x={10} y={15} fontSize='12' fontWeight='bold' fill='#333'>
              Legend
            </text>
            <circle
              cx={15}
              cy={30}
              r={5}
              fill='#4caf50'
              stroke='#fff'
              strokeWidth={2}
            />
            <text x={26} y={34} fontSize='10' fill='#333'>
              Within Envelope
            </text>
            <circle
              cx={15}
              cy={45}
              r={5}
              fill='#f44336'
              stroke='#fff'
              strokeWidth={2}
            />
            <text x={26} y={49} fontSize='10' fill='#333'>
              Outside Envelope
            </text>
            <circle
              cx={15}
              cy={60}
              r={5}
              fill='#2196f3'
              stroke='#fff'
              strokeWidth={2}
            />
            <text x={26} y={64} fontSize='10' fill='#333'>
              ● Takeoff Weight
            </text>
            <rect
              x={11}
              y={71}
              width={8}
              height={8}
              fill='#2196f3'
              stroke='#fff'
              strokeWidth={2}
            />
            <text x={26} y={78} fontSize='10' fill='#333'>
              ■ Landing Weight
            </text>
          </g>
        </svg>
      </Box>
    </Paper>
  )
}

export default WeightBalanceEnvelope
