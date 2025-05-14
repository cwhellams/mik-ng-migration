import {
  Grid,
  TextField,
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Autocomplete,
} from '@mui/material'
import {
  Control,
  Controller,
  FieldErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { FlightLogMemberRequest } from '@backend/routes/flight-log/models'
import { MemberListResponse } from '@backend/routes/members/models'
import useApi from '../../../hooks/useApi'
import { useMe } from '../../../hooks/useMe'

interface FlightCrewProps {
  flightType: string
  register: UseFormRegister<FlightLogMemberRequest>
  control: Control<FlightLogMemberRequest>
  getValues: UseFormGetValues<FlightLogMemberRequest>
  setValue: UseFormSetValue<FlightLogMemberRequest>
  errors: FieldErrors<FlightLogMemberRequest>
}

// Crew member types
const CREW_ROLES = [
  { value: 'STU', label: 'Student' },
  { value: 'FI', label: 'Flight Instructor' },
  { value: 'FE', label: 'Flight Examiner' },
  { value: 'OBS', label: 'Observer' },
]

type CrewSlot = 'pic' | 'crew2' | 'crew3' | 'crew4'

type CrewMember = {
  value: string
  label: string
  role: string
}

const FlightCrew = ({
  flightType,
  control,
  getValues,
  setValue,
  errors,
}: FlightCrewProps) => {
  const { t } = useTranslation()
  const [crewCount, setCrewCount] = useState(1)

  // crew positions currently in use
  const crewSlots = (['pic', 'crew2', 'crew3', 'crew4'] as CrewSlot[]).slice(
    0,
    crewCount
  )

  // Check if flight type is one that only needs a pilot
  const singlePilotTypes = ['HAR', 'MAT', 'SII', 'KOE']
  const isSinglePilotFlight = singlePilotTypes.includes(flightType)
  const minimumCrewCount = isSinglePilotFlight ? 1 : 2

  const handleAddCrew = () => setCrewCount((c) => c + 1)
  const handleRemoveCrew = () => setCrewCount((c) => c - 1)

  const { me } = useMe()

  const { data: memberList } = useApi<MemberListResponse>(
    {
      url: 'v1/members',
      params: {
        isMembershipApproved: true,
      },
    },
    {
      // members do not change while adding a flight
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const self: CrewMember = {
    value: me?.memberId ?? 'SELF',
    label: 'SELF',
    role: 'SELF',
  }

  const members: CrewMember[] = [self]
    .concat(
      memberList?.members
        ?.filter((m) => m.roles.includes('INSTRUCTOR'))
        ?.map((m) => ({
          value: m.memberId,
          label: `${m.first} ${m.last}`,
          role: 'INSTRUCTOR',
        })) ?? []
    )
    .concat(
      memberList?.members
        ?.filter((m) => !m.roles.includes('INSTRUCTOR'))
        ?.map((m) => ({
          value: m.memberId,
          label: `${m.first} ${m.last}`,
          role: 'MEMBER',
        })) ?? []
    )

  useEffect(() => {
    if (isSinglePilotFlight) {
      // single pilot operations
      setValue('picRole', 'PIC')
      setCrewCount(1)
    } else if (crewCount < 2) {
      // add second crew
      setCrewCount(2)
      setValue('picRole', 'STU')
    }
  }, [isSinglePilotFlight, crewCount, setValue, me, getValues])

  if (!flightType) {
    return (
      <Grid size={{ xs: 12 }}>
        <Box
          sx={{
            p: 3,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            textAlign: 'center',
            bgcolor: 'background.paper',
          }}
        >
          <Icon
            icon='mdi:account-question'
            style={{ fontSize: 40, opacity: 0.5, marginBottom: 8 }}
          />
          <Typography color='text.secondary'>
            {t(
              'flightLog.selectFlightTypeCrew',
              'Please select a flight type to continue with crew information'
            )}
          </Typography>
        </Box>
      </Grid>
    )
  }

  return (
    <Grid container spacing={2}>
      {crewSlots.map((slot, index) => {
        const crewId = `${slot}MemberId` as keyof FlightLogMemberRequest
        const crewType = `${slot}Role` as keyof FlightLogMemberRequest

        return (
          <Grid key={slot} size={{ xs: 12 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: isSinglePilotFlight ? 12 : 8 }}>
                <Controller
                  name={crewId}
                  control={control}
                  rules={{ required: true }}
                  render={({ field: { onChange, value } }) => (
                    <Autocomplete
                      options={members}
                      value={
                        members.find((member) => member.value === value) ?? null
                      }
                      groupBy={(option) => option.role}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={t(`flightLog.crews.${slot}`)}
                          placeholder={t('flightLog.selectCrew')}
                          margin='normal'
                          slotProps={{
                            inputLabel: {
                              shrink: true, // Keeps the label above even when the field is empty
                            },
                          }}
                        />
                      )}
                      onChange={(_e, crew) => {
                        console.log(value, crew)
                        onChange(crew?.value ?? '')

                        if (flightType == 'KOU' || flightType == 'TAR') {
                          // default roles for school flights

                          if (crew?.role == 'INSTRUCTOR') {
                            // instructor has been selected
                            setValue(crewType, 'FI')

                            // put self as a student to the other position
                            setValue(
                              slot == 'pic' ? 'crew2MemberId' : 'picMemberId',
                              me?.memberId ?? ''
                            )
                            setValue(
                              slot == 'pic' ? 'crew2Role' : 'picRole',
                              'STU'
                            )
                          } else if (crew?.role == 'SELF') {
                            // self has been selected
                            setValue(crewType, 'STU')
                          }
                        }
                      }}
                    />
                  )}
                />
              </Grid>
              {!isSinglePilotFlight && (
                <Grid size={{ xs: 4 }}>
                  <Controller
                    name={crewType}
                    control={control}
                    defaultValue={'STU'}
                    render={({ field }) => (
                      <FormControl
                        fullWidth
                        error={!!errors[crewType]}
                        margin='normal'
                      >
                        <InputLabel>{t('flightLog.duty')}</InputLabel>
                        <Select {...field} label={t('flightLog.duty')}>
                          {CREW_ROLES.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              {type.value} - {type.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {errors[crewType] && (
                          <FormHelperText>
                            {errors[crewType].message?.toString()}
                          </FormHelperText>
                        )}
                      </FormControl>
                    )}
                  />
                </Grid>
              )}
            </Grid>

            {index >= minimumCrewCount && index == crewSlots.length - 1 && (
              // only last crew slot can be removed
              <Grid
                size={{ xs: 12 }}
                sx={{ display: 'flex', alignItems: 'center' }}
              >
                <Button
                  color='error'
                  onClick={handleRemoveCrew}
                  sx={{ minWidth: 'auto', p: 1 }}
                >
                  <Icon icon='mdi:close' />
                </Button>
              </Grid>
            )}
          </Grid>
        )
      })}

      {!isSinglePilotFlight && crewCount < 4 && (
        <Grid size={{ xs: 12 }}>
          <Box>
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:account-plus' />}
              onClick={handleAddCrew}
              fullWidth
              sx={{ mt: 1 }}
            >
              {t('flightLog.addCrew')}
            </Button>
          </Box>
        </Grid>
      )}
    </Grid>
  )
}

export default FlightCrew
