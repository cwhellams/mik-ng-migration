import { useEffect, useState } from 'react'

import { useTheme } from '@mui/material'

const marketWidth = 15
const marketHeight = 10

const Marker = () => {
  const theme = useTheme()
  return (
    <svg width={marketWidth} height='100' xmlns='http://www.w3.org/2000/svg'>
      <path
        fill={
          theme.palette.mode == 'dark'
            ? theme.palette.grey[200]
            : theme.palette.grey[800]
        }
        stroke={'#000'}
        strokeWidth='2px'
        d={`M 1 0 L ${marketWidth - 1} 0 L ${marketWidth - 1} ${marketHeight} L ${marketWidth / 2} ${marketHeight + 10} L 1 ${marketHeight} Z`}
      />
    </svg>
  )
}

const ProgressLine = ({
  hardLimit,
  softLimit,
  current,
  max,
}: {
  hardLimit: number
  softLimit: number
  current: number
  max: number
}) => {
  const parts = [
    {
      color: '#dd5235',
      border: '#993333',
      title: undefined,
      tooltip: '',
      width: Math.abs(hardLimit - softLimit),
    },
    {
      color: '#f9de55',
      border: '#cc9933',
      title: softLimit,
      width: Math.abs(softLimit),
    },
    {
      color: '#66cc66',
      border: '#669933',
      title: 0,
      width: 0,
    },
    {
      color: '#66cc66',
      border: '#669933',
      title: max,
      width: max,
    },
  ]

  const zeroPoint = Math.abs(hardLimit)
  const totalWidth = zeroPoint + max

  const [animation, setAnimation] = useState(0)

  const animateWidth = (width: number) => {
    return (animation * (100 * width)) / totalWidth
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      setAnimation(1)
    })
  }, [])

  return (
    <div
      style={{
        backgroundColor: 'gray',
        display: 'flex',
        height: '10px',
        margin: '20px 0',
        position: 'relative',
      }}
    >
      <div
        style={{
          left: `${animateWidth(zeroPoint + current)}%`,
          transition: 'left 1s',
          marginTop: `-${marketHeight + 3}px`,
          marginLeft: `-${marketWidth / 2}px`,
          position: 'absolute',
        }}
      >
        <Marker />
      </div>

      {parts.map((part, index, { length }) => {
        const isFirst = index == 0
        const isLast = index == length - 1
        return (
          <div
            key={index}
            style={{
              width: `${animateWidth(part.width)}%`,
              backgroundColor: part.color,
              transition: 'width 1s',
              borderTop: `1px solid ${part.border}`,
              borderBottom: `1px solid ${part.border}`,
              borderLeft: isFirst ? `1px solid ${part.border}` : undefined,
              borderRight: isLast ? `1px solid ${part.border}` : undefined,
            }}
          >
            <div
              style={{
                marginTop: '10px',
                width: !isLast ? 0 : 'auto',
                display: 'flex',
                justifyContent: !isLast ? 'center' : 'right',
              }}
            >
              {part.title}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ProgressLine
