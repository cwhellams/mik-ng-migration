import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Box, Breadcrumbs, Button, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router'
import dayjs from 'dayjs'
import { FlightLog, type FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { AircraftListResponse } from '@mik/contracts/aircrafts'
import { MemberListResponse } from '@mik/contracts/members'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { FlightLogEntryWizard } from './wizard/FlightLogEntryWizard'
import { ReviewStep } from './wizard/steps/ReviewStep'
import type { WizardStep } from './wizard/useWizardSteps'
import { endpoints } from '../../api/endpoints'

interface Props {
  onSwitchToClassicForm: () => void
}

// Mobile view for an already-saved flight: shows the wizard's review card in a
// read-only form (matching what was seen when the entry was first accepted) with a
// single Edit action, instead of dropping straight into the huge classic form.
export const MobileFlightLogView = ({ onSwitchToClassicForm }: Props) => {
  const { t } = useTranslation()
  const { flightId } = useParams()
  const location = useLocation()
  const source = `${location.state}`.startsWith('/books')
    ? t('flightLog.logbooks.ajlb')
    : t('flightLog.title')

  const { data, isLoading, error, mutate } = useApi<FlightLog>({
    url: `v1/flight-logs/${flightId}`,
  })
  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })
  const { data: memberList } = useApi<MemberListResponse>(
    { url: endpoints.members.root, params: { isMembershipApproved: true } },
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  )

  const [editing, setEditing] = useState(false)
  const [editStep, setEditStep] = useState<WizardStep | undefined>(undefined)

  const backLink = `/logs${location.state ?? ''}#${flightId}`

  // Read-only: this form instance is never submitted, just used to drive ReviewStep's
  // display via `watch` (and to satisfy its WizardFormProps shape).
  const {
    control,
    watch,
    setValue,
    getValues,
    trigger,
    register,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FlightLogUpsertRequest>({
    values: data,
  })

  const aircraft = aircraftData?.aircrafts.find(
    (a) => a.registration === data?.aircraftRegistration,
  )

  if (editing && data && flightId) {
    return (
      <FlightLogEntryWizard
        flightId={flightId}
        initialData={data}
        initialStep={editStep}
        onSwitchToClassicForm={onSwitchToClassicForm}
        onClose={() => {
          setEditing(false)
          void mutate()
        }}
      />
    )
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Breadcrumbs sx={{ my: 2 }}>
        <Link to={backLink}>{source}</Link>
        <Typography sx={{ color: 'text.primary' }}>{t('flightLog.existingEntry')}</Typography>
      </Breadcrumbs>
      <Title label={t('flightLog.existingEntry')} />
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ReviewStep
            watch={watch}
            memberList={memberList?.members ?? []}
            aircraft={aircraft}
            flightDate={dayjs.unix(Number(data.offBlockTimeEpoch)).utc().startOf('day')}
            onEditSection={(step) => {
              setEditStep(step)
              setEditing(true)
            }}
            isEditing
            acTotalFlightTimeAfter={data.acTotalFlightTime}
            originalTakeoffTimeEpoch={data.takeoffTimeEpoch}
            originalLandingTimeEpoch={data.landingTimeEpoch}
            control={control}
            setValue={setValue}
            getValues={getValues}
            trigger={trigger}
            register={register}
            setError={setError}
            clearErrors={clearErrors}
            errors={errors}
          />
          <Button
            fullWidth
            variant='contained'
            startIcon={<Icon icon='mdi:pencil' />}
            onClick={() => {
              setEditStep(undefined)
              setEditing(true)
            }}
            sx={{ minHeight: 44 }}
          >
            {t('general.edit')}
          </Button>
        </Box>
      )}
    </RemoteContent>
  )
}
