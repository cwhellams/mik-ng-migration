import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { useTranslation } from 'react-i18next'
import { FormTitle } from '@mik/ui/components/FormTitle'
import {
  type ApplicationData,
  PilotLicenceType,
  AircraftRating,
  PrimaryMotivation,
} from '@mik/contracts/members'
import { ReactNode } from 'react'

const pilotLicenceKey: Record<PilotLicenceType, string> = {
  [PilotLicenceType.LAPL_A]: 'register.pilotLicence_LAPL_A',
  [PilotLicenceType.PPL_A]: 'register.pilotLicence_PPL_A',
  [PilotLicenceType.CPL_A]: 'register.pilotLicence_CPL_A',
  [PilotLicenceType.ATPL_A]: 'register.pilotLicence_ATPL_A',
  [PilotLicenceType.OTHER]: 'register.pilotLicence_other',
}

const ratingKey: Record<AircraftRating, string> = {
  [AircraftRating.SEP_LAND]: 'register.rating_SEP_LAND',
  [AircraftRating.IR]: 'register.rating_IR',
  [AircraftRating.NF]: 'register.rating_NF',
  [AircraftRating.OTHER]: 'register.rating_other',
}

const motivationKey: Record<PrimaryMotivation, string> = {
  [PrimaryMotivation.FLY]: 'register.motivation_fly',
  [PrimaryMotivation.LEARN_TO_FLY]: 'register.motivation_learnToFly',
  [PrimaryMotivation.COMMUNITY]: 'register.motivation_community',
  [PrimaryMotivation.OTHER]: 'register.motivation_other',
}

// Compact side-by-side row for short values
const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
    <Typography
      variant='body2'
      sx={{
        color: 'text.secondary',
        minWidth: 180,
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
    <Box sx={{ flex: 1 }}>{children}</Box>
  </Box>
)

// Stacked label-above-text layout for long answers
const TextBlock = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography
      variant='body2'
      sx={{
        color: 'text.secondary',
        mb: 0.5,
      }}
    >
      {label}
    </Typography>
    <Typography
      variant='body2'
      sx={{
        whiteSpace: 'pre-wrap',
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
      }}
    >
      {value}
    </Typography>
  </Box>
)

const SectionHeader = ({ label }: { label: string }) => (
  <Typography
    variant='subtitle2'
    sx={{
      color: 'text.secondary',
      mt: 1,
    }}
  >
    {label}
  </Typography>
)

interface Props {
  applicationData: ApplicationData
  isMembershipApproved: boolean
}

export const ApplicationDataCard = ({ applicationData, isMembershipApproved }: Props) => {
  const { t } = useTranslation()

  const {
    totalFlightHours,
    aircraftTypesFlown,
    pilotLicenceType,
    pilotLicenceTypeOther,
    ratings,
    ratingsOther,
    primaryMotivation,
    motivationOther,
    coverLetter,
    voluntaryWork,
    otherAviationClubs,
    accidentHistory,
    accidentHistoryDetails,
    criminalRecord,
    criminalRecordDetails,
    gdprAccepted,
  } = applicationData

  return (
    <Accordion
      defaultExpanded={!isMembershipApproved}
      disableGutters
      sx={{ borderRadius: 1, '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <FormTitle
          title={t('member.applicationData.title')}
          icon='mdi:clipboard-account'
          sx={{ mb: 0 }}
        />
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pb: 3 }}>
        <Stack spacing={2} divider={<Divider />}>
          {/* Flight experience */}
          <Stack spacing={1.5}>
            <SectionHeader label={t('register.sectionFlightExperience')} />

            <InfoRow label={t('register.totalFlightHours')}>
              <Typography variant='body2'>
                {totalFlightHours !== undefined ? String(totalFlightHours) : '—'}
              </Typography>
            </InfoRow>

            <InfoRow label={t('register.aircraftTypesFlown')}>
              <Typography variant='body2'>{aircraftTypesFlown || '—'}</Typography>
            </InfoRow>

            <InfoRow label={t('register.pilotLicenceType')}>
              <Typography variant='body2'>
                {pilotLicenceType ? t(pilotLicenceKey[pilotLicenceType]) : '—'}
                {pilotLicenceType === PilotLicenceType.OTHER && pilotLicenceTypeOther && (
                  <Typography
                    component='span'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {' '}
                    ({pilotLicenceTypeOther})
                  </Typography>
                )}
              </Typography>
            </InfoRow>

            <InfoRow label={t('register.ratings')}>
              {ratings && ratings.length > 0 ? (
                <Stack
                  direction='row'
                  spacing={0.5}
                  useFlexGap
                  sx={{
                    flexWrap: 'wrap',
                  }}
                >
                  {ratings.map((r) => (
                    <Chip key={r} label={t(ratingKey[r])} size='small' />
                  ))}
                  {ratings.includes(AircraftRating.OTHER) && ratingsOther && (
                    <Typography
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                        alignSelf: 'center',
                      }}
                    >
                      ({ratingsOther})
                    </Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant='body2'>—</Typography>
              )}
            </InfoRow>
          </Stack>

          {/* Motivation & background */}
          <Stack spacing={1.5}>
            <SectionHeader label={t('register.sectionMotivation')} />

            <InfoRow label={t('register.primaryMotivation')}>
              <Typography variant='body2'>
                {t(motivationKey[primaryMotivation])}
                {primaryMotivation === PrimaryMotivation.OTHER && motivationOther && (
                  <Typography
                    component='span'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {' '}
                    ({motivationOther})
                  </Typography>
                )}
              </Typography>
            </InfoRow>

            <TextBlock label={t('member.applicationData.coverLetter')} value={coverLetter} />

            <TextBlock label={t('member.applicationData.voluntaryWork')} value={voluntaryWork} />

            {otherAviationClubs && (
              <TextBlock
                label={t('member.applicationData.otherAviationClubs')}
                value={otherAviationClubs}
              />
            )}
          </Stack>

          {/* Declarations */}
          <Stack spacing={1.5}>
            <SectionHeader label={t('register.sectionDeclarations')} />

            <InfoRow label={t('member.applicationData.accidentHistory')}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {accidentHistory ? (
                  <CancelIcon fontSize='small' color='error' />
                ) : (
                  <CheckCircleIcon fontSize='small' color='success' />
                )}
                <Typography variant='body2'>
                  {accidentHistory ? t('register.yes') : t('register.no')}
                </Typography>
              </Box>
            </InfoRow>

            {accidentHistory && accidentHistoryDetails && (
              <TextBlock
                label={t('member.applicationData.accidentHistoryDetails')}
                value={accidentHistoryDetails}
              />
            )}

            <InfoRow label={t('member.applicationData.criminalRecord')}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {criminalRecord ? (
                  <CancelIcon fontSize='small' color='error' />
                ) : (
                  <CheckCircleIcon fontSize='small' color='success' />
                )}
                <Typography variant='body2'>
                  {criminalRecord ? t('register.yes') : t('register.no')}
                </Typography>
              </Box>
            </InfoRow>

            {criminalRecord && criminalRecordDetails && (
              <TextBlock
                label={t('member.applicationData.criminalRecordDetails')}
                value={criminalRecordDetails}
              />
            )}

            <InfoRow label={t('member.applicationData.gdprAccepted')}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckCircleIcon fontSize='small' color={gdprAccepted ? 'success' : 'disabled'} />
                <Typography variant='body2'>
                  {gdprAccepted ? t('register.yes') : t('register.no')}
                </Typography>
              </Box>
            </InfoRow>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
