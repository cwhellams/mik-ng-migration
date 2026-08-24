import {
  Box,
  Container,
  Typography,
  Link,
  Divider,
  Stack,
  Dialog,
  DialogContent,
  IconButton,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'
import MikLogo from '../assets/mik-blue.svg'
import MikLogoWhite from '../assets/mik-white.svg'
import useApi from '@mik/ui/hooks/useApi'
import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

// ── Split-flap board ──────────────────────────────────────────────────────────

const FLIP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#@%&*+-.'

interface FlipTileProps {
  finalChar: string
  delay: number
  running: boolean
}

const FlipTile = ({ finalChar, delay, running }: FlipTileProps) => {
  const [displayChar, setDisplayChar] = useState('\u00A0')
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!running) {
      setDisplayChar('\u00A0')
      setSettled(false)
      return
    }

    let interval: ReturnType<typeof setInterval>
    const startTimer = setTimeout(() => {
      setSettled(false)
      interval = setInterval(() => {
        setDisplayChar(FLIP_CHARS[Math.floor(Math.random() * FLIP_CHARS.length)])
      }, 55)

      const settleTimer = setTimeout(() => {
        clearInterval(interval)
        setDisplayChar(finalChar === ' ' ? '\u00A0' : finalChar.toUpperCase())
        setSettled(true)
      }, 1100)

      return () => clearTimeout(settleTimer)
    }, delay)

    return () => {
      clearTimeout(startTimer)
      clearInterval(interval)
    }
  }, [running, finalChar, delay])

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: { xs: 26, sm: 34 },
        height: { xs: 38, sm: 48 },
        backgroundColor: '#111',
        color: settled ? '#FFD700' : '#FF8C00',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: { xs: '1.1rem', sm: '1.45rem' },
        fontWeight: 'bold',
        mx: '1.5px',
        my: '1.5px',
        borderRadius: '3px',
        border: '1px solid #252525',
        position: 'relative',
        userSelect: 'none',
        transition: settled ? 'color 0.25s ease' : 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: '1.5px',
          backgroundColor: '#000',
          opacity: 0.65,
          pointerEvents: 'none',
        },
      }}
    >
      {displayChar}
    </Box>
  )
}

interface FlipRowProps {
  text: string
  baseDelay?: number
  running: boolean
  label: string
}

const FlipRow = ({ text, baseDelay = 0, running, label }: FlipRowProps) => (
  <Box sx={{ mb: 2 }}>
    <Typography
      sx={{
        color: '#555',
        fontFamily: '"Courier New", monospace',
        fontSize: '0.6rem',
        letterSpacing: '0.25em',
        fontWeight: 'bold',
        mb: 0.75,
      }}
    >
      {label}
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
      {text.split('').map((char, i) => (
        <FlipTile key={i} finalChar={char} delay={baseDelay + i * 75} running={running} />
      ))}
    </Box>
  </Box>
)

const PrivacyModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setAnimating(true), 250)
      return () => clearTimeout(t)
    } else {
      setAnimating(false)
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: '#0a0a0a',
            backgroundImage: 'none',
            border: '2px solid #1e1e1e',
            borderRadius: 2,
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Board header bar */}
        <Box
          sx={{
            backgroundColor: '#0f0f0f',
            borderBottom: '2px solid #1a1a1a',
            py: 1.25,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Icon icon='mdi:airplane' color='#FFD700' fontSize={18} />
            <Typography
              sx={{
                color: '#FFD700',
                fontFamily: '"Courier New", monospace',
                fontSize: '0.7rem',
                letterSpacing: '0.18em',
                fontWeight: 'bold',
              }}
            >
              MALMIN ILMAILUKERHO — INFORMATION BOARD
            </Typography>
          </Box>
          <IconButton
            aria-label='Close privacy dialog'
            onClick={onClose}
            size='small'
            sx={{ color: '#444', '&:hover': { color: '#888' } }}
          >
            <Icon icon='mdi:close' fontSize={18} />
          </IconButton>
        </Box>

        {/* Flip board content */}
        <Box sx={{ px: 3, pt: 3, pb: 2 }}>
          <FlipRow label='SUBJECT' text='PRIVACY POLICY' baseDelay={0} running={animating} />
          <FlipRow label='STATUS' text='DELAYED' baseDelay={600} running={animating} />
        </Box>

        {/* Footer caption */}
        <Box
          sx={{
            borderTop: '1px solid #181818',
            py: 1.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <Typography
            sx={{
              color: '#3a3a3a',
              fontFamily: '"Courier New", monospace',
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
            }}
          >
            ETA: WHEN PIGS FLY
          </Typography>
          <Icon icon='mdi:pig' color='#3a3a3a' fontSize={14} />
          <Typography
            sx={{
              color: '#3a3a3a',
              fontFamily: '"Courier New", monospace',
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
            }}
          >
            {'  |  THANK YOU FOR YOUR PATIENCE'}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

const Footer = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const currentYear = new Date().getFullYear()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const { data: versionData } = useApi<{ version: string }>({
    url: '/v1/version',
    allowUnauthenticated: true,
  })

  return (
    <Box
      component='footer'
      sx={{
        mt: 6,
        px: 5,
        py: 4,

        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(245, 245, 245, 0.8)',

        backdropFilter: 'blur(8px)',
        borderTop: '1px solid',
        borderColor: 'divider',
        width: '100vw',
      }}
    >
      <Container maxWidth='lg'>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'center', md: 'flex-start' },
            mb: 3,
          }}
        >
          {/* Logo and club info */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'center', md: 'flex-start' },
              mb: { xs: 3, md: 0 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <img
                src={theme.palette.mode === 'dark' ? MikLogoWhite : MikLogo}
                alt='MIK Logo'
                style={{ height: 30, width: 'auto', marginRight: '8px' }}
              />
            </Box>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
              }}
            >
              Malmin Ilmailukerho ry
            </Typography>
          </Box>

          {/* Quick links */}
          <Stack spacing={1} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Typography
              variant='subtitle2'
              gutterBottom
              sx={{
                color: 'text.primary',
              }}
            >
              {t('footer.quickLinks')}
            </Typography>
            <Link
              href='https://www.mik.fi'
              target='_blank'
              rel='noopener noreferrer'
              color='inherit'
              underline='hover'
            >
              {t('footer.website')}
            </Link>
            <Link
              href='https://www.mik.fi/contact'
              target='_blank'
              rel='noopener noreferrer'
              color='inherit'
              underline='hover'
            >
              {t('footer.contact')}
            </Link>
            <Link
              component='button'
              type='button'
              onClick={() => setPrivacyOpen(true)}
              color='inherit'
              underline='hover'
              sx={{
                background: 'none',
                border: 'none',
                p: 0,
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'inherit',
              }}
            >
              {t('footer.privacy')}
            </Link>
          </Stack>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Copyright */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            © {currentYear} Malmin Ilmailukerho ry.
          </Typography>
          {versionData?.version && (
            <Typography
              variant='caption'
              sx={{
                color: 'text.disabled',
              }}
            >
              {t('footer.version')} {versionData.version}
            </Typography>
          )}
        </Box>
      </Container>
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </Box>
  )
}

export default Footer
