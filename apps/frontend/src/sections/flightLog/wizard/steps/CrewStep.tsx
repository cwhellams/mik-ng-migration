import { Box } from '@mui/material'
import FlightCrew from '../../components/FlightCrew'
import { PersonsOnBoard } from '../../components/PersonsOnBoard'
import { FlightType } from '@backend/routes/flight-log/models'
import type { Aircraft } from '@backend/routes/aircrafts/models'
import type { Member } from '@backend/routes/members/models'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  aircraft: Aircraft | undefined
  me: Member | null | undefined
}

export const CrewStep = ({ control, watch, setValue, trigger, register, aircraft, me }: Props) => {
  const flightType = watch('flightType')
  const crew = watch(['picMemberId', 'crew2MemberId', 'crew3MemberId', 'crew4MemberId'])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <FlightCrew
        flightType={flightType}
        maximumCrewCount={aircraft?.seats ?? 0}
        control={control}
        setValue={setValue}
        trigger={trigger}
        watch={watch}
        register={register}
        defaultInstructorMemberId={
          flightType === FlightType.SCHOOL ? me?.defaultInstructorMemberId : undefined
        }
      />
      <PersonsOnBoard control={control} seats={aircraft?.seats ?? 0} crew={crew.slice(1)} />
    </Box>
  )
}
