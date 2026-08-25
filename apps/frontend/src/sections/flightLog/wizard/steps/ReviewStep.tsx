import { Alert, Box, Paper, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { EditButton } from '@mik/ui/components/EditButton'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import type { Aircraft } from '@mik/contracts/aircrafts'
import type { MemberList } from '@mik/contracts/members'
import type { LiquidRecordWithLock } from '@mik/contracts/liquid'
import { describeRecord } from '../../../liquid/liquidHelpers'
import type { WizardFormProps } from '../types'
import type { WizardStep } from '../useWizardSteps'

interface Props extends WizardFormProps {
  memberList: MemberList[]
  aircraft: Aircraft | undefined
  flightDate: dayjs.Dayjs
  /**
   * Omitted when the card is showing a flight the viewer may read but not change — a
   * crew member on someone else's entry (#1019). The per-section edit affordance then
   * renders disabled rather than leading into a wizard whose save would be refused.
   */
  onEditSection?: (step: WizardStep) => void
  // When editing an existing entry, the aircraft's running total as it stood right
  // after this flight (stored on the entry itself) — used instead of the aircraft's
  // live present-day total, which has no relation to this specific historical flight.
  isEditing: boolean
  acTotalFlightTimeAfter?: string | null
  // The takeoff/landing times as originally recorded on the entry (before any edits
  // made in this wizard session) — needed to back out the fixed pre-flight total from
  // acTotalFlightTimeAfter regardless of how the user has since edited the times.
  originalTakeoffTimeEpoch?: string | null
  originalLandingTimeEpoch?: string | null
  // A record picked/created for this flight but not yet linked -- linking only
  // happens after save, once a real flightId exists (see FlightLogEntryWizard's
  // doSave). Takes priority over the raw litres figure, which stays `null` while
  // a record is pending.
  pendingFuelRecord?: LiquidRecordWithLock
  pendingOilRecord?: LiquidRecordWithLock
}

// Parses the server's "H:MM" total-time string into minutes; returns null if missing
// or malformed rather than guessing, since this feeds a legal-logbook figure.
const parseHoursMinutes = (value: string | null | undefined): number | null => {
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
  onEdit?: () => void
  children: React.ReactNode
}) => (
  <Paper variant='outlined' sx={{ p: 2 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Typography variant='subtitle2'>{title}</Typography>
      <EditButton title={title} onClick={onEdit} width={18} viewOnly={onEdit === undefined} />
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

export const ReviewStep = ({
  watch,
  memberList,
  aircraft,
  flightDate,
  onEditSection,
  isEditing,
  acTotalFlightTimeAfter,
  originalTakeoffTimeEpoch,
  originalLandingTimeEpoch,
  pendingFuelRecord,
  pendingOilRecord,
}: Props) => {
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
  // Editing an existing entry: anchor to the historical total stored on the entry
  // itself (the total right after this flight), not the aircraft's live present-day
  // total. The pre-flight baseline is backed out using the *originally recorded*
  // flight duration (not the current, possibly-just-edited one) so it stays fixed
  // regardless of edits, and the displayed "new total" is then that fixed baseline
  // plus the current flight duration — reflecting any edit the user just made.
  const historicalNewTotalMins = isEditing ? parseHoursMinutes(acTotalFlightTimeAfter) : null
  const originalFlightMins =
    originalTakeoffTimeEpoch && originalLandingTimeEpoch
      ? Math.round((Number(originalLandingTimeEpoch) - Number(originalTakeoffTimeEpoch)) / 60)
      : null
  const liveCurrentTotalMins = parseHoursMinutes(aircraft?.status?.totalTime)

  // Guard against the subtraction going negative rather than rendering a garbled
  // "-1:-10"-style string.
  const rawCurrentTotalMins =
    isEditing && historicalNewTotalMins != null && originalFlightMins != null
      ? historicalNewTotalMins - originalFlightMins
      : isEditing
        ? null
        : liveCurrentTotalMins
  const currentTotalMins =
    rawCurrentTotalMins != null && rawCurrentTotalMins < 0 ? null : rawCurrentTotalMins
  const newTotalMins =
    currentTotalMins != null && flightMins != null
      ? currentTotalMins + flightMins
      : isEditing
        ? historicalNewTotalMins
        : null

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
              {pendingFuelRecord
                ? describeRecord(pendingFuelRecord, t)
                : fuelUpliftLitres
                  ? `${fuelUpliftLitres}L`
                  : t('common.none')}
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
              {pendingOilRecord
                ? describeRecord(pendingOilRecord, t)
                : oilUpliftLitres
                  ? `${oilUpliftLitres}L`
                  : t('common.none')}
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
          onEdit={onEditSection && (() => onEditSection('notes'))}
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
