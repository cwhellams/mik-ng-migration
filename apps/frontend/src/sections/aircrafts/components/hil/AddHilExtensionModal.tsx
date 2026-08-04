import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { AircraftHilDetail } from '@backend/routes/aircraft-hil/models'
import type { Problem } from '@backend/routes/response'
import { EditDialogTitle } from '../../../../components/EditDialogTitle'
import { SaveButton } from '../../../../components/SaveButton'
import { SnackAlert } from '../../../../components/SnackAlert'
import useApi from '../../../../hooks/useApi'
import { refreshAircraftHil } from './useAircraftHil'

interface AddHilExtensionModalProps {
  hil: AircraftHilDetail | undefined
  onClose: () => void
}

export const AddHilExtensionModal = ({ hil, onClose }: AddHilExtensionModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const api = useApi({
    url: `v1/aircraft-hil/${hil?.hilId}/extensions`,
    skipFetch: true,
  })

  const [extensionDate, setExtensionDate] = useState<Dayjs | null>(null)
  const [extensionDue, setExtensionDue] = useState<Dayjs | null>(null)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<Problem | undefined>()

  useEffect(() => {
    setProblem(undefined)
    setExtensionDate(dayjs())
    setExtensionDue(null)
    setName('')
  }, [hil])

  const handleSave = async () => {
    if (!extensionDate || !extensionDue || !name.trim()) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.hil.requiredFields'),
        status: 400,
      })
      return
    }

    setProblem(undefined)

    const { error } = await api.mutation.trigger('POST', {
      extensionDate: extensionDate.toISOString(),
      extensionDue: extensionDue.toISOString(),
      name: name.trim(),
    })

    if (error) {
      setProblem(error)
      return
    }

    await refreshAircraftHil()
    onClose()
  }

  if (!hil) return null

  return (
    <Dialog open={!!hil} onClose={onClose} maxWidth='sm' fullWidth fullScreen={isXs}>
      <EditDialogTitle title={t('aircraft.hil.addExtension')} onClose={onClose} />
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <SnackAlert problem={problem} />

          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {t('aircraft.hil.extensionFor', {
              hilNumber: hil.hilNumber,
              description: hil.description,
              dueDate: dayjs(hil.effectiveDueDate).format('DD.MM.YYYY'),
            })}
          </Typography>

          <DatePicker
            label={t('aircraft.hil.extensionDate')}
            value={extensionDate}
            onChange={setExtensionDate}
            slotProps={{ textField: { fullWidth: true, required: true } }}
          />

          <DatePicker
            label={t('aircraft.hil.extensionDue')}
            value={extensionDue}
            onChange={setExtensionDue}
            minDate={extensionDate ?? undefined}
            slotProps={{
              textField: {
                fullWidth: true,
                required: true,
                helperText: t('aircraft.hil.extensionDueHelp'),
              },
            }}
          />

          <TextField
            label={t('aircraft.hil.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            helperText={t('aircraft.hil.nameHelp')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('general.cancel')}</Button>
        <SaveButton onClick={handleSave} disabled={api.mutation.isMutating} />
      </DialogActions>
    </Dialog>
  )
}
