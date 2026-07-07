import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  InputAdornment,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import useApi from '../../hooks/useApi'
import type { Defect } from '@backend/routes/defects/models'
import { SaveButton } from '../../components/SaveButton'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'

const AddDefectFormSchema = z.object({
  description: z.string().min(1),
  flightHours: z.coerce.number().int().min(0),
  flightMinutes: z.coerce.number().int().min(0).max(59),
  blankRowsAfter: z.coerce.number().int().min(0),
})

type AddDefectFormValues = z.infer<typeof AddDefectFormSchema>

interface AddDefectDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  aircraftRegistration: string
  ajlbSeqNo: number
  flightId: string | null
  defaultFlightMins?: number
}

export const AddDefectDialog: React.FC<AddDefectDialogProps> = ({
  open,
  onClose,
  onSuccess,
  aircraftRegistration,
  ajlbSeqNo,
  flightId,
  defaultFlightMins,
}) => {
  const { t } = useTranslation()
  const [problem, setProblem] = useState<Problem | undefined>()
  const isPreFlight = flightId === null

  const { mutation } = useApi<Defect>({
    url: 'v1/defects',
    skipFetch: true,
  })

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddDefectFormValues>({
    resolver: zodResolver(AddDefectFormSchema),
    defaultValues: {
      description: '',
      flightHours: defaultFlightMins !== undefined ? Math.floor(defaultFlightMins / 60) : 0,
      flightMinutes: defaultFlightMins !== undefined ? defaultFlightMins % 60 : 0,
      blankRowsAfter: 0,
    },
  })

  useEffect(() => {
    if (open) {
      setProblem(undefined)
      reset({
        description: '',
        flightHours: defaultFlightMins !== undefined ? Math.floor(defaultFlightMins / 60) : 0,
        flightMinutes: defaultFlightMins !== undefined ? defaultFlightMins % 60 : 0,
        blankRowsAfter: 0,
      })
    }
  }, [open, defaultFlightMins, reset])

  const onSubmit = async (values: AddDefectFormValues) => {
    const { error } = await mutation.trigger('POST', {
      aircraftRegistration,
      ajlbSeqNo,
      flightId: flightId ?? undefined,
      description: values.description,
      flightMins: values.flightHours * 60 + values.flightMinutes,
      blankRowsAfter: isPreFlight ? values.blankRowsAfter : 0,
    })

    if (error) {
      setProblem(error)
      return
    }

    onSuccess()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        {isPreFlight
          ? t('flightLog.defects.addPreFlightTitle')
          : t('flightLog.defects.addInFlightTitle')}
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <SnackAlert problem={problem} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Controller
              name='description'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('flightLog.defects.description')}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  fullWidth
                  required
                  autoFocus
                  multiline
                  minRows={2}
                />
              )}
            />

            {isPreFlight && (
              <>
                <Box>
                  <Typography variant='body2' color='text.secondary' gutterBottom>
                    {t('flightLog.defects.flightTime')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Controller
                      name='flightHours'
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={t('flightLog.maintenanceNotes.hours')}
                          type='number'
                          error={!!errors.flightHours}
                          helperText={errors.flightHours?.message}
                          InputProps={{
                            endAdornment: <InputAdornment position='end'>h</InputAdornment>,
                          }}
                          inputProps={{ min: 0 }}
                          sx={{ flex: 1 }}
                        />
                      )}
                    />
                    <Controller
                      name='flightMinutes'
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={t('flightLog.maintenanceNotes.minutes')}
                          type='number'
                          error={!!errors.flightMinutes}
                          helperText={errors.flightMinutes?.message}
                          InputProps={{
                            endAdornment: <InputAdornment position='end'>min</InputAdornment>,
                          }}
                          inputProps={{ min: 0, max: 59 }}
                          sx={{ flex: 1 }}
                        />
                      )}
                    />
                  </Box>
                </Box>

                <Controller
                  name='blankRowsAfter'
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('flightLog.maintenanceNotes.blankRowsAfter')}
                      type='number'
                      error={!!errors.blankRowsAfter}
                      helperText={
                        errors.blankRowsAfter?.message ??
                        t('flightLog.maintenanceNotes.blankRowsAfterHelp')
                      }
                      fullWidth
                      inputProps={{ min: 0 }}
                    />
                  )}
                />
              </>
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
