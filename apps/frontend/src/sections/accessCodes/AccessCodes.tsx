import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Grid,
  Typography,
  IconButton,
  Button,
  useTheme,
  Chip,
  useMediaQuery,
  CircularProgress,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useRoles } from '../../hooks/useRoles'
import { SecretDialog } from './SecretDialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { Secret, SecretsListResponse } from '@mik/contracts/secrets'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'

// Pie-style countdown timer component
interface CountdownTimerProps {
  duration: number
  onComplete: () => void
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ duration, onComplete }) => {
  const [timeLeft, setTimeLeft] = useState(duration)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [onComplete])

  const progress = (timeLeft / duration) * 100

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', ml: 1 }}>
      <CircularProgress
        variant='determinate'
        value={progress}
        size={20}
        thickness={6}
        sx={{
          color: (theme) => theme.palette.warning.main,
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round',
          },
        }}
      />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant='caption'
          component='div'
          sx={{
            fontSize: '0.6rem',
            fontWeight: 'bold',
            color: (theme) => theme.palette.warning.main,
          }}
        >
          {timeLeft}
        </Typography>
      </Box>
    </Box>
  )
}

export const AccessCodes: React.FC = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { isAccessCodesAdmin } = useRoles()

  const { data, error, isLoading, mutate } = useApi<SecretsListResponse>({
    url: 'v1/secrets',
  })

  const [visibleSecrets, setVisibleSecrets] = useState<Set<number>>(new Set())
  const [secretTimers, setSecretTimers] = useState<Map<number, NodeJS.Timeout>>(new Map())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null)

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      secretTimers.forEach((timer) => clearTimeout(timer))
    }
  }, [secretTimers])

  const { mutation: deleteMutation } = useApi<SecretsListResponse>({
    url: 'v1/secrets/' + secretToDelete?.id,
    skipFetch: true,
  })

  const handleDelete = async () => {
    await deleteMutation.trigger('DELETE', {})
  }

  const toggleSecretVisibility = (id: number) => {
    const newVisible = new Set(visibleSecrets)
    const newTimers = new Map(secretTimers)

    if (newVisible.has(id)) {
      // Hide the secret
      newVisible.delete(id)
      // Clear any existing timer
      if (newTimers.has(id)) {
        clearTimeout(newTimers.get(id)!)
        newTimers.delete(id)
      }
    } else {
      // Show the secret
      newVisible.add(id)

      // Clear any existing timer first
      if (newTimers.has(id)) {
        clearTimeout(newTimers.get(id)!)
      }

      // Set up auto-hide timer for 10 seconds
      const timer = setTimeout(() => {
        setVisibleSecrets((prev) => {
          const updated = new Set(prev)
          updated.delete(id)
          return updated
        })
        setSecretTimers((prev) => {
          const updated = new Map(prev)
          updated.delete(id)
          return updated
        })
      }, 10000)

      newTimers.set(id, timer)
    }

    setVisibleSecrets(newVisible)
    setSecretTimers(newTimers)
  }

  const handleNewSecret = () => {
    setEditingSecret(null)
    setDialogOpen(true)
  }

  const handleEditSecret = (secret: Secret) => {
    setEditingSecret(secret)
    setDialogOpen(true)
  }

  const handleDeleteSecret = (secret: Secret) => {
    setSecretToDelete(secret)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!secretToDelete) return
    await handleDelete()
    mutate() // Refresh the list
    setVisibleSecrets((prev) => {
      const newSet = new Set(prev)
      newSet.delete(secretToDelete.id)
      return newSet
    })

    setDeleteConfirmOpen(false)
    setSecretToDelete(null)
  }

  const handleDialogSuccess = () => {
    mutate() // Refresh the list
    setDialogOpen(false)
    setEditingSecret(null)
  }

  const renderSecretRow = (secret: Secret) => {
    const isVisible = visibleSecrets.has(secret.id)
    return (
      <>
        <Grid size={{ xs: 12, sm: 6 }}>{secret.secretKey}</Grid>
        <Grid size={{ xs: isAccessCodesAdmin ? 10 : 12, sm: 4 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => toggleSecretVisibility(secret.id)}
          >
            {isVisible ? (
              <>
                <Typography
                  component='span'
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: { xs: '0.875rem', md: '1rem' },
                    wordBreak: 'break-all',
                  }}
                >
                  {secret.secretValue}
                </Typography>
                <CountdownTimer
                  duration={10}
                  onComplete={() => {
                    setVisibleSecrets((prev) => {
                      const updated = new Set(prev)
                      updated.delete(secret.id)
                      return updated
                    })
                    setSecretTimers((prev) => {
                      const updated = new Map(prev)
                      updated.delete(secret.id)
                      return updated
                    })
                  }}
                />
              </>
            ) : (
              <Typography
                component='span'
                sx={{
                  color: theme.palette.text.secondary,
                  letterSpacing: '0.1em',
                  fontSize: { xs: '1rem', md: '1.2rem' },
                }}
              >
                •••••••
              </Typography>
            )}

            <Chip
              size='small'
              label={isVisible ? t('accessCodes.hideValue') : t('accessCodes.showValue')}
              variant='outlined'
              sx={{
                fontSize: '0.75rem',
                height: 24,
                display: { xs: 'none', sm: 'flex' },
              }}
            />
          </Box>
        </Grid>
        {isAccessCodesAdmin && (
          <Grid
            size={{ xs: 2, md: 2 }}
            sx={{
              textAlign: 'right',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                justifyContent: 'flex-end',
              }}
            >
              <IconButton
                size='small'
                onClick={() => handleEditSecret(secret)}
                title={t('accessCodes.editSecret')}
                sx={{
                  color: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.primary.main + '10',
                  },
                }}
              >
                <Icon icon='mdi:pencil' />
              </IconButton>

              <IconButton
                size='small'
                onClick={() => handleDeleteSecret(secret)}
                title={t('accessCodes.deleteSecret')}
                disabled={deleteMutation.isMutating}
                sx={{
                  color: theme.palette.error.main,
                  '&:hover': {
                    backgroundColor: theme.palette.error.main + '10',
                  },
                }}
              >
                <Icon icon='mdi:delete' />
              </IconButton>
            </Box>
          </Grid>
        )}
      </>
    )
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Title label={t('accessCodes.title')}>
        {isAccessCodesAdmin && (
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={handleNewSecret}
            size={isMobile ? 'medium' : 'large'}
            sx={{ minWidth: { xs: '100%', sm: 'auto' } }}
          >
            {t('accessCodes.addSecret')}
          </Button>
        )}
      </Title>
      {isAccessCodesAdmin && data?.secrets.some((s) => s.secretClass === 'BOARD') && (
        <Typography
          variant='subtitle1'
          sx={{
            fontWeight: 'bold',
            mt: 1,
            mb: 0.5,
          }}
        >
          {t('accessCodes.memberSecretsTitle')}
        </Typography>
      )}
      <ResponsiveTable
        notFoundMsg={t('accessCodes.noSecrets')}
        rows={data?.secrets.filter((s) => !isAccessCodesAdmin || s.secretClass === 'MEMBER')}
        rowProps={() => ({
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
        })}
        row={renderSecretRow}
      />
      {isAccessCodesAdmin && data?.secrets.some((s) => s.secretClass === 'BOARD') && (
        <>
          <Typography
            variant='subtitle1'
            sx={{
              fontWeight: 'bold',
              mt: 2,
              mb: 0.5,
            }}
          >
            {t('accessCodes.boardSecretsTitle')}
          </Typography>
          <ResponsiveTable
            notFoundMsg={t('accessCodes.noSecrets')}
            rows={data?.secrets.filter((s) => s.secretClass === 'BOARD')}
            rowProps={() => ({
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            })}
            row={renderSecretRow}
          />
        </>
      )}
      <SecretDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleDialogSuccess}
        secret={editingSecret}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title={t('accessCodes.deleteSecret')}
        message={t('accessCodes.confirmDelete')}
        confirmText={t('general.delete')}
        cancelText={t('general.cancel')}
        severity='error'
      />
    </RemoteContent>
  )
}
