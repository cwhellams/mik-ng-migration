import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { Secret, SecretsListResponse, SecretClass } from '@mik/contracts/secrets'
import useApi from '../../hooks/useApi'
import { SaveButton } from '../../components/SaveButton'
import { Problem } from '@mik/contracts/problem'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { useRoles } from '../../hooks/useRoles'

interface SecretDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  secret?: Secret | null
}

export const SecretDialog: React.FC<SecretDialogProps> = ({ open, onClose, onSuccess, secret }) => {
  const { t } = useTranslation()
  const { isAccessCodesAdmin } = useRoles()

  const { isLoading, mutation } = useApi<SecretsListResponse>({
    url: 'v1/secrets' + (secret ? `/${secret.id}` : ''),
    skipFetch: true,
  })

  const [formData, setFormData] = useState({
    secretKey: '',
    secretValue: '',
    secretClass: 'MEMBER' as SecretClass,
  })
  const [errors, setErrors] = useState({
    secretKey: '',
    secretValue: '',
    problem: undefined as Problem | undefined,
  })

  const isEditMode = !!secret

  useEffect(() => {
    if (open) {
      if (secret) {
        setFormData({
          secretKey: secret.secretKey,
          secretValue: secret.secretValue,
          secretClass: secret.secretClass,
        })
      } else {
        setFormData({
          secretKey: '',
          secretValue: '',
          secretClass: 'MEMBER',
        })
      }
      setErrors({
        secretKey: '',
        secretValue: '',
        problem: undefined,
      })
    }
  }, [open, secret])

  const validateForm = () => {
    const newErrors = {
      secretKey: '',
      secretValue: '',
      problem: undefined,
    }

    if (!formData.secretKey.trim()) {
      newErrors.secretKey = t('accessCodes.secretKeyRequired')
    }

    if (!formData.secretValue.trim()) {
      newErrors.secretValue = t('accessCodes.secretValueRequired')
    }

    setErrors(newErrors)
    return !newErrors.secretKey && !newErrors.secretValue
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    const secretData = {
      secretKey: formData.secretKey.trim(),
      secretValue: formData.secretValue.trim(),
      secretClass: formData.secretClass,
    }

    const { error } = await mutation.trigger(isEditMode && secret ? 'PATCH' : 'POST', secretData)
    if (error) {
      return setErrors((prev) => ({
        ...prev,
        problem: error,
      }))
    }
    onSuccess()
  }

  const handleChange =
    (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: event.target.value,
      }))

      // Clear error when user starts typing
      if (field in errors && errors[field as keyof typeof errors]) {
        setErrors((prev) => ({
          ...prev,
          [field]: '',
        }))
      }
    }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      slotProps={{
        paper: {
          sx: { minHeight: '300px' },
        },
      }}
    >
      <DialogTitle>
        {isEditMode ? t('accessCodes.editSecret') : t('accessCodes.addSecret')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <SnackAlert problem={errors.problem} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('accessCodes.secretKey')}
              value={formData.secretKey}
              onChange={handleChange('secretKey')}
              error={!!errors.secretKey}
              helperText={errors.secretKey}
              fullWidth
              required
              autoFocus
              disabled={isLoading}
            />

            <TextField
              label={t('accessCodes.secretValue')}
              value={formData.secretValue}
              onChange={handleChange('secretValue')}
              error={!!errors.secretValue}
              helperText={errors.secretValue}
              fullWidth
              required
              multiline
              rows={3}
              disabled={isLoading}
            />

            {isAccessCodesAdmin && (
              <FormControl>
                <FormLabel>{t('accessCodes.secretClass')}</FormLabel>
                <RadioGroup row value={formData.secretClass} onChange={handleChange('secretClass')}>
                  <FormControlLabel
                    value='MEMBER'
                    control={<Radio />}
                    label={t('accessCodes.memberClass')}
                  />
                  <FormControlLabel
                    value='BOARD'
                    control={<Radio />}
                    label={t('accessCodes.boardClass')}
                  />
                </RadioGroup>
              </FormControl>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={onClose} variant='outlined'>
            {t('general.cancel')}
          </Button>

          <SaveButton loading={mutation.isMutating} />
        </DialogActions>
      </form>
    </Dialog>
  )
}
