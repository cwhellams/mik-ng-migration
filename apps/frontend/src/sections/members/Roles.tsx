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
} from '@mui/material'
import { Link } from 'react-router-dom'
import { useRoles } from '../../hooks/useRoles'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'

const Roles = () => {
  const { t } = useTranslation()
  const { roles, error } = useRoles()

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        {t('header.roles')}
      </Typography>

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label='simple table'>
          <TableHead>
            <TableRow>
              <TableCell>{t('roles.roleId')}</TableCell>
              <TableCell>{t('roles.isPublic')}</TableCell>
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
                    <Link to={`/members/roles/${row.roleId}`}>
                      {row.roleId}
                    </Link>
                  </TableCell>
                  <TableCell align='right' sx={{ fontSize: 20 }}>
                    {row.isPublic && <Icon icon='mdi:check' color='green' />}
                  </TableCell>
                  <TableCell align='right'>
                    {row.permissions.join(', ')}
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

export default Roles
