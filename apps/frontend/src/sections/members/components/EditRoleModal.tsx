import {
  CircularProgress,
  Card,
  CardContent,
  Typography,
  Stack,
  Grid,
  Checkbox,
  FormControlLabel,
  TextField,
  Button,
  FormGroup,
  DialogActions,
  DialogContent,
  Dialog,
  useMediaQuery,
  useTheme,
  Alert,
} from '@mui/material'
import useApi, { APIMutation } from '../../../hooks/useApi'
import {
  UpsertMemberRole,
  MemberRole,
  MIKPermissions,
  MIKLang,
} from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { AuditFormField } from './AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import { useRoles } from '../../../hooks/useRoles'
import { mutate } from 'swr'
import { EditDialogTitle } from './EditDialogTitle'

export const MemberRoleEditor = ({
  role,
  onClose,
}: {
  role: UpsertMemberRole | undefined
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNewRole = role?.roleId === ''

  const { permissions } = useRoles()

  const { create, update, remove } = useApi<UpsertMemberRole>({
    url: `v1/members/roles${isNewRole ? '' : `/${role?.roleId}`}`,
    skipFetch: true,
  })
  const [formData, setFormData] = useState<UpsertMemberRole>({
    roleId: '',
    name: {
      en: '',
      fi: '',
    },
    description: '',
    isPublic: false,
    permissions: [],
  })

  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (role) {
      setErrorMsg('')
      setFormData({
        ...role,
        description: role.description ?? '',
      })
    }
  }, [role])

  const trigger = async (api: APIMutation<UpsertMemberRole>) => {
    setErrorMsg('')

    try {
      await api.trigger(formData)

      // clear the cache for roles list
      mutate((key) => Array.isArray(key) && key[0] == 'v1/members/roles')

      onClose()
    } catch {
      setErrorMsg(api.error?.message ?? 'Error')
      console.error('Error modifying role:', api.error)
    }
  }

  const handleRemove = async () => trigger(remove)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    await trigger(isNewRole ? create : update)
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

  const handleChangeName =
    (lang: MIKLang) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        ['name']: {
          ...prev.name,
          [lang]: e.target.value,
        },
      }))
    }

  const editorCard = () => (
    <Card sx={{ flex: 1, position: 'relative' }}>
      <CardContent>
        <Grid container spacing={2}>
          <TextField
            fullWidth
            required
            label={t('roles.roleId')}
            value={formData.roleId || ''}
            onChange={handleChange('roleId')}
          />
          <TextField
            fullWidth
            required
            label={t('roles.description')}
            value={formData.description || ''}
            onChange={handleChange('description')}
          />
          <TextField
            fullWidth
            required
            label={t('roles.name.en')}
            value={formData.name[MIKLang.EN] || ''}
            onChange={handleChangeName(MIKLang.EN)}
          />
          <TextField
            fullWidth
            required
            label={t('roles.name.fi')}
            value={formData.name[MIKLang.FI] || ''}
            onChange={handleChangeName(MIKLang.FI)}
          />
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
  )

  const permissionsCard = () => (
    <Card>
      <CardContent>
        <FormTitle
          title={t('roles.permissions')}
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
                      formData.permissions?.includes(permission) ?? false
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
  )

  const detailsCard = () =>
    role && (
      <Card>
        <CardContent>
          <FormTitle title={t('roles.details')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <AuditFormField
              label={t('member.created')}
              by={role.createdBy}
              at={role.createdAt}
            />

            <AuditFormField
              label={t('member.updated')}
              by={role.updatedBy}
              at={role.updatedAt}
            />
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={role !== undefined}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit,
        },
      }}
    >
      <EditDialogTitle
        title={isNewRole ? 'roles.newRole' : 'roles.editRole'}
        onClose={onClose}
      />

      <DialogContent dividers>
        <Stack spacing={3}>
          {editorCard()}

          {permissionsCard()}

          {!isNewRole && detailsCard()}

          {errorMsg.length > 0 && <Alert severity='error'>{errorMsg}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Grid
          size={12}
          justifyContent='space-between'
          display='flex'
          flexGrow={1}
        >
          <Grid>
            {!isNewRole && (
              <Button
                color='secondary'
                variant='outlined'
                onClick={handleRemove}
                disabled={remove.isMutating}
                startIcon={
                  remove.isMutating ? <CircularProgress size={20} /> : null
                }
              >
                {t('general.delete', 'Delete')}
              </Button>
            )}
          </Grid>

          <Grid display='flex' gap={2}>
            <Button onClick={onClose} color='inherit'>
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
      </DialogActions>
    </Dialog>
  )
}
