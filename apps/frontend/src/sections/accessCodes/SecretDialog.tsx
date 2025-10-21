import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type {
  Secret,
  SecretsListResponse,
} from '@backend/routes/secrets/models'
import useApi from '../../hooks/useApi'
import { SaveButton } from '../../components/SaveButton'
import { Problem } from '@backend/routes/response'
import { SnackAlert } from '../../components/SnackAlert'

interface SecretDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  secret?: Secret | null
}

export const SecretDialog: React.FC<SecretDialogProps> = ({
  open,
  onClose,
  onSuccess,
  secret,
}) => {
  const { t } = useTranslation()

  const { isLoading, mutation } = useApi<SecretsListResponse>({
    url: 'v1/secrets' + (secret ? `/${secret.id}` : ''),
    skipFetch: true,
  })

  const [formData, setFormData] = useState({
    secretKey: '',
    secretValue: '',
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
        })
      } else {
        setFormData({
          secretKey: '',
          secretValue: '',
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
    }

    const { error } = await mutation.trigger(
      isEditMode && secret ? 'PATCH' : 'POST',
      secretData
    )
    if (error) {
      return setErrors((prev) => ({
        ...prev,
        problem: error,
      }))
    }
    onSuccess()
  }

  const handleChange =
    (field: keyof typeof formData) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: event.target.value,
      }))

      // Clear error when user starts typing
      if (errors[field]) {
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
      PaperProps={{
        sx: { minHeight: '300px' },
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
