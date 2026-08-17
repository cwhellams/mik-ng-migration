import { Box, TextField, InputAdornment, Stack, Chip, Button } from '@mui/material'
import { Link } from 'react-router'
import useApi from '../../hooks/useApi'
import { Member, MemberListResponse } from '@mik/contracts/members'
import { Icon } from '@iconify/react'
import { useRoles } from '../../hooks/useRoles'
import { t } from 'i18next'
import { useState } from 'react'
import { RemoteContent } from '../../components/RemoteContent'
import UserAvatar from './components/UserAvatar'
import { formatPhoneNumber } from '../../utils/format'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import { absolute, endpoints } from '../../api/endpoints'

const MemberTrash = () => {
  const [nameFilter, setNameFilter] = useState('')
  const [problem, setProblem] = useState<Problem | undefined>()

  const { data, isLoading, error, mutate, mutation } = useApi<MemberListResponse, Member>(
    {
      url: endpoints.members.trash,
    },
    {
      keepPreviousData: true,
    },
  )

  const { isMembersAdmin } = useRoles()

  const handleRestore = async (memberId: string) => {
    const confirmMessage = t('member.restoreConfirmMessage')
    if (!window.confirm(confirmMessage)) {
      return
    }

    const { error } = await mutation.trigger(
      'POST',
      {},
      absolute(endpoints.members.restore(memberId)),
    )
    if (error) {
      return setProblem(error)
    }

    setProblem({
      status: 200,
      detail: t('member.restoredSuccessMessage'),
    })

    // Refresh the list
    mutate()
  }

  if (!isMembersAdmin) {
    return (
      <Box>
        <Title label={t('member.trash', 'Removed Members')} />
        <p>{t('member.noPermission', 'You do not have permission to view this page.')}</p>
      </Box>
    )
  }

  const filteredMembers = data?.members?.filter((member) =>
    `${member.first} ${member.last}`.toLowerCase().includes(nameFilter.toLowerCase()),
  )

  return (
    <Box>
      <SnackAlert problem={problem} />
      <Title label={t('member.trash', 'Removed Members')} />
      <Stack
        direction='row'
        sx={{
          justifyContent: 'space-between',
          gap: 2,
          mb: 3,
        }}
      >
        <TextField
          label={t('member.search', 'Search')}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <Icon icon='mdi:magnify' />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <RemoteContent error={error} isLoading={isLoading}>
        <ResponsiveTable
          notFoundMsg={t('member.noRemovedMembers', 'No removed members found')}
          rows={filteredMembers}
          row={(member) => (
            <Box
              key={member.memberId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                width: '100%',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <UserAvatar email={member.email} firstName={member.first} lastName={member.last} />
                <Box
                  sx={{
                    minWidth: 0,
                  }}
                >
                  <Link
                    to={`/club/members/${member.memberId}`}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      fontWeight: 'bold',
                    }}
                  >
                    {member.first} {member.last}
                  </Link>
                  <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{member.email}</Box>
                  <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    {member.phoneNumber ? formatPhoneNumber(member.phoneNumber) : 'N/A'}
                  </Box>
                </Box>
                {member.roles.length > 0 && (
                  <Stack
                    direction='row'
                    spacing={1}
                    sx={{
                      alignItems: 'center',
                    }}
                  >
                    {member.roles.map((role) => (
                      <Chip key={role} label={role} size='small' />
                    ))}
                  </Stack>
                )}
              </Box>
              <Box sx={{ ml: 2, flexShrink: 0 }}>
                <Button
                  size='small'
                  variant='outlined'
                  color='primary'
                  startIcon={<Icon icon='mdi:restore' />}
                  onClick={() => handleRestore(member.memberId)}
                  disabled={mutation.isMutating}
                >
                  {t('member.restore', 'Restore')}
                </Button>
              </Box>
            </Box>
          )}
        />
      </RemoteContent>
    </Box>
  )
}

export default MemberTrash
