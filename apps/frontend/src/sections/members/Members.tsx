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
  ButtonBase,
  Tooltip,
  Typography,
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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditButton } from '../../components/EditButton'
import { EditMemberModal, MemberEditMode } from './components/EditMemberModal'
import { RemoteContent } from '../../components/RemoteContent'
import UserAvatar from './components/UserAvatar'
import { formatPhoneNumber } from '../../utils/format'
import { langFlagIcon } from '../../utils/lang'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { useTimezone } from '../../hooks/useTimezone'

type SortDirection = 'asc' | 'desc'
type SortField =
  | 'fullName'
  | 'phone'
  | 'town'
  | 'roles'
  | 'memberSince'
  | 'isTrainingProgramPilot'
  | 'canMakeReservations'
  | 'autoRenewAnnualMembership'
  | 'autoRenewEquipmentFee'

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
  const [sortField, setSortField] = useState<SortField>('fullName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const { isMembersAdmin, roles } = useRoles()
  const { i18n } = useTranslation()
  const { formatDate } = useTimezone()

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedMembers = useMemo(() => {
    const members = [...(data?.members ?? [])]
    const modifier = sortDirection === 'asc' ? 1 : -1

    return members.sort((a, b) => {
      switch (sortField) {
        case 'fullName':
          return (
            modifier *
            getFullName(a).localeCompare(getFullName(b), i18n.language)
          )
        case 'phone':
          return (
            modifier *
            (a.phoneNumber ?? '').localeCompare(
              b.phoneNumber ?? '',
              i18n.language
            )
          )
        case 'town':
          return (
            modifier *
            (a.townCity ?? '').localeCompare(b.townCity ?? '', i18n.language)
          )
        case 'roles':
          return (
            modifier *
            a.roles.join(',').localeCompare(b.roles.join(','), i18n.language)
          )
        case 'memberSince':
          return (
            modifier * (a.memberSince ?? '').localeCompare(b.memberSince ?? '')
          )
        case 'isTrainingProgramPilot':
          return (
            modifier *
            (booleanSortValue(a.isTrainingProgramPilot) -
              booleanSortValue(b.isTrainingProgramPilot))
          )
        case 'canMakeReservations':
          return (
            modifier *
            (booleanSortValue(a.canMakeReservations) -
              booleanSortValue(b.canMakeReservations))
          )
        case 'autoRenewAnnualMembership':
          return (
            modifier *
            (booleanSortValue(a.autoRenewAnnualMembership) -
              booleanSortValue(b.autoRenewAnnualMembership))
          )
        case 'autoRenewEquipmentFee':
          return (
            modifier *
            (booleanSortValue(a.autoRenewEquipmentFee) -
              booleanSortValue(b.autoRenewEquipmentFee))
          )
        default:
          return 0
      }
    })
  }, [data?.members, i18n.language, sortDirection, sortField])

  // Returns a clickable, sortable header cell.
  // For compact boolean columns pass a tooltip with the full label.
  const sortHeader = (
    field: SortField,
    label: string,
    size: number | 'grow',
    tooltip?: string
  ) => {
    const isActive = sortField === field
    const ariaSortValue = isActive
      ? sortDirection === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none'
    const activeDirectionLabel =
      sortDirection === 'asc'
        ? t('member.sortAscending')
        : t('member.sortDescending')
    const clickBox = (
      <ButtonBase
        onClick={() => handleSort(field)}
        aria-label={
          isActive
            ? `${t('member.sortBy')} ${label}, ${t('member.sortDirection')}: ${activeDirectionLabel}`
            : `${t('member.sortBy')} ${label}`
        }
        sx={{
          width: 'fit-content',
          justifyContent: 'flex-start',
        }}
      >
        <Box
          component='span'
          sx={{
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            userSelect: 'none',
            fontWeight: isActive ? 600 : 'inherit',
          }}
        >
          {label}
          {isActive && (
            <Icon
              icon={sortDirection === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
              fontSize={14}
            />
          )}
        </Box>
      </ButtonBase>
    )
    return (
      <Grid
        key={field}
        size={size}
        role='columnheader'
        aria-sort={ariaSortValue}
      >
        {tooltip ? (
          <Tooltip title={tooltip} placement='top'>
            {clickBox}
          </Tooltip>
        ) : (
          clickBox
        )}
      </Grid>
    )
  }

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
        mb={2}
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
                    : filters.showExternal
                      ? 'showExternal'
                      : (filters.role ?? '')
              }
              label={t('member.memberType')}
              onChange={({ target }) => {
                const showUnapproved = target.value == 'unapproved'
                const showRemoved = target.value == 'showRemoved'
                const showExternal = target.value == 'showExternal'
                const showRole =
                  !showUnapproved &&
                  !showRemoved &&
                  !showExternal &&
                  target.value !== ''
                setFilters({
                  showUnapproved,
                  showRemoved,
                  showExternal,
                  ...(showRole ? { role: target.value } : { role: undefined }),
                })
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
              {isMembersAdmin && (
                <MenuItem value={'showExternal'}>
                  {t('roles.showExternal')}
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

      <Typography variant='body2' mb={2}>
        {t('member.count', { count: sortedMembers.length })}
      </Typography>

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1}></Grid>
              <Grid container size='grow'>
                {sortHeader(
                  'fullName',
                  t('member.fullname'),
                  isMembersAdmin ? 2 : 3
                )}
                {sortHeader(
                  'phone',
                  t('member.phone'),
                  isMembersAdmin ? 1.5 : 2.5
                )}
                {sortHeader('town', t('member.town'), isMembersAdmin ? 1.5 : 2)}
                {sortHeader(
                  'roles',
                  t('member.roles'),
                  isMembersAdmin ? 2.3 : 'grow'
                )}
                {isMembersAdmin &&
                  sortHeader('memberSince', t('member.memberSince'), 1.5)}
                {isMembersAdmin &&
                  sortHeader(
                    'isTrainingProgramPilot',
                    t('member.abbr.isTrainingProgramPilot'),
                    0.8,
                    t('member.isTrainingProgramPilot')
                  )}
                {isMembersAdmin &&
                  sortHeader(
                    'canMakeReservations',
                    t('member.abbr.canMakeReservations'),
                    0.8,
                    t('member.canMakeReservations')
                  )}
                {isMembersAdmin &&
                  sortHeader(
                    'autoRenewAnnualMembership',
                    t('member.abbr.autoRenewAnnualMembership'),
                    0.8,
                    t('member.billingInfo.annualMembershipAutoRenew')
                  )}
                {isMembersAdmin &&
                  sortHeader(
                    'autoRenewEquipmentFee',
                    t('member.abbr.autoRenewEquipmentFee'),
                    0.8,
                    t('member.billingInfo.equipmentFeeAutoRenew')
                  )}
              </Grid>
            </>
          }
          notFoundMsg={t('member.noMembersFound')}
          rows={sortedMembers}
          row={(row) => (
            <>
              <Grid size={{ xs: 2, md: 1 }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <UserAvatar
                    email={row.email}
                    size={40}
                    firstName={row.first}
                    lastName={row.last}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -4,
                      right: -6,
                      lineHeight: 0,
                    }}
                  >
                    <Icon icon={langFlagIcon(row.lang)} fontSize={14} />
                  </Box>
                </Box>
              </Grid>
              <Grid container size='grow' spacing={0} alignItems='center'>
                <Grid size={{ xs: 12, md: isMembersAdmin ? 2 : 3 }}>
                  {isMembersAdmin ? (
                    <Link to={`members/${row.memberId}`}>
                      {row.first} {row.last}
                    </Link>
                  ) : (
                    `${row.first} ${row.last}`
                  )}
                </Grid>

                <Grid size={{ xs: 12, md: isMembersAdmin ? 1.5 : 2.5 }}>
                  {formatPhoneNumber(row.phoneNumber ?? '')}
                </Grid>

                <Grid size={{ xs: 12, md: isMembersAdmin ? 1.5 : 2 }}>
                  {row.townCity}
                </Grid>

                <Grid
                  size={{ xs: 12, md: isMembersAdmin ? 2.3 : 'grow' }}
                >
                  {renderRoles(row.roles, roles, i18n.language as MIKLang)}
                </Grid>

                {isMembersAdmin && (
                  <Grid size={{ xs: 12, md: 1.5 }}>
                    {formatDate(row.memberSince)}
                  </Grid>
                )}
                {isMembersAdmin && (
                  <Grid size={{ xs: 'auto', md: 0.8 }}>
                    {renderBoolean(row.isTrainingProgramPilot)}
                  </Grid>
                )}
                {isMembersAdmin && (
                  <Grid size={{ xs: 'auto', md: 0.8 }}>
                    {renderBoolean(row.canMakeReservations)}
                  </Grid>
                )}
                {isMembersAdmin && (
                  <Grid size={{ xs: 'auto', md: 0.8 }}>
                    {renderBoolean(row.autoRenewAnnualMembership)}
                  </Grid>
                )}
                {isMembersAdmin && (
                  <Grid size={{ xs: 'auto', md: 0.8 }}>
                    {renderBoolean(row.autoRenewEquipmentFee)}
                  </Grid>
                )}
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
      display='flex'
      sx={{
        flexWrap: 'wrap',
        gap: '4px',
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

const getFullName = (member: MemberListResponse['members'][number]) =>
  `${member.last} ${member.first}`

const booleanSortValue = (value?: boolean | null) => (value ? 1 : 0)

const renderBoolean = (value?: boolean | null) => (
  <Icon
    icon={value ? 'mdi:check' : 'mdi:close'}
    color={value ? '#2e7d32' : '#d32f2f'}
  />
)

export default Members
