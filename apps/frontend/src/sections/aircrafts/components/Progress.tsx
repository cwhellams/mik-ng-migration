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
  const colors = ['#dd5235', '#f9de55', '#66cc66', '#66cc66']
  const borders = ['#993333', '#cc9933', '#669933', '#669933']

  const zeroPoint = Math.abs(hardLimit)
  const totalWidth = zeroPoint + max

  const titles = [hardLimit, softLimit, 0, max]
  const visualParts = [
    Math.abs(hardLimit - softLimit),
    Math.abs(softLimit),
    0,
    max,
  ]

  const [animation, setAnimation] = useState(0)

  const width = (val: number) => {
    return (animation * (100 * val)) / totalWidth
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
          left: `${width(zeroPoint + current)}%`,
          transition: 'left 1s',
          marginTop: `-${marketHeight + 3}px`,
          marginLeft: `-${marketWidth / 2}px`,
          position: 'absolute',
        }}
      >
        <Marker />
      </div>

      {visualParts.map((item, index, { length }) => {
        return (
          <div
            key={index}
            style={{
              width: `${width(item)}%`,
              backgroundColor: colors[index],
              transition: 'width 1s',
              borderTop: `1px solid ${borders[index]}`,
              borderBottom: `1px solid ${borders[index]}`,
              borderLeft:
                index == 0 ? `1px solid ${borders[index]}` : undefined,
              borderRight:
                index == length - 1 ? `1px solid ${borders[index]}` : undefined,
            }}
          >
            <div
              style={{
                marginTop: '10px',
                width: index < length - 1 ? 0 : 'auto',
                display: 'flex',
                justifyContent: index < length - 1 ? 'center' : 'right',
              }}
            >
              {index !== 0 ? titles[index] : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ProgressLine
