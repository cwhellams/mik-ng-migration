import {
  Box,
  TextField,
  InputAdornment,
  Stack,
  Chip,
  Grid,
  FormControl,
  Select,
  InputLabel,
  MenuItem,
} from '@mui/material'
import { Link } from 'react-router-dom'
import useApi from '../../hooks/useApi'
import {
  Member,
  MemberListFilters,
  MemberListResponse,
  MemberRole,
  MIKLang,
} from '@backend/routes/members/models'
import { Icon } from '@iconify/react'
import { useRoles } from '../../hooks/useRoles'
import { t } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditButton } from '../../components/EditButton'
import { EditMemberModal, MemberEditMode } from './components/EditMemberModal'
import { RemoteContent } from '../../components/RemoteContent'
import UserAvatar from './components/UserAvatar'
import { formatPhoneNumber } from '../../utils/format'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../flightLog/components/ResponsiveTable'

const Members = () => {
  const [filters, setFilters] = useState<MemberListFilters>({
    name: '',
    role: '',
    showUnapproved: undefined,
  })

  const { data, isLoading, error, mutate, mutation } = useApi<
    MemberListResponse,
    Member
  >(
    {
      url: 'v1/members',
      params: filters,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  const [editMode, setEditMode] = useState<MemberEditMode | undefined>()

  const { isMembersAdmin, roles } = useRoles()
  const { i18n } = useTranslation()

  return (
    <Box>
      <Title label={t('header.members')}>
        {isMembersAdmin && (
          <EditButton
            title={t('member.edit.register')}
            onClick={() => setEditMode('register')}
            icon='mdi:plus'
          />
        )}
      </Title>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent='space-between'
        gap={2}
        mb={3}
      >
        <TextField
          label='Search field'
          type='search'
          value={filters.name}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <Icon icon='mdi:search' color='#646cff' fontSize={20} />
                </InputAdornment>
              ),
            },
          }}
          onChange={({ target }) => {
            setFilters({ name: target.value })
            mutate()
          }}
        />

        <Stack direction='row'>
          {isMembersAdmin && (
            <Box alignItems='center' display='flex' sx={{ mr: 1 }}>
              <Link to='members/roles'>
                <Icon icon='mdi:gear' color='#646cff' fontSize={24} />
              </Link>
            </Box>
          )}

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel id='role-label'>{t('member.memberType')}</InputLabel>

            <Select
              fullWidth
              labelId='role-label'
              id='role'
              value={
                filters.showUnapproved
                  ? 'unapproved'
                  : filters.showRemoved
                    ? 'showRemoved'
                    : (filters.role ?? '')
              }
              label={t('member.memberType')}
              onChange={({ target }) => {
                const showUnapproved = target.value == 'unapproved'
                const showRemoved = target.value == 'showRemoved'

                const filter: MemberListFilters = {
                  showUnapproved,
                  showRemoved,
                  ...(!showUnapproved && !showRemoved && target.value !== ''
                    ? { role: target.value }
                    : { role: undefined }),
                }

                setFilters(filter)
                mutate()
              }}
            >
              <MenuItem value=''>{t('roles.all')}</MenuItem>
              {isMembersAdmin && (
                <MenuItem value={'unapproved'}>
                  {t('roles.unApproved')}
                </MenuItem>
              )}
              {isMembersAdmin && (
                <MenuItem value={'showRemoved'}>
                  {t('roles.showRemoved')}
                </MenuItem>
              )}
              {roles.map((role) => (
                <MenuItem key={role.roleId} value={role.roleId}>
                  {role.name[i18n.language as MIKLang]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1}></Grid>
              <Grid container size='grow'>
                <Grid size={3}>{t('member.fullname')}</Grid>
                <Grid size={2.5}>{t('member.phone')}</Grid>
                <Grid>{t('member.roles')}</Grid>
              </Grid>
            </>
          }
          notFoundMsg={t('member.noMembersFound')}
          rows={data?.members}
          row={(row) => (
            <>
              <Grid size={{ xs: 2, md: 1 }}>
                <UserAvatar
                  email={row.email}
                  size={40}
                  firstName={row.first}
                  lastName={row.last}
                />
              </Grid>
              <Grid container size='grow' spacing={0}>
                <Grid size={{ xs: 12, md: 3 }}>
                  {isMembersAdmin ? (
                    <Link to={`members/${row.memberId}`}>
                      {row.first} {row.last}
                    </Link>
                  ) : (
                    `${row.first} ${row.last}`
                  )}
                </Grid>

                <Grid size={{ xs: 12, md: 2.5 }}>
                  {formatPhoneNumber(row.phoneNumber ?? '')}
                </Grid>

                <Grid size={{ xs: 12, md: 'grow' }}>
                  {renderRoles(row.roles, roles, i18n.language as MIKLang)}
                </Grid>
              </Grid>
            </>
          )}
        />
      </RemoteContent>

      <EditMemberModal
        mode={editMode}
        onClose={() => setEditMode(undefined)}
        api={mutation}
      />
    </Box>
  )
}

const renderRoles = (
  memberRoles: string[],
  roles: MemberRole[],
  language: MIKLang
) => {
  return (
    <Stack
      direction='row'
      spacing={1}
      display='inline-flex'
      sx={{
        flexWrap: 'wrap',
      }}
    >
      {memberRoles.map((role, index) => (
        <Chip
          key={index}
          sx={{ width: 'fit-content' }}
          size='small'
          variant='outlined'
          label={roles.find((r) => r.roleId === role)?.name[language] ?? role}
          color='primary'
        />
      ))}
    </Stack>
  )
}

export default Members
