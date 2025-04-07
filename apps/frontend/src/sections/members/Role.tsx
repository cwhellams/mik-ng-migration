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
import {
  UpsertMemberRole,
  MemberRole,
  MIKPermissions,
} from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuditFormField } from './components/AuditFormField'
import { FormTitle } from './components/FormTitle'
import { useRoles } from '../../hooks/useRoles'
import { mutate } from 'swr'

const MemberRoleEditor = () => {
  const { t } = useTranslation()
  const { roleId } = useParams()

  const isNewRole = roleId === 'new'

  const { permissions } = useRoles()

  const { data, isLoading, error, create, update, remove } =
    useApi<UpsertMemberRole>({
      url: `v1/members/roles${isNewRole ? '' : `/${roleId}`}`,
      skipFetch: isNewRole,
    })
  const [formData, setFormData] = useState<UpsertMemberRole>({
    roleId: '',
    description: '',
    isPublic: false,
    permissions: [],
  })

  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (data) {
      setFormData(data)
    }
  }, [data])

  const navigate = useNavigate()

  const handleCancel = () => {
    navigate('/members/roles')
  }

  const handleRemove = async () => {
    try {
      await remove.trigger()
      // clear list of roles in cache
      mutate((key) => Array.isArray(key) && key[0] == 'v1/members/roles')
      navigate('/members/roles')
    } catch {
      setErrorMsg(remove.error?.message ?? 'Error')
      console.error('Error removing role:', remove.error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    const op = isNewRole ? create : update

    try {
      await op.trigger(formData)
      // clear list of roles in cache
      mutate((key) => Array.isArray(key) && key[0] == 'v1/members/roles')

      navigate('/members/roles')
    } catch {
      setErrorMsg(op.error?.message ?? 'Error')
      console.error('Error modifying role:', op.error)
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
        {data?.roleId ?? t('roles.newRole')}
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
      ) : error ? (
        <Typography variant='h6' color='error' align='center'>
          {t('error.loadingRoleData', 'Error loading role data.')}
        </Typography>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            <Card sx={{ flex: 1, position: 'relative' }}>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      required
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
                        key={permission}
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

            {data && (
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
            )}

            <Grid size={12} justifyContent='space-between' display='flex'>
              <Grid>
                {!isNewRole && (
                  <Button
                    color='secondary'
                    variant='outlined'
                    disabled={remove.isMutating}
                    onClick={handleRemove}
                    startIcon={
                      remove.isMutating ? <CircularProgress size={20} /> : null
                    }
                  >
                    {t('general.delete', 'Delete')}
                  </Button>
                )}
              </Grid>

              <Grid display='flex' gap={2}>
                <Button onClick={handleCancel} color='inherit'>
                  {t('general.cancel', 'Cancel')}
                </Button>
                <Button
                  type='submit'
                  color='primary'
                  variant='contained'
                  disabled={create.isMutating || update.isMutating}
                  startIcon={
                    create.isMutating || update.isMutating ? (
                      <CircularProgress size={20} />
                    ) : null
                  }
                >
                  {t('general.save', 'Save')}
                </Button>
              </Grid>
            </Grid>
            {errorMsg.length > 0 && (
              <Grid
                alignItems='center'
                display='flex'
                sx={{ mr: 10, fontSize: 24 }}
              >
                <Typography color='error' variant='body2'>
                  {errorMsg}
                </Typography>
              </Grid>
            )}
          </Stack>
        </form>
      )}
    </Box>
  )
}

export default MemberRoleEditor
