import { Alert, Box, Paper, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { EditButton } from '../../../../components/EditButton'
import { useTimezone } from '../../../../hooks/useTimezone'
import type { Aircraft } from '@backend/routes/aircrafts/models'
import type { MemberList } from '@backend/routes/members/models'
import type { WizardFormProps } from '../types'
import type { WizardStep } from '../useWizardSteps'

interface Props extends WizardFormProps {
  memberList: MemberList[]
  aircraft: Aircraft | undefined
  flightDate: dayjs.Dayjs
  onEditSection: (step: WizardStep) => void
}

// Parses the server's "H:MM" total-time string into minutes; returns null if missing
// or malformed rather than guessing, since this feeds a legal-logbook figure.
const parseHoursMinutes = (value: string | undefined): number | null => {
  if (!value) return null
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

const ReviewSection = ({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) => (
  <Paper variant='outlined' sx={{ p: 2 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Typography variant='subtitle2'>{title}</Typography>
      <EditButton title={title} onClick={onEdit} width={18} />
    </Box>
    {children}
  </Paper>
)

// Compact "day-of-month centered, month above, year below" date block — matches the
// logbook list's FlightLogDate layout, sized for the highlight card's dark background.
const CompactDate = ({ date }: { date: dayjs.Dayjs | undefined }) => (
  <Box sx={{ textAlign: 'center' }}>
    <Typography sx={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.8, lineHeight: 1.2 }}>
      {date ? date.format('MMM') : ''}
    </Typography>
    <Typography sx={{ fontSize: 32, fontWeight: 'bold', lineHeight: 1 }}>
      {date ? date.format('D') : '—'}
    </Typography>
    <Typography sx={{ fontSize: 11, opacity: 0.8, lineHeight: 1.2 }}>
      {date ? date.format('YYYY') : ''}
    </Typography>
  </Box>
)

export const ReviewStep = ({ watch, memberList, aircraft, flightDate, onEditSection }: Props) => {
  const { t } = useTranslation()
  const { formatTime } = useTimezone()

  const [
    aircraftRegistration,
    picMemberId,
    offBlockTimeEpoch,
    takeoffTimeEpoch,
    landingTimeEpoch,
    onBlockTimeEpoch,
    departureAirport,
    arrivalAirport,
    numberOfLandings,
    nightFlyingMins,
    numberOfNightLandings,
    instrumentFlyingMins,
    fuelUpliftLitres,
    fuelRemainingLitres,
    oilUpliftLitres,
    incidentOrObservations,
    personalRemarks,
    billingRemarks,
  ] = watch([
    'aircraftRegistration',
    'picMemberId',
    'offBlockTimeEpoch',
    'takeoffTimeEpoch',
    'landingTimeEpoch',
    'onBlockTimeEpoch',
    'departureAirport',
    'arrivalAirport',
    'numberOfLandings',
    'nightFlyingMins',
    'numberOfNightLandings',
    'instrumentFlyingMins',
    'fuelUpliftLitres',
    'fuelRemainingLitres',
    'oilUpliftLitres',
    'incidentOrObservations',
    'personalRemarks',
    'billingRemarks',
  ])

  const memberLastName = (id: string | null | undefined) => {
    if (!id) return null
    const member = memberList.find((m) => m.memberId === id)
    return member ? member.last : id
  }

  const formatEpoch = (epoch: string | undefined) =>
    epoch ? formatTime(dayjs.unix(Number(epoch)).toISOString()) : '—'

  const formatMins = (mins: number | null | undefined) => {
    const total = mins ?? 0
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }

  const hasNightOrIfr =
    (nightFlyingMins ?? 0) > 0 ||
    (numberOfNightLandings ?? 0) > 0 ||
    (instrumentFlyingMins ?? 0) > 0

  const flightMins =
    takeoffTimeEpoch && landingTimeEpoch
      ? Math.round((Number(landingTimeEpoch) - Number(takeoffTimeEpoch)) / 60)
      : null
  const blockMins =
    offBlockTimeEpoch && onBlockTimeEpoch
      ? Math.round((Number(onBlockTimeEpoch) - Number(offBlockTimeEpoch)) / 60)
      : null
  const currentTotalMins = parseHoursMinutes(aircraft?.status?.totalTime)
  const newTotalMins =
    currentTotalMins != null && flightMins != null ? currentTotalMins + flightMins : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper elevation={3} sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr 1fr',
            columnGap: 3,
            rowGap: 1,
            mb: 1.5,
            alignItems: 'start',
          }}
        >
          <CompactDate date={flightDate} />
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.aircraft')}
            </Typography>
            <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
              {aircraftRegistration || '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.crews.pic')}
            </Typography>
            <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
              {memberLastName(picMemberId) || '—'}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            mb: 1,
          }}
        >
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.takeoffTime')}
            </Typography>
            <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
              {formatEpoch(takeoffTimeEpoch)}
            </Typography>
            <Typography variant='caption' sx={{ opacity: 0.8, display: 'block' }}>
              {departureAirport || '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.landingTime')}
            </Typography>
            <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
              {formatEpoch(landingTimeEpoch)}
            </Typography>
            <Typography variant='caption' sx={{ opacity: 0.8, display: 'block' }}>
              {arrivalAirport || '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.wizard.ajlbSummary.flightTime')}
            </Typography>
            <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
              {flightMins != null ? formatMins(flightMins) : '—'}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
          }}
        >
          <Box>
            <Typography
              variant='caption'
              sx={{ opacity: 0.8, display: 'block', minHeight: '2.2em', lineHeight: 1.1 }}
            >
              {t('flightLog.wizard.ajlbSummary.currentTotal')}
            </Typography>
            <Typography variant='h4' sx={{ fontWeight: 'bold' }}>
              {currentTotalMins != null ? formatMins(currentTotalMins) : '—'}
            </Typography>
          </Box>
          <Box>
            <Typography
              variant='caption'
              sx={{ opacity: 0.8, display: 'block', minHeight: '2.2em', lineHeight: 1.1 }}
            >
              {t('flightLog.wizard.ajlbSummary.newTotal')}
            </Typography>
            <Typography variant='h4' sx={{ fontWeight: 'bold' }}>
              {newTotalMins != null ? formatMins(newTotalMins) : '—'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.35)', my: 1.5 }} />

        <Alert severity='warning' sx={{ mb: 1.5, py: 0 }}>
          {t('flightLog.wizard.ajlbSummary.verifyPrompt')}
        </Alert>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.wizard.ajlbSummary.landings')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {numberOfLandings ?? '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.fuelUpliftLitres')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {fuelUpliftLitres ?? t('common.none')}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.fuelRemainingLitres')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {Math.round(fuelRemainingLitres ?? 0)}L
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.oilUpliftLitres')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {oilUpliftLitres ?? 0}L
            </Typography>
          </Box>
        </Box>

        {hasNightOrIfr && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1 }}>
            {((nightFlyingMins ?? 0) > 0 || (numberOfNightLandings ?? 0) > 0) && (
              <>
                <Box>
                  <Typography variant='caption' sx={{ opacity: 0.8 }}>
                    {t('flightLog.nightFlyingMins')}
                  </Typography>
                  <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                    {formatMins(nightFlyingMins)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant='caption' sx={{ opacity: 0.8 }}>
                    {t('flightLog.numberOfNightLandings')}
                  </Typography>
                  <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                    {numberOfNightLandings ?? 0}
                  </Typography>
                </Box>
              </>
            )}
            {(instrumentFlyingMins ?? 0) > 0 && (
              <Box>
                <Typography variant='caption' sx={{ opacity: 0.8 }}>
                  {t('flightLog.instrumentFlyingMins')}
                </Typography>
                <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                  {formatMins(instrumentFlyingMins)}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ borderTop: '1px solid', borderColor: 'rgba(255,255,255,0.35)', my: 1.5 }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.offBlockTime')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {formatEpoch(offBlockTimeEpoch)}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.onBlockTime')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {formatEpoch(onBlockTimeEpoch)}
            </Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              {t('flightLog.blockTime')}
            </Typography>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              {blockMins != null ? formatMins(blockMins) : '—'}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {(incidentOrObservations || personalRemarks || billingRemarks) && (
        <ReviewSection
          title={t('flightLog.wizard.step.notes')}
          onEdit={() => onEditSection('notes')}
        >
          {incidentOrObservations && (
            <Typography variant='body2'>{incidentOrObservations}</Typography>
          )}
          {personalRemarks && <Typography variant='body2'>{personalRemarks}</Typography>}
          {billingRemarks && <Typography variant='body2'>{billingRemarks}</Typography>}
        </ReviewSection>
      )}
    </Box>
  )
}
