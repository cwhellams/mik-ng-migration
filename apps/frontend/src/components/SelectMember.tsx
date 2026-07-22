import { MemberListFilters, MemberListResponse } from '@backend/routes/members/models'
import useApi from '../hooks/useApi'
import { Autocomplete, TextField } from '@mui/material'
import { useMemo } from 'react'

type Member = {
  id?: string
  type?: string
  label: string
  group?: string
}

export const SelectMember = ({
  entries,
  value,
  onChange,
  label,
  placeholder,
  exclude,
  disabled,
  role = 'MEMBER',
  memberType,
}: {
  entries?: Member[]
  value: string | null
  onChange: (value: Member | null) => void
  label: string
  placeholder?: string
  exclude?: string[]
  disabled?: boolean
  role?: string
  memberType?: MemberListFilters['memberType']
}) => {
  const filters: MemberListFilters = {
    ...(memberType != null ? { memberType } : { role }),
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
    },
  )

  const members: Member[] = useMemo(
    () =>
      [...(entries ?? [])].concat(
        memberList?.members
          .filter(
            (m) => !exclude || exclude.every((excludedMemberId) => excludedMemberId !== m.memberId),
          )
          .map((m) => ({
            id: m.memberId,
            label: `${m.first} ${m.last}`,
            group: 'Member',
          })) ?? [],
      ),
    [memberList, entries, exclude],
  )

  return (
    <Autocomplete
      options={members}
      disabled={disabled}
      value={members.find((member) => member.id === value) ?? null}
      groupBy={(option) => option.group ?? ''}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          margin='normal'
          slotProps={{
            ...params.slotProps,

            inputLabel: {
              shrink: true,
            },
          }}
        />
      )}
      onChange={(_e, crew) => onChange(crew)}
    />
  )
}
