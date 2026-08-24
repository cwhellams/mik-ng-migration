import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import useApi from '@mik/ui/hooks/useApi'
import type { UsefulPhoneNumber } from '@mik/contracts/useful-phone-numbers'

// Yellow-and-black "C" panel-style badge — the visual marker this club uses on
// airfield diagrams for the control/clubhouse building.
const ControlBadge = () => (
  <Box
    aria-hidden
    sx={{
      width: 60,
      height: 60,
      flexShrink: 0,
      bgcolor: '#f5d800',
      border: '3px solid #000',
      borderRadius: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Typography sx={{ fontWeight: 900, fontSize: '2.2rem', color: '#000', lineHeight: 1 }}>
      C
    </Typography>
  </Box>
)

// Gentle "notice me" wiggle — draws the eye to the button without being obnoxious;
// pauses between shakes rather than looping continuously.
const shakeKeyframes = {
  '@keyframes phoneShake': {
    '0%, 8%': { transform: 'rotate(0deg)' },
    '1%': { transform: 'rotate(-16deg)' },
    '2%': { transform: 'rotate(13deg)' },
    '3%': { transform: 'rotate(-10deg)' },
    '4%': { transform: 'rotate(7deg)' },
    '5%': { transform: 'rotate(-4deg)' },
    '6%': { transform: 'rotate(2deg)' },
    '7%, 100%': { transform: 'rotate(0deg)' },
  },
}

const ShakingPhoneIcon = () => (
  <Box
    component='span'
    sx={{
      display: 'inline-flex',
      transformOrigin: '50% 70%',
      animation: 'phoneShake 3.5s ease-in-out infinite',
      ...shakeKeyframes,
    }}
  >
    <Icon icon='mdi:phone-alert-outline' />
  </Box>
)

// Bottom-of-screen reminder button shown on the wizard's first step — many pilots
// forget to close a filed flight plan after landing. Tapping the number dials it
// directly via a tel: link, which mobile browsers turn into a native call prompt.
export const FlightPlanReminder = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const { data } = useApi<UsefulPhoneNumber>({
    url: 'v1/useful-phone-numbers/flight-plan-centre',
    allowUnauthenticated: true,
  })

  return (
    <>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1.5, mb: 0.5 }}
      >
        <ControlBadge />
      </Box>
      <Button
        fullWidth
        variant='outlined'
        color='warning'
        startIcon={<ShakingPhoneIcon />}
        onClick={() => setOpen(true)}
        sx={{ minHeight: 44 }}
      >
        {t('flightLog.wizard.flightPlanReminder.button')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{t('flightLog.wizard.flightPlanReminder.title')}</DialogTitle>
        <DialogContent>
          {data ? (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Link
                href={`tel:${data.phoneNumber.replace(/\s+/g, '')}`}
                underline='none'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                }}
              >
                <Icon icon='mdi:phone' />
                {data.phoneNumber}
              </Link>
            </Box>
          ) : (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
              {t('flightLog.wizard.flightPlanReminder.noNumber')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
