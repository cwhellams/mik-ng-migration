import React from 'react'
import { Box, Typography } from '@mui/material'

const Watermark: React.FC<{ text: string; color?: string }> = ({ text, color = 'black' }) => {
  const isRed = color === 'red'
  const boxOpacity = isRed ? 0.15 : 0.1
  const textOpacity = isRed ? 1 : 0.2

  return (
    <Box
      sx={{
        pointerEvents: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        opacity: boxOpacity,
        backgroundImage: `repeating-linear-gradient(
          45deg,
          transparent,
          transparent 80px,
          rgba(0, 0, 0, 0.1) 80px,
          rgba(0, 0, 0, 0.1) 160px
        )`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {[...Array(20)].map((_, index) => (
        <Typography
          key={index}
          sx={{
            transform: 'rotate(-30deg)',
            fontSize: 32,
            color: color,
            opacity: textOpacity,
            userSelect: 'none',
            m: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </Typography>
      ))}
    </Box>
  )
}

export default Watermark
