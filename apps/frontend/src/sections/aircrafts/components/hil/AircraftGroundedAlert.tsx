import React from 'react'
import { Alert, AlertTitle, Button, Link, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useAircraftHil } from './useAircraftHil'
import { useOpenDefectLink } from './useOpenDefectLink'

interface AircraftGroundedAlertProps {
  aircraftRegistration: string
  /** Opens the Hold Item List tab of the same aircraft card */
  onShowHil: () => void
}

/**
 * Grounding banner shown at the top of the aircraft info tab. An aircraft is
 * grounded while a logbook defect has neither a hold item nor a maintenance
 * release, or while a hold item is past its (possibly extended) due date.
 */
export const AircraftGroundedAlert: React.FC<AircraftGroundedAlertProps> = ({
  aircraftRegistration,
  onShowHil,
}) => {
  const { t } = useTranslation()
  const { hil, isGrounded, openDefectCount, openDefects, overdueHilCount } =
    useAircraftHil(aircraftRegistration)
  const handleOpenDefect = useOpenDefectLink(aircraftRegistration)

  if (!isGrounded && hil.length === 0) return null

  const openHilButton = (
    <Button
      size='small'
      color='inherit'
      onClick={onShowHil}
      startIcon={<Icon icon='mdi:clipboard-list' />}
    >
      {t('aircraft.hil.showList')}
    </Button>
  )

  const openDefectLinks = openDefects.map((defect) => (
    <Link
      key={defect.defectId}
      component='button'
      type='button'
      color='inherit'
      onClick={() => handleOpenDefect(defect)}
      variant='body2'
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textAlign: 'left' }}
    >
      <Icon icon='mdi:book-open-page-variant' width={16} />
      {t('aircraft.hil.openLogbook', {
        ajlbSeqNo: defect.ajlbSeqNo,
        description: defect.description,
      })}
    </Link>
  ))

  if (!isGrounded) {
    return (
      <Alert severity='warning' sx={{ mb: 2 }} action={openHilButton}>
        {t('aircraft.hil.activeItems', { count: hil.length })}
      </Alert>
    )
  }

  return (
    <Alert
      severity='error'
      variant='filled'
      icon={<Icon icon='mdi:airplane-off' width={24} />}
      sx={{ mb: 2 }}
      action={openHilButton}
    >
      <AlertTitle sx={{ fontWeight: 'bold' }}>{t('aircraft.hil.grounded')}</AlertTitle>
      <Stack>
        {openDefectCount > 0 && (
          <Typography variant='body2'>
            {t('aircraft.hil.groundedByDefects', { count: openDefectCount })}
          </Typography>
        )}
        {openDefectLinks}
        {overdueHilCount > 0 && (
          <Typography variant='body2'>
            {t('aircraft.hil.groundedByOverdueHil', { count: overdueHilCount })}
          </Typography>
        )}
        {hil.length > 0 && (
          <Typography variant='body2'>
            {t('aircraft.hil.activeItems', { count: hil.length })}
          </Typography>
        )}
      </Stack>
    </Alert>
  )
}
