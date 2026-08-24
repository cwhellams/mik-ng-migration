import { MemberListFilters, MemberListResponse } from '@mik/contracts/members'
import useApi from '../hooks/useApi'
import { Autocomplete, TextField } from '@mui/material'
import { useMemo } from 'react'
import { endpoints } from '../api/endpoints'

// App-local rather than shared through @mik/ui: this component fetches its own
// member list, and the two apps' useApi hooks are deliberately different (this
// one always sends x-sudo: true). A shared version would have to take the data
// as a prop, which every call site would then have to supply.

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
  required,
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
  required?: boolean
}) => {
  const filters: MemberListFilters = {
    ...(memberType != null ? { memberType } : { role }),
  }

  const { data: memberList } = useApi<MemberListResponse>(
    {
      url: endpoints.members.root,
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
          required={required}
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
