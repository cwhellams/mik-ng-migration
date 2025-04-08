import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
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
  MemberListFilters,
  MemberListResponse,
} from '@backend/routes/members/models'
import { Icon } from '@iconify/react'
import { useRoles } from '../../hooks/useRoles'
import { t } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const Members = () => {
  const [filters, setFilters] = useState<MemberListFilters>({
    name: '',
    role: '',
  })

  const { data, error, mutate } = useApi<MemberListResponse>(
    {
      url: 'v1/members',
      params: filters,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  const { isMembersAdmin, roles } = useRoles()
  const { i18n } = useTranslation()

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        {t('header.members')}
      </Typography>

      <Grid
        container
        spacing={2}
        justifyContent='space-between'
        alignItems='flex-end'
        sx={{ mb: 3 }}
      >
        <TextField
          label='Search field'
          type='search'
          value={filters.name}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <Icon icon='mdi:search' color='#646cff' />
                </InputAdornment>
              ),
            },
          }}
          onChange={({ target }) => {
            setFilters({ name: target.value })
            mutate()
          }}
        />

        <Grid
          size={5}
          direction='column'
          display='flex'
          justifyContent={'flex-end'}
        >
          {isMembersAdmin && (
            <Grid
              alignItems='center'
              display='flex'
              sx={{ mr: 1, fontSize: 24 }}
            >
              <Link to='/members/roles'>
                <Icon icon='mdi:gear' color='#646cff' />
              </Link>
            </Grid>
          )}

          <FormControl sx={{ m: 1, minWidth: 150 }}>
            <InputLabel id='role-label'>{t('member.memberType')}</InputLabel>

            <Select
              labelId='role-label'
              id='role'
              value={filters.role}
              label={t('member.memberType')}
              onChange={({ target }) => {
                setFilters({
                  role: target.value,
                })
                mutate()
              }}
            >
              <MenuItem value=''>{t('roles.all')}</MenuItem>
              {isMembersAdmin && (
                <MenuItem value={'null'}>{t('roles.unApproved')}</MenuItem>
              )}
              {roles.map((role) => (
                <MenuItem key={role.roleId} value={role.roleId}>
                  {role.name?.[i18n.language == 'fi' ? 'fi' : 'en']}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label='simple table'>
          <TableHead>
            <TableRow>
              <TableCell>{t('member.fullname')}</TableCell>
              <TableCell align='right'>{t('member.phone')}</TableCell>
              <TableCell align='right'>{t('member.roles')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={2} height={150}>
                  <Typography variant='h6' color='error' align='center'>
                    Error loading member data.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              (data?.members.map((row) => (
                <TableRow
                  key={row.memberId}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component='th' scope='row'>
                    {isMembersAdmin ? (
                      <Link to={`/members/${row.memberId}`}>{row.name}</Link>
                    ) : (
                      row.name
                    )}
                  </TableCell>
                  <TableCell align='right'>{row.phoneNumber}</TableCell>
                  <TableCell align='right'>
                    <Stack
                      direction='row'
                      spacing={1}
                      sx={{ mb: 3, justifyContent: 'flex-end' }}
                    >
                      {row.roles.map((role, index) => (
                        <Chip
                          key={index}
                          label={
                            roles.find((r) => r.roleId === role)?.name[
                              i18n.language == 'fi' ? 'fi' : 'en'
                            ] ?? role
                          }
                          color='primary'
                        />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              )) ?? (
                <TableRow>
                  <TableCell colSpan={2} height={150} align='center'>
                    <CircularProgress size={24} color='inherit' />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default Members
