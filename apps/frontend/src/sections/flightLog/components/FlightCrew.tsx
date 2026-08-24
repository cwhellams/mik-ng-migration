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
  useMediaQuery,
  useTheme,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material'
import {
  Control,
  Controller,
  UseFormRegister,
  UseFormSetValue,
  UseFormTrigger,
  UseFormWatch,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlightLogUpsertRequest, FlightType } from '@mik/contracts/flight-log'
import { MemberListResponse } from '@mik/contracts/members'
import useApi from '@mik/ui/hooks/useApi'
import { useMe } from '@mik/ui/hooks/useMe'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { formatRequiredFieldError, shouldShowFieldError } from '../../../utils/formErrors'
import { endpoints } from '../../../api/endpoints'

interface FlightCrewProps {
  flightType: FlightType
  maximumCrewCount: number
  register: UseFormRegister<FlightLogUpsertRequest>
  control: Control<FlightLogUpsertRequest>
  setValue?: UseFormSetValue<FlightLogUpsertRequest>
  trigger?: UseFormTrigger<FlightLogUpsertRequest>
  watch: UseFormWatch<FlightLogUpsertRequest>
  // When set (multi-pilot flight types only), auto-fills the second crew slot with
  // this instructor + FI duty as soon as it's needed — still freely reassignable
  // through the normal picker, just a starting value (used by the mobile wizard for
  // the member's profile-configured default instructor on school flights).
  defaultInstructorMemberId?: string | null
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
  trigger,
  watch,
  defaultInstructorMemberId,
}: FlightCrewProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'))
  const isSubmitted = useIsFormSubmitted(control)

  const isEditable = !!setValue

  // crew member ids currently in use
  const crewMembers = watch(['picMemberId', 'crew2MemberId', 'crew3MemberId', 'crew4MemberId'])

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
  const [pendingRemoveSlot, setPendingRemoveSlot] = useState<CrewSlot | null>(null)

  const handleAddCrew = () => setCrewCount((c) => c + 1)
  const handleRemoveCrew = (slot: CrewSlot) => {
    setCrewCount((c) => c - 1)
    cleanCrew(slot)
  }
  const confirmRemoveCrew = () => {
    if (pendingRemoveSlot) {
      handleRemoveCrew(pendingRemoveSlot)
      setPendingRemoveSlot(null)
    }
  }

  const cleanCrew = useCallback(
    (slot: CrewSlot) => {
      setValue?.(`${slot}MemberId` as keyof FlightLogUpsertRequest, null)
      setValue?.(`${slot}Role` as keyof FlightLogUpsertRequest, null)
    },
    [setValue],
  )

  // School flights default to instructor-as-PIC/student-as-crew#2; checkflights have
  // no such default but the same swap is just as useful there. Swaps the (member, duty)
  // pair between slot 1 and slot 2, whoever currently occupies them.
  const canSwapCrew =
    isEditable &&
    (flightType === FlightType.SCHOOL || flightType === FlightType.CHECKFLIGHT) &&
    !!crewMembers[0] &&
    !!crewMembers[1]

  const handleSwapCrew = () => {
    const picMemberId = watch('picMemberId')
    const picRole = watch('picRole')
    const crew2MemberId = watch('crew2MemberId')
    const crew2Role = watch('crew2Role')
    // only invoked via canSwapCrew, which guarantees both slots are filled
    setValue?.('picMemberId', crew2MemberId ?? picMemberId)
    setValue?.('picRole', crew2Role ?? picRole)
    setValue?.('crew2MemberId', picMemberId)
    setValue?.('crew2Role', picRole)
    trigger?.(['picMemberId', 'picRole', 'crew2MemberId', 'crew2Role'])
  }

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
      url: endpoints.members.root,
      params: {
        isMembershipApproved: true,
      },
    },
    {
      // members do not change while adding a flight
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
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
            })) ?? [],
        )
        .concat(
          memberList?.members
            ?.filter((m) => m.roles.includes('INSTRUCTOR'))
            ?.map((m) => ({
              value: m.memberId,
              label: `${m.first} ${m.last}`,
              role: 'INSTRUCTOR',
            })) ?? [],
        )
        .concat(
          memberList?.members
            ?.filter((m) => !m.roles.includes('INSTRUCTOR') && !m.roles.includes('EXAMINER'))
            ?.map((m) => ({
              value: m.memberId,
              label: `${m.first} ${m.last}`,
              role: 'MEMBER',
            })) ?? [],
        ),
    [me, memberList],
  )

  // whether the current user (SELF) qualifies as instructor or examiner
  const selfIsInstructor = useMemo(
    () =>
      memberList?.members?.some(
        (m) => m.memberId === me?.memberId && m.roles.includes('INSTRUCTOR'),
      ) ?? false,
    [me, memberList],
  )
  const selfIsExaminer = useMemo(
    () =>
      memberList?.members?.some(
        (m) => m.memberId === me?.memberId && m.roles.includes('EXAMINER'),
      ) ?? false,
    [me, memberList],
  )

  const isMemberQualifiedForDuty = useCallback(
    (member: CrewMember, duty: string | null | undefined): boolean => {
      if (duty === 'FI') {
        return member.role === 'INSTRUCTOR' || (member.role === 'SELF' && selfIsInstructor)
      }
      if (duty === 'FE') {
        return member.role === 'EXAMINER' || (member.role === 'SELF' && selfIsExaminer)
      }
      return true
    },
    [selfIsInstructor, selfIsExaminer],
  )

  // watch duty (role) for all slots so filtering and validation react to changes
  const crewRoles = watch(['picRole', 'crew2Role', 'crew3Role', 'crew4Role'])

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

      if (defaultInstructorMemberId && !crewMembers[1] && maximumCrewCount >= 2) {
        if (crewCount < 2) {
          setCrewCount(2)
        }
        // instructor defaults to PIC, student (self) defaults to crew #2 — still
        // freely reassignable, and swappable via the swap-crew button below.
        setValue?.('picMemberId', defaultInstructorMemberId)
        setValue?.('picRole', 'FI')
        setValue?.('crew2MemberId', me?.memberId ?? '')
        setValue?.('crew2Role', 'STU')
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
    defaultInstructorMemberId,
    me,
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
          <Typography
            sx={{
              color: 'text.secondary',
            }}
          >
            {t(
              'flightLog.selectFlightTypeCrew',
              'Please select a flight type to continue with crew information',
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
        const currentDuty = crewRoles[index]

        // When duty is FI or FE, filter the member list to only qualified members
        const filteredMembers = members.filter((m) => {
          // do not allow duplicates across slots
          const atIndex = crewMembers.findIndex((id) => id === m.value)
          if (atIndex !== index && atIndex !== -1) return false

          return isMemberQualifiedForDuty(m, currentDuty)
        })

        return (
          <Grid key={slot} size={{ xs: 12 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: isSinglePilotFlight ? 12 : 8 }}>
                <Controller
                  name={crewId}
                  control={control}
                  rules={{ required: true }}
                  render={({ field: { onChange, value }, fieldState: { error, isDirty } }) => {
                    const showError = shouldShowFieldError(error, isDirty, isSubmitted)

                    return (
                      <Autocomplete
                        disabled={!isEditable}
                        options={filteredMembers}
                        value={members.find((member) => member.value === value) ?? null}
                        groupBy={(option) => option.role}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={t(`flightLog.crews.${slot}`)}
                            required={slot === 'pic'}
                            placeholder={t('flightLog.selectCrew')}
                            margin='normal'
                            error={showError}
                            helperText={
                              showError
                                ? formatRequiredFieldError(
                                    error,
                                    t('flightLog.error.fieldRequired'),
                                  )
                                : undefined
                            }
                            slotProps={{
                              ...params.slotProps,

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

                            if (slot == 'pic' && (defaultRole == 'FI' || defaultRole == 'FE')) {
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
                    )
                  }}
                />
              </Grid>
              {!isSinglePilotFlight && (
                <Grid size={{ xs: 4 }}>
                  <Controller
                    name={crewRole}
                    control={control}
                    render={({ field, fieldState: { error, isDirty } }) => {
                      const showError = shouldShowFieldError(error, isDirty, isSubmitted)

                      return (
                        <FormControl fullWidth error={showError} margin='normal'>
                          <InputLabel>{t('flightLog.duty')}</InputLabel>
                          <Select
                            {...field}
                            value={field.value || ''}
                            label={t('flightLog.duty')}
                            disabled={!isEditable}
                            // On narrow mobile columns show only the short code; full label in dropdown
                            renderValue={isSmUp ? undefined : (value) => String(value)}
                            onChange={(e) => {
                              const nextDuty = e.target.value
                              field.onChange(e)

                              const selectedMemberId = watch(crewId)
                              const selectedMember = members.find(
                                (member) => member.value === selectedMemberId,
                              )

                              if (
                                selectedMemberId &&
                                (nextDuty === 'FI' || nextDuty === 'FE') &&
                                (!selectedMember ||
                                  !isMemberQualifiedForDuty(selectedMember, nextDuty))
                              ) {
                                // shouldDirty: the field's required error is only shown once
                                // isDirty flips (see shouldShowFieldError) - without it, clearing
                                // an unqualified member here would leave the error hidden.
                                setValue?.(crewId, null, { shouldDirty: true })
                              }

                              // re-validate the member field when duty changes
                              trigger?.(crewId)
                            }}
                          >
                            {CREW_ROLES.map((type) => (
                              <MenuItem key={type.value} value={type.value}>
                                {type.value} - {type.label}
                              </MenuItem>
                            ))}
                          </Select>
                          {showError && (
                            <FormHelperText>
                              {formatRequiredFieldError(error, t('flightLog.error.fieldRequired'))}
                            </FormHelperText>
                          )}
                        </FormControl>
                      )
                    }}
                  />
                </Grid>
              )}
            </Grid>
            {index >= minimumCrewCount && index == length - 1 && isEditable && (
              // only last crew slot can be removed
              <Grid size={{ xs: 12 }} sx={{ display: 'flex', alignItems: 'center' }}>
                <Tooltip title={t('flightLog.removeCrew')}>
                  <Button
                    color='error'
                    aria-label={t('flightLog.removeCrew')}
                    onClick={() => setPendingRemoveSlot(slot)}
                    sx={{ minWidth: 44, minHeight: 44, p: 1 }}
                  >
                    <Icon icon='mdi:close' />
                  </Button>
                </Tooltip>
              </Grid>
            )}
          </Grid>
        )
      })}
      {canSwapCrew && (
        <Grid size={{ xs: 12 }}>
          <Button
            variant='outlined'
            startIcon={<Icon icon='mdi:swap-vertical' />}
            onClick={handleSwapCrew}
            fullWidth
            sx={{ mt: 1 }}
          >
            {t('flightLog.swapCrew')}
          </Button>
        </Grid>
      )}
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

      <Dialog open={pendingRemoveSlot !== null} onClose={() => setPendingRemoveSlot(null)}>
        <DialogTitle>{t('flightLog.removeCrewConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('flightLog.removeCrewConfirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRemoveSlot(null)}>{t('common.cancel')}</Button>
          <Button color='error' onClick={confirmRemoveCrew}>
            {t('flightLog.removeCrew')}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}

export default FlightCrew
