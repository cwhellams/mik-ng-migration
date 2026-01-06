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
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlightLogUpsertRequest,
  FlightType,
} from '@backend/routes/flight-log/models'
import { MemberListResponse } from '@backend/routes/members/models'
import useApi from '../../../hooks/useApi'
import { useMe } from '../../../hooks/useMe'

interface FlightCrewProps {
  flightType: FlightType
  maximumCrewCount: number
  register: UseFormRegister<FlightLogUpsertRequest>
  control: Control<FlightLogUpsertRequest>
  setValue?: UseFormSetValue<FlightLogUpsertRequest>
  watch: UseFormWatch<FlightLogUpsertRequest>
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
  maximumCrewCount,
  control,
  setValue,
  watch,
}: FlightCrewProps) => {
  const { t } = useTranslation()

  const isEditable = !!setValue

  // crew member ids currently in use
  const crewMembers = watch([
    'picMemberId',
    'crew2MemberId',
    'crew3MemberId',
    'crew4MemberId',
  ])

  const slots: CrewSlot[] = ['pic', 'crew2', 'crew3', 'crew4']

  // Check if flight type can only have single pilot
  const singlePilotTypes = [
    FlightType.PRIVATE,
    FlightType.XC,
    FlightType.FERRY,
    FlightType.TEST_FLIGHT,
  ]
  // Check if flight type is one that must have a crew
  const multiPilotTypes = [FlightType.CHECKFLIGHT]

  const isSinglePilotFlight = singlePilotTypes.includes(flightType)
  const minimumCrewCount = multiPilotTypes.includes(flightType) ? 2 : 1

  const [crewCount, setCrewCount] = useState(minimumCrewCount)

  const handleAddCrew = () => setCrewCount((c) => c + 1)
  const handleRemoveCrew = (slot: CrewSlot) => {
    setCrewCount((c) => c - 1)
    cleanCrew(slot)
  }

  const cleanCrew = useCallback(
    (slot: CrewSlot) => {
      setValue?.(`${slot}MemberId` as keyof FlightLogUpsertRequest, null)
      setValue?.(`${slot}Role` as keyof FlightLogUpsertRequest, null)
    },
    [setValue]
  )

  const getDefaultMultiRole = (crew: CrewMember) => {
    switch (crew.role) {
      case 'INSTRUCTOR':
        return 'FI'
      case 'EXAMINER':
        return 'FE'
      case 'SELF':
        return 'STU'
      default:
        return 'OBS'
    }
  }

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

  // list of all members, including self
  const members: CrewMember[] = useMemo(
    () =>
      [
        {
          value: me?.memberId ?? '',
          label: 'SELF',
          role: 'SELF',
        },
      ]
        .concat(
          memberList?.members
            ?.filter((m) => m.roles.includes('EXAMINER'))
            ?.map((m) => ({
              value: m.memberId,
              label: `${m.first} ${m.last}`,
              role: 'EXAMINER',
            })) ?? []
        )
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
            ?.filter(
              (m) =>
                !m.roles.includes('INSTRUCTOR') && !m.roles.includes('EXAMINER')
            )
            ?.map((m) => ({
              value: m.memberId,
              label: `${m.first} ${m.last}`,
              role: 'MEMBER',
            })) ?? []
        ),
    [me, memberList]
  )

  // change between single and multi-pilot operations
  useEffect(() => {
    const filledCrewCount = crewMembers.filter(Boolean).length
    const picRole = watch('picRole')

    if (isSinglePilotFlight) {
      if (picRole !== 'PIC') {
        setValue?.('picRole', 'PIC')
      }
      if (crewCount > 1) {
        setCrewCount(1)
      }
      if (filledCrewCount > 1) {
        // clean up hidden crew members
        cleanCrew('crew2')
        cleanCrew('crew3')
        cleanCrew('crew4')
      }
    } else {
      if (picRole === 'PIC') {
        // PIC is not valid role for multi-pilot flights
        const pic = members.find((m) => m.value === crewMembers[0])
        if (pic) {
          setValue?.('picRole', getDefaultMultiRole(pic))
        }
      }

      // make sure all crew slots are shown after remote data is loaded
      const min = Math.max(filledCrewCount, minimumCrewCount)
      if (crewCount < min) {
        setCrewCount(min)
      }
      const pob = watch('personsOnBoard')
      if (pob < crewCount) {
        // if persons on board is less than crew count, set it to crew count
        setValue?.('personsOnBoard', crewCount)
      }
    }
  }, [
    isSinglePilotFlight,
    minimumCrewCount,
    maximumCrewCount,
    crewCount,
    setValue,
    crewMembers,
    members,
    cleanCrew,
    watch,
  ])

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
      {slots.slice(0, crewCount).map((slot, index, { length }) => {
        const crewId = `${slot}MemberId` as keyof FlightLogUpsertRequest
        const crewRole = `${slot}Role` as keyof FlightLogUpsertRequest

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
                      disabled={!isEditable}
                      options={members.filter((m) => {
                        // do not allow duplicates
                        const atIndex = crewMembers.findIndex(
                          (id) => id === m.value
                        )
                        return atIndex == index || atIndex == -1
                      })}
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
                              shrink: true,
                            },
                          }}
                        />
                      )}
                      onChange={(_e, crew) => {
                        onChange(crew?.value ?? null)

                        if (crew && !isSinglePilotFlight) {
                          // improve usability by setting default role
                          // based on selected crew member

                          const defaultRole = getDefaultMultiRole(crew)
                          setValue?.(crewRole, defaultRole)

                          if (
                            slot == 'pic' &&
                            (defaultRole == 'FI' || defaultRole == 'FE')
                          ) {
                            // instructor was selected as PIC, add missing self crew
                            if (crewCount < 2) {
                              setCrewCount(2)
                            }
                            if (!crewMembers[1]) {
                              setValue?.('crew2MemberId', me?.memberId ?? '')
                              setValue?.('crew2Role', 'STU')
                            }
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
                    name={crewRole}
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl fullWidth error={!!error} margin='normal'>
                        <InputLabel>{t('flightLog.duty')}</InputLabel>
                        <Select
                          {...field}
                          value={field.value || ''}
                          label={t('flightLog.duty')}
                          disabled={!isEditable}
                        >
                          {CREW_ROLES.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              {type.value} - {type.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {error && (
                          <FormHelperText>
                            {error.message?.toString()}
                          </FormHelperText>
                        )}
                      </FormControl>
                    )}
                  />
                </Grid>
              )}
            </Grid>

            {index >= minimumCrewCount && index == length - 1 && isEditable && (
              // only last crew slot can be removed
              <Grid
                size={{ xs: 12 }}
                sx={{ display: 'flex', alignItems: 'center' }}
              >
                <Button
                  color='error'
                  onClick={() => handleRemoveCrew(slot)}
                  sx={{ minWidth: 'auto', p: 1 }}
                >
                  <Icon icon='mdi:close' />
                </Button>
              </Grid>
            )}
          </Grid>
        )
      })}

      {!isSinglePilotFlight && crewCount < maximumCrewCount && isEditable && (
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
