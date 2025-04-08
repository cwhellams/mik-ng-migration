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
  Stack,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { useRoles } from '../../hooks/useRoles'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { EditButton } from './components/EditButton'
import {
  MemberRole,
  MIKLang,
  UpsertMemberRole,
} from '@backend/routes/members/models'
import { useState } from 'react'
import { MemberRoleEditor } from './components/EditRoleModal'

const Roles = () => {
  const { t } = useTranslation()
  const { roles, error } = useRoles()

  const [editMode, setEditMode] = useState<UpsertMemberRole | undefined>(
    undefined
  )

  const handleNewRole = () => {
    setEditMode({
      roleId: '',
      name: {
        en: '',
        fi: '',
      },
      description: '',
      isPublic: false,
      permissions: [],
    })
  }

  const handleEditMode = (role: MemberRole) => {
    setEditMode(role)
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography variant='h2' gutterBottom>
        {t('header.roles')}
      </Typography>

      <EditButton
        title='roles.newRole'
        onClick={handleNewRole}
        icon='mdi:plus'
      />

      <TableContainer component={Paper}>
        <Table aria-label='simple table'>
          <TableHead>
            <TableRow>
              <TableCell>{t('roles.roleId')}</TableCell>
              <TableCell width={50}>{t('roles.isPublic')}</TableCell>
              <TableCell align='right'>{t('roles.permissions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={2} height={150}>
                  <Typography variant='h6' color='error' align='center'>
                    Error loading role data.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              (roles.map((row) => (
                <TableRow
                  key={row.roleId}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component='th' scope='row'>
                    <Stack direction='column' display='flex'>
                      <Link to={'#'} onClick={() => handleEditMode(row)}>
                        {row.roleId}
                      </Link>
                      <Box>{row.name[MIKLang.EN]}</Box>
                      <Box>{row.name[MIKLang.FI]}</Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontSize: 20 }}>
                    {row.isPublic && <Icon icon='mdi:check' color='green' />}
                  </TableCell>
                  <TableCell align='right'>
                    {row.permissions.map((perm) => (
                      <>
                        {perm}
                        <br />
                      </>
                    ))}
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

      <MemberRoleEditor
        role={editMode}
        onClose={() => setEditMode(undefined)}
      />
    </Box>
  )
}

export default Roles
