import { Typography, Box, Grid, Stack } from '@mui/material'
import { Link } from 'react-router'
import { useRoles } from '../../hooks/useRoles'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { EditButton } from '../../components/EditButton'
import { MemberRole, MIKLang } from '@mik/contracts/members'
import { useState } from 'react'
import { MemberRoleEditor } from './components/EditRoleModal'
import { RemoteContent } from '../../components/RemoteContent'
import { Upsert } from '@mik/contracts/schema'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'

const Roles = () => {
  const { t } = useTranslation()
  const { roles, error } = useRoles()

  const [editMode, setEditMode] = useState<Upsert<MemberRole> | undefined>(undefined)

  const handleNewRole = () => {
    setEditMode({
      roleId: '',
      name: {
        en: '',
        fi: '',
        sv: '',
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
    <Box>
      <Title label={t('header.roles')}>
        <EditButton title={t('roles.newRole')} onClick={handleNewRole} icon='mdi:plus' />
      </Title>
      <RemoteContent error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={5}>{t('roles.roleId')}</Grid>
              <Grid size={2}>{t('roles.isPublic')}</Grid>
              <Grid
                size={5}
                sx={{
                  textAlign: 'right',
                }}
              >
                {t('roles.permissions')}
              </Grid>
            </>
          }
          notFoundMsg={t('error.noRows')}
          rows={roles}
          row={(row) => (
            <>
              <Grid size={{ xs: 6, md: 5 }}>
                <Stack
                  direction='column'
                  sx={{
                    display: 'flex',
                  }}
                >
                  <Link to={'#'} onClick={() => handleEditMode(row)}>
                    {row.roleId}
                  </Link>
                  <Box>{row.name[MIKLang.EN]}</Box>
                  <Box>{row.name[MIKLang.FI]}</Box>
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                {row.isPublic && <Icon icon='mdi:check' color='green' fontSize={20} />}
              </Grid>
              <Grid
                size={{ xs: 12, md: 5 }}
                sx={{
                  textAlign: 'right',
                }}
              >
                {row.permissions?.map((perm) => (
                  <Typography variant='body2' key={perm}>
                    {perm}
                  </Typography>
                ))}
              </Grid>
            </>
          )}
        />
      </RemoteContent>
      <MemberRoleEditor role={editMode} onClose={() => setEditMode(undefined)} />
    </Box>
  )
}

export default Roles
