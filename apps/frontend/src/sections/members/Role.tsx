import {
  CircularProgress,
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Grid,
  Checkbox,
  FormControlLabel,
  TextField,
  Button,
  FormGroup,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import { MemberRole, MIKPermissions } from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuditFormField } from './components/AuditFormField'
import { FormTitle } from './components/FormTitle'
import { useRoles } from '../../hooks/useRoles'

const MemberRoleEditor = () => {
  const { t } = useTranslation()
  const { roleId } = useParams()

  const { permissions } = useRoles()

  const { data, isLoading, error, patch } = useApi<MemberRole>({
    url: `v1/members/roles/${roleId}`,
  })
  const [formData, setFormData] = useState<Partial<MemberRole>>({})

  useEffect(() => {
    setFormData(data ?? {})
  }, [data])

  const navigate = useNavigate()

  const handleCancel = () => {
    navigate('/members/roles')
  }

  const handleSubmit = async () => {
    try {
      patch(formData)
    } catch (error) {
      console.error('Error saving member data:', error)
      // Could add error handling / feedback here
    }
  }

  const handleChange =
    (field: keyof MemberRole) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }))
    }

  const handleChangeRole = ({
    target,
  }: React.ChangeEvent<HTMLInputElement>) => {
    const oldPermissions = formData.permissions ?? []
    const permission = target.name as MIKPermissions

    if (target.checked) {
      setFormData((prev) => ({
        ...prev,
        permissions: [...oldPermissions, permission],
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        permissions: oldPermissions.filter((r) => r !== permission),
      }))
    }
  }

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant='h2' gutterBottom>
        {data?.roleId}
      </Typography>

      {isLoading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <CircularProgress size={24} color='inherit' />
        </Box>
      ) : error || !data ? (
        <Typography variant='h6' color='error' align='center'>
          {t('error.loadingMemberData', 'Error loading member data.')}
        </Typography>
      ) : (
        <>
          <Stack spacing={3}>
            <Card sx={{ flex: 1, position: 'relative' }}>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label={t('roles.roleId')}
                      value={formData.roleId || ''}
                      onChange={handleChange('roleId')}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label={t('roles.description')}
                      value={formData.description || ''}
                      onChange={handleChange('description')}
                    />
                  </Grid>
                </Grid>

                <Grid size={12} display='flex' alignItems='center'>
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ width: 250 }}
                  >
                    {t('roles.isPublic')}
                  </Typography>
                  <Checkbox
                    checked={formData.isPublic ?? false}
                    onChange={({ target }) => {
                      setFormData({
                        ...formData,
                        isPublic: target.checked,
                      })
                    }}
                  />
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <FormTitle
                  title='roles.permissions'
                  icon='mdi:user-access-control'
                />

                <Grid size={12}>
                  <FormGroup>
                    {permissions.map((permission) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            name={permission}
                            checked={
                              formData.permissions?.includes(permission) ??
                              false
                            }
                            onChange={handleChangeRole}
                          />
                        }
                        label={`${permission} : ${t(`permissions.${permission}`)}`}
                      />
                    ))}
                  </FormGroup>
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <FormTitle title='roles.details' icon='mdi:information' />

                <Stack spacing={1.5}>
                  <AuditFormField
                    label='member.created'
                    by={data.createdBy}
                    at={data.createdAt}
                  />

                  <AuditFormField
                    label='member.updated'
                    by={data.updatedBy}
                    at={data.updatedAt}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Grid size={12} alignSelf='self-end'>
              <Button onClick={handleCancel} color='inherit'>
                {t('general.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                color='primary'
                variant='contained'
                disabled={isLoading}
                startIcon={isLoading ? <CircularProgress size={20} /> : null}
              >
                {t('general.save', 'Save')}
              </Button>
            </Grid>
          </Stack>
        </>
      )}
    </Box>
  )
}

export default MemberRoleEditor
