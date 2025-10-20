import {
  MemberListFilters,
  MemberListResponse,
} from '@backend/routes/members/models'
import useApi from '../../../hooks/useApi'
import { Autocomplete, TextField } from '@mui/material'
import { t } from 'i18next'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useMemo } from 'react'
import { useMe } from '../../../hooks/useMe'

type BillableMember = {
  memberId: string
  label: string
}

export const BillableMember = ({
  control,
  disabled,
}: {
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
}) => {
  const { me } = useMe()

  const filters: MemberListFilters = {
    isMembershipApproved: true,
    role: 'MEMBER',
  }

  const { data: memberList } = useApi<MemberListResponse>(
    {
      url: 'v1/members',
      params: filters,
    },
    {
      // members do not change while adding a flight
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  // list of all members, including self
  const members: BillableMember[] = useMemo(
    () =>
      [
        {
          memberId: me?.memberId ?? '',
          label: 'SELF',
        },
      ].concat(
        memberList?.members
          ?.filter((m) => m.memberId !== me?.memberId)
          .map((m) => ({
            memberId: m.memberId,
            label: `${m.first} ${m.last}`,
          })) ?? []
      ),
    [me, memberList]
  )

  return (
    <Controller
      name={'billableMemberId'}
      control={control}
      rules={{ required: true }}
      render={({ field: { onChange, value } }) => (
        <Autocomplete
          options={members}
          disabled={disabled}
          value={members.find((member) => member.memberId === value) ?? null}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t(`flightLog.billableMemberId`)}
              placeholder={t('flightLog.selectCrew')}
              margin='normal'
              slotProps={{
                inputLabel: {
                  shrink: true,
                },
              }}
            />
          )}
          onChange={(_e, crew) => onChange(crew?.memberId ?? null)}
        />
      )}
    />
  )
}
