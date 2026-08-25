import { Box, TextField, InputAdornment, Stack, Chip, Button } from '@mui/material'
import { Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'
import { Member, MemberListResponse, RestoreMemberResponse } from '@mik/contracts/members'
import { Icon } from '@iconify/react'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { t } from 'i18next'
import { useState } from 'react'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import UserAvatar from '@mik/ui/components/UserAvatar'
import { formatPhoneNumber } from '@mik/ui/utils/format'
import { Title } from '@mik/ui/components/Title'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
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

    const { error, data: restoreResponse } = await mutation.trigger<
      Record<string, never>,
      RestoreMemberResponse
    >('POST', {}, absolute(endpoints.members.restore(memberId)))
    if (error) {
      return setProblem(error)
    }

    // Build success message with warnings
    let successMessage = t('member.restoredSuccessMessage')

    if (restoreResponse?.hadCreditedFee) {
      successMessage +=
        '\n\n' +
        t(
          'member.restoreCreditNoteWarning',
          "⚠️ This member's annual/joining fee was credited when they were removed. You may need to invoice them again for the current year.",
        )
    }

    successMessage +=
      '\n\n' +
      t('member.restoreRolesWarning', '⚠️ Roles were cleared and must be re-assigned manually.')

    setProblem({
      status: 200,
      detail: successMessage,
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
                <UserAvatar
                  email={member.email}
                  firstName={member.first}
                  lastName={member.last}
                  avatarUrl={member.avatarUrl}
                  avatarStyle={member.avatarStyle}
                />
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
