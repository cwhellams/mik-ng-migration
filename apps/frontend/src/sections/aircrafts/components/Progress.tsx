import { useEffect, useState } from 'react'

import { useTheme } from '@mui/material'

const Marker = () => {
  const theme = useTheme()
  return (
    <svg width='22' height='100' xmlns='http://www.w3.org/2000/svg'>
      <path
        fill={
          theme.palette.mode == 'dark'
            ? theme.palette.primary.light
            : theme.palette.primary.dark
        }
        stroke={theme.palette.primary.main}
        strokeWidth='2px'
        d='M 1 5 L 21 5 L 21 20 L 11 30 L 1 20 Z'
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
  const colors = ['red', 'yellow', 'green', 'green']

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
    <>
      <div
        style={{
          backgroundColor: 'gray',
          display: 'flex',
          height: '20px',
          margin: '20px 0',
          position: 'relative',
        }}
      >
        <div
          style={{
            left: `${width(zeroPoint + current)}%`,
            transition: 'left 1s',
            marginTop: '-20px',
            // half of the width
            marginLeft: '-11px',
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
              }}
            >
              <div
                style={{
                  marginTop: '20px',
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
    </>
  )
}

export default ProgressLine
